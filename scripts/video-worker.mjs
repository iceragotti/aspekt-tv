import {createClient} from '@supabase/supabase-js';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {mkdtemp,readFile,rm,stat,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {promisify} from 'node:util';

const exec=promisify(execFile);
const url=process.env.SUPABASE_URL;
const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!/^http:\/\/(localhost|127\.0\.0\.1):54321\/?$/.test(url??'')||!key)
 throw Error('Phase 6.4 worker is restricted to isolated localhost Supabase');
const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
const bucket='aspekt-video-private';
const outputBucket='aspekt-video-processed';
const mode=process.argv.includes('--daemon')?'daemon':'drain';
let stopping=false;
process.on('SIGINT',()=>{stopping=true;});
process.on('SIGTERM',()=>{stopping=true;});
const pause=ms=>new Promise(done=>setTimeout(done,ms));
async function invoke(name,args){
 const {data,error}=await db.rpc(name,args);
 if(error)throw Error(`${name}: ${error.message}`);
 return data;
}
async function processJob(job) {
 const temp=await mkdtemp(join(tmpdir(),'aspekt-worker-'));
 let outputPath=null;
 let terminal=false;
 try {
  if(!job.object_path.startsWith(job.owner_id+'/')||
      !/^[0-9a-f-]{36}[.](mp4|webm)$/.test(job.object_path.slice(job.owner_id.length+1)))
   {terminal=true;throw Error('Unsafe input path');}
  const {data:blob,error:downloadError}=await db.storage.from(bucket).download(job.object_path);
  if(downloadError||!blob)throw downloadError??Error('Storage download failed');
  if(blob.size<12||blob.size>20*1024*1024)
   {terminal=true;throw Error('Invalid input size');}
  const input=join(temp,'input.'+job.object_path.split('.').pop());
  const output=join(temp,'output.mp4');
  await writeFile(input,Buffer.from(await blob.arrayBuffer()),{flag:'wx',mode:0o600});
  try{
   await exec(process.execPath,['scripts/validate-video.mjs',input],{
    timeout:25000,maxBuffer:65536,windowsHide:true
   });
  }catch(e){terminal=true;throw Error('Unsupported or malformed input');}
  // No shell, no URL protocols, bounded runtime and no executable content preservation.
  try {
   await exec('ffmpeg',[
    '-hide_banner','-loglevel','error','-nostdin','-y',
    '-protocol_whitelist','file',
    '-i',input,'-map','0:v:0','-an','-sn','-dn',
    '-vf','scale=w=min(1280\\,iw):h=min(720\\,ih):force_original_aspect_ratio=decrease,format=yuv420p',
    '-c:v','libx264','-preset','veryfast','-crf','28',
    '-movflags','+faststart','-t','600','-threads','2',
    '-f','mp4',output
   ],{timeout:130000,maxBuffer:65536,windowsHide:true});
  }catch{terminal=true;throw Error('Transcoding failed');}
  const info=await stat(output);
  if(!info.isFile()||info.size<12||info.size>50*1024*1024)
   {terminal=true;throw Error('Invalid output size');}
  await exec(process.execPath,['scripts/validate-video.mjs',output],{
   timeout:25000,maxBuffer:65536,windowsHide:true
  });
  outputPath=`${job.review_id}/${job.lease_token}.mp4`;
  const {error:uploadError}=await db.storage.from(outputBucket).upload(
    outputPath,new Uint8Array(await readFile(output)),{
      contentType:'video/mp4',cacheControl:'60',upsert:false
    });
  if(uploadError)throw uploadError;
  await invoke('video_job_finish',{
   p_job_id:job.job_id,p_lease:job.lease_token,p_output_path:outputPath
  });
  console.log('Transcoded private asset for review',job.review_id);
 }catch(error){
  console.error('Worker job failed',job.job_id,String(error?.message??error));
  try{
   await invoke('video_job_finish',{
    p_job_id:job.job_id,p_lease:job.lease_token,
    p_error:String(error?.message??error).slice(0,180),p_terminal:terminal
   });
  }catch(stale){
   // Lease may have expired: a different worker owns the retry.
   console.error('Lease completion failed',job.job_id,String(stale?.message??stale));
  }
 }finally{await rm(temp,{recursive:true,force:true});}
}

while(!stopping){
 try{
  const claimed=await invoke('video_job_claim',{});
  if(!claimed?.length){
   if(mode==='drain')break;
   await pause(4000);continue;
  }
  await processJob(claimed[0]);
 }catch(error){
  console.error('Worker claim failed',String(error?.message??error));
  if(mode==='drain')process.exitCode=1;
  if(mode==='drain')break;
  await pause(10000);
 }
}
