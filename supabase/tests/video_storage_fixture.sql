-- Minimal PostgreSQL simulation of the Supabase storage metadata schema.
-- This is NOT a replacement for API-level Supabase Storage tests.
create schema storage;
create table storage.buckets(
 id text primary key, name text not null, public boolean not null default false,
 file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects(
 id uuid primary key default gen_random_uuid(),
 bucket_id text not null references storage.buckets(id),
 name text not null, owner_id text not null default auth.uid()::text,
 unique(bucket_id,name)
);
create function storage.foldername(path text) returns text[]
language sql immutable as $$
 select (string_to_array(path,'/'))[1:greatest(array_length(string_to_array(path,'/'),1)-1,0)]
$$;
create function storage.extension(path text) returns text
language sql immutable as $$
 select lower(regexp_replace(path,'^.*[.]',''))
$$;
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated,anon;
grant select,insert,delete on storage.objects to authenticated;
grant select on storage.buckets to authenticated;
