import {createClient} from '@supabase/supabase-js';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
const url=process.env.SUPABASE_URL;
const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
// Fail closed: never run this experimental worker against a public project.
if(!/^http:\/\/(localhost|127\.0\.0\.1):54321\/?$/.test(url??'')||!key)
 throw Error('Only isolated local Supabase with a server-side service key is supported');
const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
const {data:pending,error:readError}=await db.from('video_review').select('id,owner_id,object_path').eq('state','quarantine').limit(10);
if(readError)throw readError;
for(const entry of pending??[]){
 const dir=await mkdtemp(join(tmpdir(),'aspekt-video-'));
 try {
  if(!entry.object_path.startsWith(entry.owner_id+'/') ||
    !/^[0-9a-f-]{36}[.](mp4|webm)$/.test(entry.object_path.slice(entry.owner_id.length+1)))
   throw Error('Invalid object ownership or path');
  const {data,error}=await db.storage.from('aspekt-video-private').download(entry.object_path);
  if(error||!data)throw error??Error('Download failed');
  if(data.size>20*1024*1024||data.size<12)throw Error('Invalid size');
  const path=join(dir,'upload.'+entry.object_path.split('.').pop());
  await writeFile(path,Buffer.from(await data.arrayBuffer()),{flag:'wx',mode:0o600});
  await exec(process.execPath,['scripts/validate-video.mjs',path],{timeout:25000,maxBuffer:65536,windowsHide:true});
  const {data:changed,error:writeError}=await db.from('video_review')
   .update({state:'validated',validated_at:new Date().toISOString()})
   .eq('id',entry.id).eq('state','quarantine').select('id');
  if(writeError||!changed?.length)throw writeError??Error('Concurrent modification');
  console.log('Validated quarantine entry',entry.id);
 }catch(error){
  const {error:rejectError}=await db.from('video_review').update({state:'rejected'})
   .eq('id',entry.id).eq('state','quarantine');
  if(rejectError)throw rejectError;
  console.error('Rejected quarantine entry',entry.id,String(error?.message??error));
 }finally{await rm(dir,{recursive:true,force:true});}
}
