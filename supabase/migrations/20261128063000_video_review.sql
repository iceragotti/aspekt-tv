begin;
create table public.video_review (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id),
 object_path text not null unique,
 validated_at timestamptz,
 state text not null default 'quarantine' check(state in ('quarantine','validated','approved','rejected')),
 decision_id uuid references public.trust_decisions(id),
 check(split_part(object_path,'/',1)=owner_id::text),
 check(state not in ('validated','approved') or validated_at is not null)
);
alter table public.video_review enable row level security;
revoke all on public.video_review from public, anon, authenticated;
grant select on public.video_review to authenticated;
create policy video_review_read on public.video_review for select to authenticated using(owner_id=auth.uid() or public.trust_is_staff());
-- Only trusted backend may register or validate bytes. No public delivery policy.
create function public.video_review_approve(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.trust_is_staff() then raise exception 'Forbidden' using errcode='42501'; end if;
 update public.video_review set state='approved' where id=p_id and state='validated' and validated_at is not null and owner_id<>auth.uid();
 if not found then raise exception 'Not eligible'; end if;
end $$;
revoke all on function public.video_review_approve(uuid) from public,anon,authenticated;
grant execute on function public.video_review_approve(uuid) to authenticated;
-- Approval is metadata only, not permission to deliver bytes.
commit;
