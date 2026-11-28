begin;
-- Staging only until reviewed. Does not enforce sanctions on existing content.
create table public.trust_staff (
 user_id uuid primary key references auth.users(id),
 active boolean not null default true
);
create table public.trust_decisions (
 id uuid primary key default gen_random_uuid(),
 subject_id uuid not null references auth.users(id),
 moderator_id uuid not null references auth.users(id),
 target_ref text not null check (char_length(trim(target_ref)) between 1 and 200),
 policy_version text not null check (char_length(trim(policy_version)) between 1 and 80),
 reason text not null check (reason in ('legal_requirement','credible_threat','harassment','fraud','privacy_violation','child_safety','spam')),
 action text not null check (action in ('restrict','remove','suspend')),
 explanation text not null check (char_length(trim(explanation)) between 10 and 4000),
 created_at timestamptz not null default now(),
 check (subject_id <> moderator_id)
);
create table public.trust_appeals (
 decision_id uuid primary key references public.trust_decisions(id),
 explanation text not null check (char_length(trim(explanation)) between 10 and 4000),
 created_at timestamptz not null default now(),
 outcome text check (outcome in ('upheld','overturned')),
 reviewer_id uuid references auth.users(id),
 resolution text check (char_length(trim(resolution)) between 10 and 4000),
 resolved_at timestamptz,
 check ((outcome is null and reviewer_id is null and resolution is null and resolved_at is null) or
 (outcome is not null and reviewer_id is not null and resolution is not null and resolved_at is not null))
);
create table public.trust_audit (
 id bigint generated always as identity primary key,
 decision_id uuid not null references public.trust_decisions(id),
 actor_id uuid not null references auth.users(id),
 event text not null check (event in ('decision_created','appeal_submitted','appeal_resolved')),
 created_at timestamptz not null default now()
);
create index trust_decisions_subject_idx on public.trust_decisions(subject_id);
alter table public.trust_staff enable row level security;
alter table public.trust_decisions enable row level security;
alter table public.trust_appeals enable row level security;
alter table public.trust_audit enable row level security;
revoke all on public.trust_staff, public.trust_decisions, public.trust_appeals, public.trust_audit from public, anon, authenticated;
grant select on public.trust_decisions, public.trust_appeals to authenticated;
create function public.trust_is_staff() returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.trust_staff where user_id = auth.uid() and active);
$$;
revoke all on function public.trust_is_staff() from public, anon, authenticated;
grant execute on function public.trust_is_staff() to authenticated;
create policy trust_decisions_read on public.trust_decisions for select to authenticated
 using (subject_id = auth.uid() or public.trust_is_staff());
create policy trust_appeals_read on public.trust_appeals for select to authenticated
 using (exists(select 1 from public.trust_decisions d where d.id = decision_id));
create function public.trust_create_decision(p_subject uuid,p_target text,p_policy text,p_reason text,p_action text,p_explanation text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
 if not public.trust_is_staff() or auth.uid() = p_subject then raise exception 'Forbidden' using errcode='42501'; end if;
 insert into public.trust_decisions(subject_id,moderator_id,target_ref,policy_version,reason,action,explanation)
 values(p_subject,auth.uid(),p_target,p_policy,p_reason,p_action,p_explanation) returning id into v_id;
 insert into public.trust_audit(decision_id,actor_id,event) values(v_id,auth.uid(),'decision_created');
 return v_id;
end; $$;
create function public.trust_submit_appeal(p_decision uuid,p_explanation text)
returns void language plpgsql security definer set search_path = '' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.trust_decisions where id=p_decision and subject_id=auth.uid()) then raise exception 'Forbidden' using errcode='42501'; end if;
 insert into public.trust_appeals(decision_id,explanation) values(p_decision,p_explanation);
 insert into public.trust_audit(decision_id,actor_id,event) values(p_decision,auth.uid(),'appeal_submitted');
end; $$;
create function public.trust_resolve_appeal(p_decision uuid,p_outcome text,p_resolution text)
returns void language plpgsql security definer set search_path = '' as $$
begin
 if not public.trust_is_staff() or not exists(select 1 from public.trust_decisions where id=p_decision and moderator_id<>auth.uid() and subject_id<>auth.uid()) then raise exception 'Forbidden' using errcode='42501'; end if;
 if p_outcome is null or p_outcome not in ('upheld','overturned') or p_resolution is null then raise exception 'Invalid resolution'; end if;
 update public.trust_appeals set outcome=p_outcome,resolution=p_resolution,reviewer_id=auth.uid(),resolved_at=now() where decision_id=p_decision and outcome is null;
 if not found then raise exception 'No pending appeal'; end if;
 insert into public.trust_audit(decision_id,actor_id,event) values(p_decision,auth.uid(),'appeal_resolved');
end; $$;
revoke all on function public.trust_create_decision(uuid,text,text,text,text,text), public.trust_submit_appeal(uuid,text), public.trust_resolve_appeal(uuid,text,text) from public, anon, authenticated;
grant execute on function public.trust_create_decision(uuid,text,text,text,text,text), public.trust_submit_appeal(uuid,text), public.trust_resolve_appeal(uuid,text,text) to authenticated;
commit;
