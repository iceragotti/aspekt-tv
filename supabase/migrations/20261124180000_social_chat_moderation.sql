grant select, insert, delete on public.reports to authenticated;

drop policy if exists "reports_select_own" on public.reports;
create policy "reports_select_own"
  on public.reports
  for select
  to authenticated
  using (auth.uid() = reporter_id);

drop policy if exists "reports_delete_own" on public.reports;
create policy "reports_delete_own"
  on public.reports
  for delete
  to authenticated
  using (auth.uid() = reporter_id);

drop policy if exists "reports_insert_own" on public.reports;

create policy "reports_insert_own"
  on public.reports
  for insert
  to authenticated
  with check (
    auth.uid() = reporter_id
    and reporter_id <> reported_user_id
    and (
      message_id is null
      or exists (
        select 1
        from public.messages reported_message
        where reported_message.id = reports.message_id
          and reported_message.sender_id = reports.reported_user_id
          and reported_message.sender_id <> auth.uid()
          and (
            (
              reported_message.group_id is null
              and reported_message.receiver_id = auth.uid()
            )
            or (
              reported_message.group_id is not null
              and public.is_chat_group_member(reported_message.group_id)
            )
          )
      )
    )
  );
