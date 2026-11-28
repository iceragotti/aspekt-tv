import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createClient} from '@supabase/supabase-js';

const exec=promisify(execFile);
const url=process.env.SUPABASE_URL;
const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey=process.env.SUPABASE_ANON_KEY;
const sample=process.env.ASPEKT_VIDEO_FIXTURE;
assert.match(url??'',/^http:\/\/(localhost|127\.0\.0\.1):54321\/?$/,'Integration tests must use local Supabase');
assert.ok(serviceKey && anonKey && sample,'Missing local test credentials or fixture');
const server=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
const client=()=>createClient(url,anonKey,{auth:{persistSession:false,autoRefreshToken:false}});
const pass='local-only-'+randomUUID()+'Aa!';

async function account(label){
  const email=`aspekt-${label}-${randomUUID()}@example.invalid`;
  const {data,error}=await server.auth.admin.createUser({email,password:pass,email_confirm:true});
  if(error||!data.user)throw error??Error('Test account unavailable');
  const userClient=client();
  const {error:signError}=await userClient.auth.signInWithPassword({email,password:pass});
  if(signError)throw signError;
  return {id:data.user.id,db:userClient};
}
const owner=await account('owner');
const other=await account('outsider');
const reviewer=await account('reviewer');
const bucket='aspekt-video-private';
const path=`${owner.id}/${randomUUID()}.mp4`;
const invalidPath=`${owner.id}/${randomUUID()}.webm`;

function ok(result,message){
 if(result.error)throw new Error(`${message}: ${result.error.message}`);
 return result.data;
}
async function expectFailure(fn,message){
 let failed=false;
 try {const r=await fn();failed=!!r?.error;}
 catch {failed=true;}
 assert.ok(failed,message);
}
assert.equal(ok(await server.storage.getBucket(bucket),'get bucket').public,false,'Video bucket must remain private');
const video=new Uint8Array(await readFile(sample));
ok(await owner.db.storage.from(bucket).upload(path,video,{contentType:'video/mp4',upsert:false}),'upload valid');
ok(await owner.db.storage.from(bucket).upload(invalidPath,new Uint8Array(24),{contentType:'video/webm',upsert:false}),'upload malformed');
// Storage API isolation with real JWTs
const files=ok(await owner.db.storage.from(bucket).list(owner.id),'owner list');
assert.ok(files.some(f=>path.endsWith('/'+f.name)),'Owner cannot see own file');
const outsiders=ok(await other.db.storage.from(bucket).list(owner.id),'other list');
assert.equal(outsiders.length,0,'Other account can list private objects');
await expectFailure(()=>other.db.storage.from(bucket).download(path),'Other account downloaded private media');
await expectFailure(()=>other.db.storage.from(bucket).createSignedUrl(path,60),'Other account signed private media');
const signed=ok(await owner.db.storage.from(bucket).createSignedUrl(path,60),'owner signed playback');
assert.ok(signed.signedUrl,'Owner needs short-lived private playback URL');
const unauthenticated=await fetch(`${url}/storage/v1/object/public/${bucket}/${path}`);
assert.equal(unauthenticated.ok,false,'Private video available through public URL');
// Register only authentic owned Storage objects
const registered=ok(await owner.db.rpc('video_register_upload',{p_path:path}),'register valid');
ok(await owner.db.rpc('video_register_upload',{p_path:invalidPath}),'register malformed');
await expectFailure(()=>other.db.rpc('video_register_upload',{p_path:path}),'Other account registered private media');
const outsiderReviews=ok(await other.db.from('video_review').select('id'),'outbound review visibility');
assert.equal(outsiderReviews.length,0,'Private review metadata leaked');
// Persistent creator profile RLS
ok(await owner.db.from('video_creator_profiles').insert({display_name:'ASPEKT Test Creator'}),'creator profile insert');
const ownProfile=ok(await owner.db.from('video_creator_profiles').select('display_name').single(),'creator profile read');
assert.equal(ownProfile.display_name,'ASPEKT Test Creator');
ok(await owner.db.from('video_creator_profiles').upsert({display_name:'ASPEKT Updated Creator'},{onConflict:'owner_id'}),'creator profile upsert');
const updatedProfile=ok(await owner.db.from('video_creator_profiles').select('display_name').single(),'updated profile read');
assert.equal(updatedProfile.display_name,'ASPEKT Updated Creator','Creator profile changes must persist');
const otherProfiles=ok(await other.db.from('video_creator_profiles').select('owner_id'),'other creator visibility');
assert.equal(otherProfiles.length,0,'Creator profile exposed to other accounts');
// Phase 6.5: persistent channel and editable owner metadata.
ok(await owner.db.from('video_channels').insert({
 handle:'aspekt-'+randomUUID().slice(0,8),
 display_name:'ASPEKT Creator Channel',description:'Independent voices'
}),'create persistent channel');
const channel=ok(await owner.db.from('video_channels')
 .select('handle,display_name').single(),'own channel');
