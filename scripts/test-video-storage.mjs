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
const listing=ok(await server.from('video_publications').select('revoked_at').eq('review_id',registered).single(),'publication record');
assert.equal(listing.revoked_at,null,'Publication is inactive');
await expectFailure(()=>owner.db.storage.from('aspekt-video-processed').download(accepted.processed_path),'Published bytes exposed through private Storage');
ok(await reviewer.db.rpc('video_revoke',{p_review_id:registered}),'revoke publication');
const revoked=ok(await server.from('video_publications').select('revoked_at').eq('review_id',registered).single(),'revoked record');
assert.ok(revoked.revoked_at,'Revocation not recorded');
const stored=ok(await server.storage.getBucket(bucket),'postapproval bucket');
assert.equal(stored.public,false,'Approval must not make bucket public');
console.log('PASS: real auth, private Storage RLS, video transcoding, leases, retry-safe processing, creator profiles and moderation-gated publication');
