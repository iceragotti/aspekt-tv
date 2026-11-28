begin;
-- Private processing queue: service-role only, bounded retries and expiring leases.
create table public.video_processing_jobs (
 id uuid primary key default gen_random_uuid(),
 review_id uuid not null unique references public.video_review(id) on delete cascade,
 state text not null default 'queued' check (state in ('queued','processing','retry','done','dead')),
 attempts integer not null default 0 check (attempts between 0 and 3),
 available_at timestamptz not null default now(),
 lease_token uuid,
 lease_until timestamptz,
 output_path text,
 last_error text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check ((state='processing')=(lease_token is not null and lease_until is not null))
);
create index video_processing_claim_idx on public.video_processing_jobs(state,available_at,created_at);
alter table public.video_processing_jobs enable row level security;
revoke all on public.video_processing_jobs from public,anon,authenticated;
grant select,insert,update on public.video_processing_jobs to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('aspekt-video-processed','aspekt-video-processed',false,52428800,array['video/mp4'])
on conflict (id) do nothing;
-- Intentionally no RLS policies on processed objects for anon/authenticated.

alter table public.video_review add column processed_path text unique;
alter table public.video_review add constraint video_processed_path_format
check (processed_path is null or processed_path = id::text || '/output.mp4');

create function public.video_job_on_upload() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into public.video_processing_jobs(review_id) values (new.id) on conflict do nothing;
 return new;
end $$;
revoke all on function public.video_job_on_upload() from public,anon,authenticated;
create trigger video_job_on_upload after insert on public.video_review
for each row execute function public.video_job_on_upload();
insert into public.video_processing_jobs(review_id)
select id from public.video_review where state='quarantine' on conflict do nothing;

create function public.video_job_claim()
returns table(job_id uuid,review_id uuid,owner_id uuid,object_path text,lease_token uuid,attempts integer)
language plpgsql security definer set search_path='' as $$
begin
 if auth.role() is distinct from 'service_role' then
  raise exception 'Forbidden' using errcode='42501';
 end if;
 return query
 with picked as (
  select j.id from public.video_processing_jobs j
  join public.video_review r on r.id=j.review_id
  where r.state='quarantine' and j.attempts<3
    and ((j.state in ('queued','retry') and j.available_at<=now())
         or (j.state='processing' and j.lease_until<now()))
  order by j.created_at,j.id limit 1 for update of j skip locked
 ), claimed as (
  update public.video_processing_jobs j
  set state='processing',attempts=j.attempts+1,lease_token=gen_random_uuid(),
      lease_until=now()+interval '3 minutes',updated_at=now()
  from picked where j.id=picked.id
  returning j.id,j.review_id,j.lease_token,j.attempts
 )
 select c.id,c.review_id,r.owner_id,r.object_path,c.lease_token,c.attempts
 from claimed c join public.video_review r on r.id=c.review_id;
end $$;

create function public.video_job_finish(
 p_job_id uuid,p_lease uuid,p_output_path text default null,
 p_error text default null,p_terminal boolean default false
) returns text language plpgsql security definer set search_path='' as $$
declare v public.video_processing_jobs%rowtype; v_review public.video_review%rowtype;
begin
 if auth.role() is distinct from 'service_role' then
  raise exception 'Forbidden' using errcode='42501';
 end if;
 select * into v from public.video_processing_jobs
 where id=p_job_id and state='processing' and lease_token=p_lease
   and lease_until>now() for update;
 if not found then raise exception 'Stale or expired lease' using errcode='42501'; end if;
 select * into v_review from public.video_review where id=v.review_id for update;
 if v_review.state<>'quarantine' then raise exception 'Review is not quarantined';end if;
 if p_output_path is not null then
   if p_error is not null or p_output_path<>v.review_id::text||'/output.mp4' then
    raise exception 'Invalid processed asset path';
   end if;
   if not exists(select 1 from storage.objects o where
      o.bucket_id='aspekt-video-processed' and o.name=p_output_path)
   then raise exception 'Processed object missing';end if;
   update public.video_review
      set state='validated',validated_at=now(),processed_path=p_output_path
      where id=v.review_id;
   update public.video_processing_jobs
      set state='done',output_path=p_output_path,lease_token=null,lease_until=null,
          updated_at=now(),last_error=null where id=v.id;
   return 'done';
 end if;
 if p_error is null then raise exception 'Missing result';end if;
 if p_terminal or v.attempts>=3 then
  update public.video_review set state='rejected' where id=v.review_id;
  update public.video_processing_jobs
   set state='dead',lease_token=null,lease_until=null,last_error=left(p_error,200),updated_at=now()
   where id=v.id;
  return 'dead';
 end if;
 update public.video_processing_jobs
  set state='retry',lease_token=null,lease_until=null,last_error=left(p_error,200),
      available_at=now()+make_interval(secs=>power(2,v.attempts)::integer*15),updated_at=now()
  where id=v.id;
 return 'retry';
end $$;

-- Approval is not publication; the second deliberate staff action publishes.
create table public.video_publications (
 review_id uuid primary key references public.video_review(id) on delete cascade,
 published_by uuid not null references auth.users(id),
 published_at timestamptz not null default now(),
 revoked_at timestamptz
);
alter table public.video_publications enable row level security;
revoke all on public.video_publications from public,anon,authenticated;
grant select,insert,update on public.video_publications to service_role;

create function public.video_publish(p_review_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare r public.video_review%rowtype;
begin
 if auth.uid() is null or not public.trust_is_staff() then
  raise exception 'Forbidden' using errcode='42501';end if;
 select * into r from public.video_review where id=p_review_id for update;
 if not found or r.state<>'approved' or r.processed_path is null
    or r.owner_id=auth.uid() then raise exception 'Not eligible';end if;
 if not exists (select 1 from storage.objects o where
  o.bucket_id='aspekt-video-processed' and o.name=r.processed_path)
 then raise exception 'Processed object missing';end if;
 insert into public.video_publications(review_id,published_by,published_at,revoked_at)
 values(p_review_id,auth.uid(),now(),null)
 on conflict(review_id) do update
  set published_by=excluded.published_by,published_at=now(),revoked_at=null;
end $$;

create function public.video_revoke(p_review_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.trust_is_staff() then
  raise exception 'Forbidden' using errcode='42501';end if;
 update public.video_publications set revoked_at=now()
 where review_id=p_review_id and revoked_at is null;
 if not found then raise exception 'Not published';end if;
end $$;

revoke all on function public.video_job_claim() from public,anon,authenticated;
revoke all on function public.video_job_finish(uuid,uuid,text,text,boolean) from public,anon,authenticated;
grant execute on function public.video_job_claim() to service_role;
grant execute on function public.video_job_finish(uuid,uuid,text,text,boolean) to service_role;
revoke all on function public.video_publish(uuid) from public,anon,authenticated;
revoke all on function public.video_revoke(uuid) from public,anon,authenticated;
grant execute on function public.video_publish(uuid),public.video_revoke(uuid) to authenticated;
commit;
