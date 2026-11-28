begin;
create table public.video_drafts (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null default auth.uid() references auth.users(id),
 title text not null check (char_length(trim(title)) between 1 and 120),
 format text not null check (format in ('video','short')),
 created_at timestamptz not null default now()
);
alter table public.video_drafts enable row level security;
revoke all on public.video_drafts from public, anon, authenticated;
grant select, delete on public.video_drafts to authenticated;
grant insert(title,format), update(title,format) on public.video_drafts to authenticated;
create policy video_drafts_select on public.video_drafts for select to authenticated using(owner_id=auth.uid());
create policy video_drafts_insert on public.video_drafts for insert to authenticated with check(owner_id=auth.uid());
create policy video_drafts_update on public.video_drafts for update to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());
create policy video_drafts_delete on public.video_drafts for delete to authenticated using(owner_id=auth.uid());
commit;
