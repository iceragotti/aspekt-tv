begin;
insert into public.trust_staff(user_id) values ('00000000-0000-4000-8000-000000000001');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select public.trust_create_decision('00000000-0000-4000-8000-000000000002','fixture','draft-1','spam','restrict','Fixture explanation');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
do $$ begin
 if exists(select 1 from public.trust_decisions) then raise exception 'Cross-account leak'; end if;
 begin
 insert into public.trust_staff(user_id) values(auth.uid());
 raise exception 'Staff escalation';
 exception when insufficient_privilege then null; end;
 begin
 delete from public.trust_decisions;
 raise exception 'Direct delete allowed';
 exception when insufficient_privilege then null; end;
 begin
 perform count(*) from public.trust_audit;
 raise exception 'Audit exposed';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
do $$ begin
 if (select count(*) from public.trust_decisions)<>1 then raise exception 'Own decision missing'; end if;
end $$;
reset role;
set local role anon;
do $$ begin
 begin
 perform public.trust_is_staff();
 raise exception 'Anonymous RPC allowed';
 exception when insufficient_privilege then null; end;
end $$;
rollback;
