begin;
-- Creator autonomy: an owner can withdraw their own publication, but never self-publish.
create function public.video_creator_unpublish(p_review_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Unauthorized' using errcode='42501';end if;
 update public.video_publications p set revoked_at=now()
 where p.review_id=p_review_id and p.revoked_at is null
   and exists (select 1 from public.video_review r where
      r.id=p.review_id and r.owner_id=auth.uid());
 if not found then raise exception 'Not eligible' using errcode='42501';end if;
end $$;
revoke all on function public.video_creator_unpublish(uuid) from public,anon,authenticated;
grant execute on function public.video_creator_unpublish(uuid) to authenticated;
commit;
