begin;
-- Staff publication now requires complete creator-owned metadata and a channel.
create or replace function public.video_publish(p_review_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare r public.video_review%rowtype;
begin
 if auth.uid() is null or not public.trust_is_staff() then
  raise exception 'Forbidden' using errcode='42501';end if;
 select * into r from public.video_review where id=p_review_id for update;
 if not found or r.state<>'approved' or r.processed_path is null
   or r.owner_id=auth.uid() then raise exception 'Not eligible';end if;
 if not exists(select 1 from storage.objects o where
   o.bucket_id='aspekt-video-processed' and o.name=r.processed_path)
 then raise exception 'Processed object missing';end if;
 if not exists(select 1 from public.video_metadata m
   where m.review_id=r.id and m.owner_id=r.owner_id)
 or not exists(select 1 from public.video_channels c where c.owner_id=r.owner_id)
 then raise exception 'Creator channel and video metadata are required';end if;
 insert into public.video_publications(review_id,published_by,published_at,revoked_at)
 values(p_review_id,auth.uid(),now(),null)
 on conflict(review_id) do update
 set published_by=excluded.published_by,published_at=now(),revoked_at=null;
end $$;
revoke all on function public.video_publish(uuid) from public,anon,authenticated;
grant execute on function public.video_publish(uuid) to authenticated;
commit;
