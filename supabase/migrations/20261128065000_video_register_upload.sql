begin;
-- Client may request a quarantine record only for an existing, own Storage object.
-- This function does not mark media as validated, approved or public.
create function public.video_register_upload(p_path text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 if auth.uid() is null or p_path is null or
    p_path !~ ('^' || auth.uid()::text || '/[0-9a-f-]{36}\\.(mp4|webm)$')
 then raise exception 'Invalid owner path' using errcode='42501'; end if;
 if not exists (
   select 1 from storage.objects o
   where o.bucket_id='aspekt-video-private' and o.name=p_path
     and o.owner_id=auth.uid()::text
 )
 then raise exception 'Private upload not found' using errcode='42501'; end if;
 insert into public.video_review(owner_id,object_path)
 values(auth.uid(),p_path) on conflict (object_path)
 do update set object_path=excluded.object_path
 returning id into v_id;
 return v_id;
end $$;
revoke all on function public.video_register_upload(text) from public, anon, authenticated;
grant execute on function public.video_register_upload(text) to authenticated;
commit;
