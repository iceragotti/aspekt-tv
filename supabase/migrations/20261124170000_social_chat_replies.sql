alter table public.messages
  add column if not exists reply_to_message_id uuid
  references public.messages(id) on delete set null;

create index if not exists idx_messages_reply_to
  on public.messages (reply_to_message_id)
  where reply_to_message_id is not null;

grant delete on public.messages to authenticated;

drop policy if exists "messages_delete_own_sent" on public.messages;
create policy "messages_delete_own_sent"
  on public.messages for delete to authenticated
  using (auth.uid() = sender_id);

create or replace function public.validate_chat_message_reply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  replied_message public.messages%rowtype;
begin
  if new.reply_to_message_id is null then
    return new;
  end if;

  if auth.uid() is null or new.sender_id is distinct from auth.uid() then
    raise exception 'Replies must be sent by the authenticated user';
  end if;

  select *
    into replied_message
    from public.messages
    where id = new.reply_to_message_id;

  if not found then
    raise exception 'The message being replied to does not exist';
  end if;

  if new.group_id is not null then
    if replied_message.group_id is distinct from new.group_id
       or not public.is_chat_group_member(new.group_id) then
      raise exception 'Replies must reference a message in the same group';
    end if;
  elsif replied_message.group_id is not null
     or not (
       (
         replied_message.sender_id = new.sender_id
         and replied_message.receiver_id = new.receiver_id
       )
       or (
         replied_message.sender_id = new.receiver_id
         and replied_message.receiver_id = new.sender_id
       )
     ) then
    raise exception 'Replies must reference a message in the same conversation';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_chat_message_reply() from public;
grant execute on function public.validate_chat_message_reply() to authenticated;

drop trigger if exists messages_validate_reply on public.messages;
create trigger messages_validate_reply
  before insert or update of reply_to_message_id, group_id, receiver_id, sender_id
  on public.messages
  for each row
  execute function public.validate_chat_message_reply();
