begin;
-- 6.6: signed thumbnails remain private; only current, validated assets can receive a poster.
alter table public.video_review add column thumbnail_path text unique;
alter table public.video_review add constraint video_thumbnail_path_shape
check (thumbnail_path is null or thumbnail_path ~ ('^'||id::text||'/[0-9a-f-]{36}[.]jpg'||chr(36)));
-- The processed bucket is still private. No additional Storage SELECT policies are created.
update storage.buckets set allowed_mime_types=array['video/mp4','image/jpeg']
where id='aspekt-video-processed' and public=false;

create function public.video_set_thumbnail(p_review_id uuid,p_thumbnail_path text)
returns void language plpgsql security definer set search_path='' as $$
declare r public.video_review%rowtype;
begin
 if auth.role() is distinct from 'service_role' then
   raise exception 'Forbidden' using errcode='42501';
 end if;
 select * into r from public.video_review where id=p_review_id for update;
 if not found or r.state<>'validated' or r.processed_path is null then
   raise exception 'Not validated';end if;
 -- Only a JPEG from the exact same transcoding lease may be attached.
 if p_thumbnail_path<>regexp_replace(r.processed_path,'[.]mp4$','.jpg') then
   raise exception 'Invalid thumbnail path';end if;
 if not exists(select 1 from storage.objects where
   bucket_id='aspekt-video-processed' and name=p_thumbnail_path)
 then raise exception 'Thumbnail not found';end if;
 update public.video_review set thumbnail_path=p_thumbnail_path where id=p_review_id;
end $$;
revoke all on function public.video_set_thumbnail(uuid,text) from public,anon,authenticated;
grant execute on function public.video_set_thumbnail(uuid,text) to service_role;

-- New catalog variant returns only a boolean, never private paths.
drop function public.video_public_catalog();
create function public.video_public_catalog()
returns table(id uuid,title text,description text,kind text,channel_handle text,
 channel_name text,channel_description text,published_at timestamptz,has_thumbnail boolean)
language sql stable security definer set search_path='' as $$
 select r.id,m.title,m.description,m.kind,c.handle,c.display_name,c.description,
 p.published_at,(r.thumbnail_path is not null)
 from public.video_publications p
 join public.video_review r on r.id=p.review_id
 join public.video_metadata m on m.review_id=r.id and m.owner_id=r.owner_id
 join public.video_channels c on c.owner_id=r.owner_id
 where p.revoked_at is null and r.state='approved' and r.processed_path is not null
 order by p.published_at desc,r.id desc limit 100
$$;
revoke all on function public.video_public_catalog() from public,anon,authenticated;
grant execute on function public.video_public_catalog() to anon,authenticated;

-- Durable owner management status and thumbnail visibility; avoid exposing object paths.
drop function public.video_my_library();
create function public.video_my_library()
returns table(id uuid,title text,description text,kind text,status text,
 published boolean,created_at timestamptz,has_thumbnail boolean)
language sql stable security definer set search_path='' as $$
 select r.id,coalesce(m.title,'Unbenannt')::text,coalesce(m.description,'')::text,
 coalesce(m.kind,'video')::text,r.state::text,
 (p.review_id is not null and p.revoked_at is null)::boolean,
 coalesce(m.created_at,r.validated_at,now())::timestamptz,
 (r.thumbnail_path is not null)
 from public.video_review r
 left join public.video_metadata m on m.review_id=r.id
 left join public.video_publications p on p.review_id=r.id
 where auth.uid() is not null and r.owner_id=auth.uid()
 order by coalesce(m.created_at,r.validated_at,now()) desc,r.id desc limit 100
$$;
revoke all on function public.video_my_library() from public,anon,authenticated;
grant execute on function public.video_my_library() to authenticated;

-- Search executes on filtered, explicitly released catalog rows only.
create function public.video_search(p_term text default '',p_handle text default null,p_kind text default null)
returns table(id uuid,title text,description text,kind text,channel_handle text,
 channel_name text,channel_description text,published_at timestamptz,has_thumbnail boolean)
language sql stable security definer set search_path='' as $$
 select v.* from public.video_public_catalog() v
 where (length(btrim(coalesce(p_term,'')))=0 or
    strpos(lower(v.title),lower(left(btrim(p_term),80)))>0
    or strpos(lower(v.channel_name),lower(left(btrim(p_term),80)))>0)
 and (p_handle is null or v.channel_handle=p_handle)
 and (p_kind is null or v.kind=p_kind)
 order by v.published_at desc,v.id desc limit 100
$$;
revoke all on function public.video_search(text,text,text) from public,anon,authenticated;
grant execute on function public.video_search(text,text,text) to anon,authenticated;
commit;
