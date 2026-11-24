create table if not exists public.chat_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint chat_groups_name_length check (char_length(trim(name)) between 1 and 60)
);

create table if not exists public.chat_group_members (
  group_id uuid not null references public.chat_groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

alter table public.messages
  alter column receiver_id drop not null;

alter table public.messages
  add column if not exists group_id uuid references public.chat_groups(id) on delete cascade;

alter table public.messages
  add column if not exists image_path text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'messages_exactly_one_conversation'
      and conrelid = 'public.messages'::regclass
  ) then
    alter table public.messages
      add constraint messages_exactly_one_conversation
      check (
        (group_id is null and receiver_id is not null)
        or (group_id is not null and receiver_id is null)
      );
  end if;
end;
$$;

create index if not exists idx_messages_group_time
  on public.messages (group_id, created_at desc)
  where group_id is not null;

create table if not exists public.message_reads (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create table if not exists public.message_reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null check (emoji in ('❤️', '😂', '👍', '😮')),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create index if not exists idx_chat_group_members_user
  on public.chat_group_members (user_id, group_id);

alter table public.message_reactions replica identity full;

alter table public.chat_groups enable row level security;
alter table public.chat_group_members enable row level security;
alter table public.message_reads enable row level security;
alter table public.message_reactions enable row level security;

grant select, insert on public.chat_groups to authenticated;
grant select, insert, delete on public.chat_group_members to authenticated;
grant select, insert, delete on public.message_reads to authenticated;
grant select, insert, update, delete on public.message_reactions to authenticated;

create or replace function public.is_chat_group_member(target_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.chat_group_members m
    where m.group_id = target_group_id
      and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_chat_group_owner(target_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.chat_groups g
    where g.id = target_group_id
      and g.created_by = auth.uid()
  );
$$;

revoke all on function public.is_chat_group_member(uuid) from public;
revoke all on function public.is_chat_group_owner(uuid) from public;
grant execute on function public.is_chat_group_member(uuid) to authenticated;
grant execute on function public.is_chat_group_owner(uuid) to authenticated;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'chat-images',
  'chat-images',
  false,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "chat_images_read_participants" on storage.objects;
create policy "chat_images_read_participants"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'chat-images'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1
        from public.messages msg
        where msg.image_path = storage.objects.name
          and (
            msg.sender_id = auth.uid()
            or msg.receiver_id = auth.uid()
            or (
              msg.group_id is not null
              and public.is_chat_group_member(msg.group_id)
            )
          )
      )
    )
  );

drop policy if exists "chat_images_insert_own" on storage.objects;
create policy "chat_images_insert_own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'chat-images'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (metadata ->> 'mimetype') in (
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif'
    )
  );

drop policy if exists "chat_images_delete_own" on storage.objects;
create policy "chat_images_delete_own"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'chat-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "chat_groups_select_member" on public.chat_groups;
create policy "chat_groups_select_member"
  on public.chat_groups for select to authenticated
  using (public.is_chat_group_member(id));

drop policy if exists "chat_groups_insert_owner" on public.chat_groups;
create policy "chat_groups_insert_owner"
  on public.chat_groups for insert to authenticated
  with check (created_by = auth.uid());

drop policy if exists "chat_group_members_select_member" on public.chat_group_members;
create policy "chat_group_members_select_member"
  on public.chat_group_members for select to authenticated
  using (
    user_id = auth.uid() or public.is_chat_group_member(group_id)
  );

drop policy if exists "chat_group_members_insert_owner" on public.chat_group_members;
create policy "chat_group_members_insert_owner"
  on public.chat_group_members for insert to authenticated
  with check (public.is_chat_group_owner(group_id));

drop policy if exists "chat_group_members_delete_self_or_owner" on public.chat_group_members;
create policy "chat_group_members_delete_self_or_owner"
  on public.chat_group_members for delete to authenticated
  using (
    user_id = auth.uid() or public.is_chat_group_owner(group_id)
  );

drop policy if exists "messages_select_participants" on public.messages;
create policy "messages_select_participants"
  on public.messages for select to authenticated
  using (
    (group_id is null and (auth.uid() = sender_id or auth.uid() = receiver_id))
    or (
      group_id is not null
      and public.is_chat_group_member(group_id)
    )
  );

drop policy if exists "messages_insert_not_blocked" on public.messages;
create policy "messages_insert_not_blocked"
  on public.messages for insert to authenticated
  with check (
    auth.uid() = sender_id
    and (
      image_path is null
      or left(image_path, char_length(auth.uid()::text) + 1) =
        auth.uid()::text || '/'
    )
    and (
      (
        group_id is null
        and receiver_id is not null
        and not exists (
          select 1 from public.blocked_users b
          where (b.blocker_id = receiver_id and b.blocked_id = sender_id)
             or (b.blocker_id = sender_id and b.blocked_id = receiver_id)
        )
      )
      or (
        group_id is not null
        and receiver_id is null
        and public.is_chat_group_member(group_id)
      )
    )
  );

