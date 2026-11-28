begin;
insert into public.trust_staff(user_id) values ('00000000-0000-4000-8000-000000000001');
insert into public.video_review(id,owner_id,object_path) values ('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002/test.mp4');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
do $$ begin
 if exists(select 1 from public.video_review) then raise exception 'Foreign review leaked'; end if;
 begin
 perform public.video_review_approve('00000000-0000-4000-8000-000000000010');
 raise exception 'Unauthorized approval';
 exception when insufficient_privilege then null; end;
 begin
 update public.video_review set validated_at=now(),state='validated';
 raise exception 'Client validation allowed';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
do $$ begin
 begin
 perform public.video_review_approve('00000000-0000-4000-8000-000000000010');
 raise exception 'FAIL: quarantine bypass';
 exception when raise_exception then
 if sqlerrm <> 'Not eligible' then raise; end if;
 end;
end $$;
reset role;
update public.video_review set validated_at=now(),state='validated';
set local role authenticated;
select public.video_review_approve('00000000-0000-4000-8000-000000000010');
do $$ begin
 if not exists(select 1 from public.video_review where state='approved') then raise exception 'Approval missing'; end if;
end $$;
rollback;
