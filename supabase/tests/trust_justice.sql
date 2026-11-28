-- Run only against disposable migrated Supabase database with at least 3 test users.
begin;
do $$
declare a uuid; b uuid; c uuid; d uuid;
begin
 select id into a from auth.users order by id limit 1;
 select id into b from auth.users where id<>a order by id limit 1;
 select id into c from auth.users where id not in (a,b) order by id limit 1;
 if c is null then raise exception 'Three test users required'; end if;
 insert into public.trust_staff(user_id) values(a),(c);
 perform set_config('request.jwt.claim.sub',a::text,true);
 d:=public.trust_create_decision(b,'test-post','draft-1','spam','restrict','Test decision explanation');
 perform set_config('request.jwt.claim.sub',b::text,true);
 begin
 perform public.trust_create_decision(c,'test','draft-1','spam','restrict','Unauthorized decision');
 raise exception 'FAIL: ordinary user created decision';
 exception when insufficient_privilege then null; end;
 perform public.trust_submit_appeal(d,'Test appeal explanation');
 begin
 perform public.trust_submit_appeal(d,'Duplicate appeal explanation');
 raise exception 'FAIL: duplicate appeal';
 exception when unique_violation then null; end;
 perform set_config('request.jwt.claim.sub',a::text,true);
 begin
 perform public.trust_resolve_appeal(d,'upheld','Original moderator review');
 raise exception 'FAIL: original moderator reviewed appeal';
 exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claim.sub',c::text,true);
 perform public.trust_resolve_appeal(d,'overturned','Independent test review');
 if (select count(*) from public.trust_audit where decision_id=d)<>3 then raise exception 'FAIL: audit count'; end if;
 if not exists(select 1 from public.trust_appeals where decision_id=d and outcome='overturned') then raise exception 'FAIL: outcome'; end if;
end $$;
-- Additional required tests: SET ROLE authenticated with distinct JWT subjects,
-- cross-account SELECT, direct INSERT/UPDATE/DELETE denial, anonymous RPC denial,
-- inactive staff, concurrent resolution, existing chat regressions.
rollback;
