begin;
create table public.video_creator_profiles (
 owner_id uuid primary key default auth.uid() references auth.users(id),
 display_name text not null check(char_length(trim(display_name)) between 1 and 80)
);
alter table public.video_creator_profiles enable row level security;
revoke all on public.video_creator_profiles from public, anon, authenticated;
grant select on public.video_creator_profiles to authenticated;
grant insert(display_name), update(display_name) on public.video_creator_profiles to authenticated;
create policy video_creator_own on public.video_creator_profiles for all to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('aspekt-video-private','aspekt-video-private',false,20971520,array['video/mp4','video/webm']);
create policy video_private_insert on storage.objects for insert to authenticated
 with check(bucket_id='aspekt-video-private' and (storage.foldername(name))[1]=auth.uid()::text and array_length(storage.foldername(name),1)=1 and storage.extension(name) in ('mp4','webm'));
create policy video_private_read on storage.objects for select to authenticated
 using(bucket_id='aspekt-video-private' and (storage.foldername(name))[1]=auth.uid()::text);
create policy video_private_delete on storage.objects for delete to authenticated
 using(bucket_id='aspekt-video-private' and (storage.foldername(name))[1]=auth.uid()::text);
-- No public playback or publication policy. MIME metadata is not byte validation.
commit;