assert.equal(channel.display_name,'ASPEKT Creator Channel');
const outsiderChannel=ok(await other.db.from('video_channels').select('handle'),'private channel');
assert.equal(outsiderChannel.length,0,'Private creator channel leaked');
ok(await owner.db.from('video_channels').update({display_name:'ASPEKT Updated Channel'})
 .eq('handle',channel.handle),'channel update');
const updatedChannel=ok(await owner.db.from('video_channels')
 .select('display_name').single(),'updated channel');
assert.equal(updatedChannel.display_name,'ASPEKT Updated Channel');
ok(await owner.db.rpc('video_save_metadata',{
 p_review_id:registered,p_title:'Erstes echtes Video',p_description:'ASPEKT NEXT 6.5',p_kind:'video'
}),'save owned video metadata');
await expectFailure(()=>other.db.rpc('video_save_metadata',{
 p_review_id:registered,p_title:'Manipuliert',p_description:'',p_kind:'video'
}),'Foreign owner edited video');
const privateLibrary=ok(await owner.db.rpc('video_my_library'),'owner video library');
assert.ok(privateLibrary.some(v=>v.id===registered&&v.title==='Erstes echtes Video'&&v.status==='quarantine'));
const otherLibrary=ok(await other.db.rpc('video_my_library'),'other library');
assert.equal(otherLibrary.length,0,'Owner library leaked');
const edgeUrl=process.env.ASPEKT_EDGE_TEST_URL;
if(edgeUrl){
 const forbidden=await fetch(edgeUrl+'?id='+registered);
 assert.equal(forbidden.status,404,'Unpublished media returned a playback link');
}
const catalogBefore=ok(await other.db.rpc('video_public_catalog'),'unpublished catalog');
assert.equal(catalogBefore.length,0,'Unapproved video appeared in public catalog');
const workerEnv={...process.env,SUPABASE_URL:url,SUPABASE_SERVICE_ROLE_KEY:serviceKey};
await exec(process.execPath,['scripts/video-worker.mjs','--drain'],{env:workerEnv,timeout:60000,maxBuffer:131072,cwd:process.cwd()});
const {data:processed}=await server.from('video_review').select('id,object_path,state,processed_path').in('object_path',[path,invalidPath]);
assert.equal(processed?.find(v=>v.object_path===path)?.state,'validated','Valid video not validated');
assert.equal(processed?.find(v=>v.object_path===invalidPath)?.state,'rejected','Invalid media not rejected');
const accepted=processed.find(v=>v.object_path===path);
assert.ok(accepted?.processed_path,'Transcoded output was not registered');
const asset=ok(await server.storage.from('aspekt-video-processed').download(accepted.processed_path),'processed media download');
assert.ok(asset.size>12,'Transcoded media empty');
assert.equal(ok(await server.storage.getBucket('aspekt-video-processed'),'processed bucket').public,false);
await expectFailure(()=>owner.db.storage.from('aspekt-video-processed').download(accepted.processed_path),'Owner downloaded unapproved transcoded bytes');
const jobs=ok(await server.from('video_processing_jobs').select('id,state,attempts').eq('review_id',registered),'processing jobs');
assert.equal(jobs.length,1,'Duplicate processing job');
assert.equal(jobs[0].state,'done','Job not acknowledged');
assert.equal(jobs[0].attempts,1,'Expected one processing attempt');
await expectFailure(()=>other.db.rpc('video_job_claim',{}),'Public claimant took trusted work');
await expectFailure(()=>other.db.from('video_processing_jobs').select('id'),'Public reader obtained job table');
await expectFailure(()=>owner.db.rpc('video_publish',{p_review_id:registered}),'Owner published without approval');

