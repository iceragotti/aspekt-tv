create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  handle text not null unique,
  display_name text not null,
  role text not null default 'user'
    check (role in ('user', 'creator', 'moderator')),
  age_verified boolean not null default false,
  created_at timestamptz not null default now(),
  constraint profiles_handle_length check (char_length(handle) between 3 and 24),
  constraint profiles_display_name_length check (char_length(display_name) between 1 and 40)
);

create table if not exists public.blocked_users (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocked_users_not_self check (blocker_id <> blocked_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  constraint messages_body_length check (char_length(trim(body)) between 1 and 1000),
  constraint messages_not_self check (sender_id <> receiver_id)
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reported_user_id uuid not null references public.profiles(id) on delete cascade,
  message_id uuid references public.messages(id) on delete set null,
  reason text not null,
  created_at timestamptz not null default now(),
  constraint reports_reason_length check (char_length(trim(reason)) between 3 and 500),
  constraint reports_not_self check (reporter_id <> reported_user_id)
);

create index if not exists idx_messages_participants_time
  on public.messages (sender_id, receiver_id, created_at desc);

create index if not exists idx_messages_receiver_time
  on public.messages (receiver_id, created_at desc);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base_handle text;
begin
  base_handle := coalesce(
    nullif(
      regexp_replace(
        lower(coalesce(
          new.raw_user_meta_data ->> 'handle',
          split_part(coalesce(new.email, ''), '@', 1)
        )),
        '[^a-z0-9_]',
        '',
        'g'
      ),
      ''
    ),
    'user'
  );
  base_handle := left(base_handle, 18) || '_' ||
    substr(replace(new.id::text, '-', ''), 1, 5);

  insert into public.profiles (id, handle, display_name)
  values (
    new.id,
    base_handle,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      base_handle
    )
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.blocked_users enable row level security;
alter table public.messages enable row level security;
alter table public.reports enable row level security;

grant usage on schema public to authenticated;
grant select on public.profiles to authenticated;
grant select, insert, delete on public.blocked_users to authenticated;
grant select, insert, delete on public.messages to authenticated;
grant insert on public.reports to authenticated;

drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
  on public.profiles
  for select
  to authenticated
  using (true);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "blocks_select_own" on public.blocked_users;
create policy "blocks_select_own"
  on public.blocked_users
  for select
  to authenticated
  using (auth.uid() = blocker_id);

drop policy if exists "blocks_insert_own" on public.blocked_users;
create policy "blocks_insert_own"
  on public.blocked_users
  for insert
  to authenticated
  with check (auth.uid() = blocker_id);

drop policy if exists "blocks_delete_own" on public.blocked_users;
create policy "blocks_delete_own"
  on public.blocked_users
  for delete
  to authenticated
  using (auth.uid() = blocker_id);

drop policy if exists "messages_select_participants" on public.messages;
create policy "messages_select_participants"
  on public.messages
  for select
  to authenticated
  using (auth.uid() = sender_id or auth.uid() = receiver_id);

drop policy if exists "messages_insert_not_blocked" on public.messages;
create policy "messages_insert_not_blocked"
  on public.messages
  for insert
  to authenticated
  with check (
    auth.uid() = sender_id
    and not exists (
      select 1
      from public.blocked_users b
      where (b.blocker_id = receiver_id and b.blocked_id = sender_id)
         or (b.blocker_id = sender_id and b.blocked_id = receiver_id)
    )
  );

drop policy if exists "messages_delete_own_sent" on public.messages;
create policy "messages_delete_own_sent"
  on public.messages
  for delete
  to authenticated
  using (auth.uid() = sender_id);

drop policy if exists "reports_insert_own" on public.reports;
create policy "reports_insert_own"
  on public.reports
  for insert
  to authenticated
  with check (auth.uid() = reporter_id);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end;
$$;
