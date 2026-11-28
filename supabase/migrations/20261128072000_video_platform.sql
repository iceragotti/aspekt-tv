begin;
-- Phase 6.5: public catalog is a deliberate projection of active publications.
-- Neither unpublished metadata nor private Storage paths are exposed.
create table public.video_channels (
 owner_id uuid primary key default auth.uid() references auth.users(id),
 handle text not null unique check (handle ~ '^[a-z0-9][a-z0-9_-]{2,29}$'),
 display_name text not null check (length(btrim(display_name)) between 1 and 80),
 description text not null default '' check (length(description)<=500),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.video_channels enable row level security;
revoke all on public.video_channels from public,anon,authenticated;
grant select on public.video_channels to authenticated;
grant insert(handle,display_name,description),update(handle,display_name,description) on public.video_channels to authenticated;
create policy video_channels_owner on public.video_channels for all to authenticated
 using (owner_id=auth.uid()) with check (owner_id=auth.uid());

alter table public.video_review add constraint video_review_id_owner_unique unique(id,owner_id);
create table public.video_metadata (
 review_id uuid primary key,
 owner_id uuid not null default auth.uid(),
 title text not null check(length(btrim(title)) between 1 and 120),
 description text not null default '' check(length(description)<=2000),
 kind text not null default 'video' check(kind in ('video','short')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 foreign key(review_id,owner_id) references public.video_review(id,owner_id) on delete cascade
);
alter table public.video_metadata enable row level security;
revoke all on public.video_metadata from public,anon,authenticated;
grant select on public.video_metadata to authenticated;
create policy video_metadata_own_read on public.video_metadata for select to authenticated using(owner_id=auth.uid());

-- Metadata edits are server-validated. Published videos cannot be silently relabeled.
create function public.video_save_metadata(p_review_id uuid,p_title text,p_description text,p_kind text)
returns void language plpgsql security definer set search_path='' as $$
declare r public.video_review%rowtype;
begin
 if auth.uid() is null or length(btrim(coalesce(p_title,''))) not between 1 and 120
  or length(coalesce(p_description,''))>2000 or p_kind not in ('video','short')
 then raise exception 'Invalid metadata' using errcode='42501'; end if;
 select * into r from public.video_review where id=p_review_id for update;
 if not found or r.owner_id<>auth.uid() or r.state not in ('quarantine','validated')
   or exists(select 1 from public.video_publications p
             where p.review_id=p_review_id and p.revoked_at is null)
 then raise exception 'Not editable' using errcode='42501'; end if;
 insert into public.video_metadata(review_id,owner_id,title,description,kind)
 values(p_review_id,auth.uid(),btrim(p_title),coalesce(p_description,''),p_kind)
 on conflict(review_id) do update set title=excluded.title,
 description=excluded.description,kind=excluded.kind,updated_at=now();
end $$;
revoke all on function public.video_save_metadata(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.video_save_metadata(uuid,text,text,text) to authenticated;

-- Owner library contains review & publication state; never exposes processed paths.
create function public.video_my_library()
returns table(
 id uuid,title text,description text,kind text,status text,
 published boolean,created_at timestamptz
) language sql stable security definer set search_path='' as $$
 select r.id, coalesce(m.title,'Unbenannt')::text,
 coalesce(m.description,'')::text,coalesce(m.kind,'video')::text,
 r.state::text,
 (p.review_id is not null and p.revoked_at is null)::boolean,
 coalesce(m.created_at,r.validated_at,now())::timestamptz
 from public.video_review r
 left join public.video_metadata m on m.review_id=r.id
 left join public.video_publications p on p.review_id=r.id
 where auth.uid() is not null and r.owner_id=auth.uid()
 order by coalesce(m.created_at,r.validated_at,now()) desc,r.id desc
 limit 100
$$;
revoke all on function public.video_my_library() from public,anon,authenticated;
grant execute on function public.video_my_library() to authenticated;

-- All rows are checked against moderation approval AND explicit active publication.
-- A published video only enters the public catalog when its owner has a channel.
create function public.video_public_catalog()
returns table(
 id uuid,title text,description text,kind text,channel_handle text,
 channel_name text,channel_description text,published_at timestamptz
) language sql stable security definer set search_path='' as $$
 select r.id,m.title,m.description,m.kind,
        c.handle,c.display_name,c.description,p.published_at
 from public.video_publications p
 join public.video_review r on r.id=p.review_id
 join public.video_metadata m on m.review_id=r.id and m.owner_id=r.owner_id
 join public.video_channels c on c.owner_id=r.owner_id
 where p.revoked_at is null and r.state='approved' and r.processed_path is not null
 order by p.published_at desc,r.id desc
 limit 100
$$;
revoke all on function public.video_public_catalog() from public,anon,authenticated;
grant execute on function public.video_public_catalog() to anon,authenticated;
commit;