await expectFailure(()=>owner.db.rpc('video_review_approve',{p_id:registered}),'Creator approved their own video');
ok(await server.from('trust_staff').insert({user_id:reviewer.id}),'grant local reviewer');
ok(await reviewer.db.rpc('video_review_approve',{p_id:registered}),'independent review approval');
const approved=ok(await server.from('video_review').select('state').eq('id',registered).single(),'approved state');
assert.equal(approved.state,'approved');
await expectFailure(()=>owner.db.rpc('video_publish',{p_review_id:registered}),'Creator published own video');
ok(await reviewer.db.rpc('video_publish',{p_review_id:registered}),'publish approved asset');
if(edgeUrl){
 const permitted=await fetch(edgeUrl+'?id='+registered);
 assert.equal(permitted.status,200,'Published media playback was not authorized');
 const signedResponse=await permitted.json();
 assert.ok(signedResponse.url && signedResponse.expiresIn===60,'Missing short-lived playback link');
 const playable=await fetch(signedResponse.url);
 assert.equal(playable.ok,true,'Signed public playback asset inaccessible');
}
const publicCatalog=ok(await other.db.rpc('video_public_catalog'),'active public catalog');
assert.equal(publicCatalog.length,1,'Published video absent from public catalog');
assert.equal(publicCatalog[0].title,'Erstes echtes Video');
assert.equal(publicCatalog[0].channel_handle,channel.handle);
assert.ok(!JSON.stringify(publicCatalog).includes('processed_path'),'Private asset path leaked in catalog');
await expectFailure(()=>owner.db.rpc('video_save_metadata',{
 p_review_id:registered,p_title:'Silent edit',p_description:'',p_kind:'video'
}),'Published metadata changed without review');
const listing=ok(await server.from('video_publications').select('revoked_at').eq('review_id',registered).single(),'publication record');
assert.equal(listing.revoked_at,null,'Publication is inactive');
await expectFailure(()=>owner.db.storage.from('aspekt-video-processed').download(accepted.processed_path),'Published bytes exposed through private Storage');
ok(await reviewer.db.rpc('video_revoke',{p_review_id:registered}),'revoke publication');
const revoked=ok(await server.from('video_publications').select('revoked_at').eq('review_id',registered).single(),'revoked record');
assert.ok(revoked.revoked_at,'Revocation not recorded');
if(edgeUrl){
 const revokedPlayback=await fetch(edgeUrl+'?id='+registered);
 assert.equal(revokedPlayback.status,404,'Revoked media still issued new signed links');
}
const catalogAfterRevoke=ok(await other.db.rpc('video_public_catalog'),'revoked catalog');
assert.equal(catalogAfterRevoke.length,0,'Revoked video still discoverable');
const stored=ok(await server.storage.getBucket(bucket),'postapproval bucket');
assert.equal(stored.public,false,'Approval must not make bucket public');
console.log('PASS: real auth, private Storage RLS, video transcoding, leases, retry-safe processing, creator profiles and moderation-gated publication');
