import {spawn} from 'node:child_process';
import {stat} from 'node:fs/promises';
import {resolve} from 'node:path';
// Trusted local worker only. Never expose arbitrary paths or this CLI to clients.
const path=resolve(process.argv[2]??'');
const info=await stat(path);
if(!info.isFile()||info.size<12||info.size>20*1024*1024) throw Error('Invalid size');
const result=await new Promise((resolve,reject)=>{
 const p=spawn('ffprobe',['-v','error','-protocol_whitelist','file','-show_format','-show_streams','-of','json',path],{stdio:['ignore','pipe','ignore']});
 let out='';const timer=setTimeout(()=>{p.kill('SIGKILL');reject(Error('Probe timeout'));},15000);
 p.stdout.on('data',b=>{out+=b;if(out.length>65536){p.kill('SIGKILL');reject(Error('Probe output limit'));}});
 p.on('error',e=>{clearTimeout(timer);reject(e);});
 p.on('close',code=>{clearTimeout(timer);if(code!==0)reject(Error('Invalid media'));else {try{resolve(JSON.parse(out));}catch(e){reject(e);}}});
});
const video=result.streams.filter(s=>s.codec_type==='video');
const duration=Number(result.format.duration);
if(video.length!==1||!['h264','vp8','vp9','av1'].includes(video[0].codec_name)||!(duration>0&&duration<=600)||!(video[0].width>0&&video[0].width<=3840&&video[0].height>0&&video[0].height<=2160))throw Error('Unsupported media');
console.log(JSON.stringify({duration,width:video[0].width,height:video[0].height,codec:video[0].codec_name}));
