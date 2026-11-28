begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
insert into public.video_drafts(title,format) values('Test video','video');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
do $$ begin
 if exists(select 1 from public.video_drafts) then raise exception 'Draft leaked'; end if;
 update public.video_drafts set title='Unauthorized';
 if found then raise exception 'Foreign draft modified'; end if;
 begin
 insert into public.video_drafts(owner_id,title,format) values('00000000-0000-4000-8000-000000000001','Forged','short');
 raise exception 'Owner spoofing allowed';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
do $$ begin
 if (select count(*) from public.video_drafts where title='Test video')<>1 then raise exception 'Own draft missing'; end if;
end $$;
rollback;
