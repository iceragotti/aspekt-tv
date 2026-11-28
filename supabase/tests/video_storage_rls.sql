begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
insert into storage.objects(bucket_id,name)
values('aspekt-video-private','00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000011.mp4');
select public.video_register_upload('00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000011.mp4');
do $$ begin
 if (select count(*) from public.video_review where owner_id=auth.uid() and state='quarantine')<>1 then
 raise exception 'Owner upload not registered for quarantine';end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
do $$ begin
 if exists(select 1 from storage.objects) then raise exception 'Private media metadata leaked'; end if;
 if exists(select 1 from public.video_review) then raise exception 'Review metadata leaked'; end if;
 begin
 perform public.video_register_upload('00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000011.mp4');
 raise exception 'Cross-owner registration succeeded';
 exception when insufficient_privilege then null; end;
 begin
 insert into storage.objects(bucket_id,name) values('aspekt-video-private','00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000099.mp4');
 raise exception 'Foreign owner path upload succeeded';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
do $$ begin
 if (select count(*) from storage.objects)<>1 then raise exception 'Own media inaccessible';end if;
end $$;
rollback;