drop policy if exists "messages_update_receiver_read" on public.messages;
create policy "messages_update_receiver_read"
  on public.messages for update to authenticated
  using (
    (group_id is null and receiver_id = auth.uid())
    or (
      group_id is not null
      and public.is_chat_group_member(group_id)
    )
  )
  with check (
    (group_id is null and receiver_id = auth.uid())
    or (
      group_id is not null
      and public.is_chat_group_member(group_id)
    )
  );

drop policy if exists "message_reads_select_chat_participants" on public.message_reads;
create policy "message_reads_select_chat_participants"
  on public.message_reads for select to authenticated
  using (
    exists (
      select 1 from public.messages msg
      where msg.id = message_id
        and (
          msg.sender_id = auth.uid()
          or msg.receiver_id = auth.uid()
          or (
            msg.group_id is not null
            and public.is_chat_group_member(msg.group_id)
          )
        )
    )
  );

drop policy if exists "message_reads_insert_own" on public.message_reads;
create policy "message_reads_insert_own"
  on public.message_reads for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.messages msg
      where msg.id = message_id
        and msg.sender_id <> auth.uid()
        and (
          msg.receiver_id = auth.uid()
          or (
            msg.group_id is not null
            and public.is_chat_group_member(msg.group_id)
          )
        )
    )
  );

drop policy if exists "message_reads_delete_own" on public.message_reads;
create policy "message_reads_delete_own"
  on public.message_reads for delete to authenticated
  using (user_id = auth.uid());

drop policy if exists "message_reactions_select_chat_participants" on public.message_reactions;
create policy "message_reactions_select_chat_participants"
  on public.message_reactions for select to authenticated
  using (
    exists (
      select 1 from public.messages msg
      where msg.id = message_id
        and (
          msg.sender_id = auth.uid()
          or msg.receiver_id = auth.uid()
          or (
            msg.group_id is not null
            and public.is_chat_group_member(msg.group_id)
          )
        )
    )
  );

drop policy if exists "message_reactions_insert_own" on public.message_reactions;
create policy "message_reactions_insert_own"
  on public.message_reactions for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.messages msg
      where msg.id = message_id
        and (
          msg.sender_id = auth.uid()
          or msg.receiver_id = auth.uid()
          or (
            msg.group_id is not null
            and public.is_chat_group_member(msg.group_id)
          )
        )
    )
  );

drop policy if exists "message_reactions_update_own" on public.message_reactions;
create policy "message_reactions_update_own"
  on public.message_reactions for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "message_reactions_delete_own" on public.message_reactions;
create policy "message_reactions_delete_own"
  on public.message_reactions for delete to authenticated
  using (user_id = auth.uid());

create or replace function public.create_chat_group(
  group_name text,
  member_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_group_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if char_length(trim(group_name)) not between 1 and 60 then
    raise exception 'Group name must be between 1 and 60 characters';
  end if;
  if exists (
    select 1
    from unnest(coalesce(member_ids, '{}'::uuid[])) requested(member_id)
    where requested.member_id = auth.uid()
       or not exists (
         select 1 from public.profiles p where p.id = requested.member_id
       )
       or exists (
         select 1 from public.blocked_users b
         where (b.blocker_id = auth.uid() and b.blocked_id = requested.member_id)
            or (b.blocker_id = requested.member_id and b.blocked_id = auth.uid())
       )
  ) then
    raise exception 'A selected member is unavailable or blocked';
  end if;

  insert into public.chat_groups (name, created_by)
  values (trim(group_name), auth.uid())
  returning id into new_group_id;

  insert into public.chat_group_members (group_id, user_id, role)
  values (new_group_id, auth.uid(), 'owner');

  insert into public.chat_group_members (group_id, user_id, role)
  select new_group_id, member_id, 'member'
  from (
    select distinct unnest(coalesce(member_ids, '{}'::uuid[])) as member_id
  ) selected
  where member_id <> auth.uid();

  return new_group_id;
end;
$$;

revoke all on function public.create_chat_group(text, uuid[]) from public;
grant execute on function public.create_chat_group(text, uuid[]) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'messages'
    ) then
      alter publication supabase_realtime add table public.messages;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'message_reactions'
    ) then
      alter publication supabase_realtime add table public.message_reactions;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'message_reads'
    ) then
      alter publication supabase_realtime add table public.message_reads;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'chat_group_members'
    ) then
      alter publication supabase_realtime add table public.chat_group_members;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'chat_groups'
    ) then
      alter publication supabase_realtime add table public.chat_groups;
    end if;
  end if;
end;
$$;
