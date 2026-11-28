import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Exercises the real TS upload module with hermetic native file/network mocks.
// No production credentials, no external services.
const source=readFileSync('src/lib/nativeVideoUpload.ts','utf8');
const javascript=ts.transpileModule(source,{compilerOptions:{
 module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022
}}).outputText;
const bytes=Uint8Array.from([0,0,0,16,102,116,121,112,109,112,52,50]);
const selected={uri:'file:///cache/test.mp4',name:'test.mp4',size:12,mimeType:'video/mp4'};
const uploads=[],notices=[];
let registered=null,loggedIn=true,responseStatus=200;
let registrationFails=false,metadataFails=false,registrationCalls=0,metadataCalls=0;
class NativeFile{
 constructor(uri){assert.equal(uri,selected.uri);this.exists=true;this.size=bytes.length;}
 open(mode){
  assert.equal(mode,'read-only');
  return {
   readBytesSync(length){assert.equal(length,12);return bytes;},
   close(){}
  };
 }
 createUploadTask(url,options){
  uploads.push({url,options});
  return {
   async uploadAsync(){
    options.onProgress?.({bytesSent:bytes.length,totalBytes:bytes.length});
    if(options.signal?.aborted)throw Error('Cancelled');
    return {status:responseStatus,body:'',headers:{}};
   }
  };
 }
}
const supabase={
 auth:{
  getUser:async()=>({data:{user:loggedIn?{id:'11111111-1111-4111-8111-111111111111'}:null},error:null}),
  getSession:async()=>({data:{session:loggedIn?{
   access_token:'test-access-token',
   user:{id:'11111111-1111-4111-8111-111111111111'}
  }:null},error:null})
 },
 rpc:async(name,args)=>{
  assert.equal(name,'video_register_upload');
  registrationCalls++;
  assert.equal(args.p_path,uploads.at(-1).url.split('/aspekt-video-private/')[1]);
  if(registrationFails)return {data:null,error:{message:'quarantine unavailable'}};
  return {data:'22222222-2222-4222-8222-222222222222',error:null};
 }
};
const runtime={
 module:{exports:{}},exports:{},
 require:(name)=>{
  if(name==='expo-document-picker')return {getDocumentAsync:async()=>({canceled:false,assets:[selected]})};
  if(name==='expo-file-system')return {
   File:NativeFile,FileMode:{ReadOnly:'read-only'},UploadType:{BINARY_CONTENT:0}
  };
  if(name==='expo-crypto')return {randomUUID:()=> '33333333-3333-4333-8333-333333333333'};
  if(name==='./supabase')return {supabase};
  if(name==='./privateVideo')return {privateVideoEnabled:true,PRIVATE_VIDEO_BUCKET:'aspekt-video-private'};
  if(name==='./videoPlatform')return {updateVideoMetadata:async(id,title,desc,kind)=>{
   metadataCalls++;
   if(metadataFails)throw Error('metadata unavailable');
   registered={id,title,desc,kind};
  }};
  throw Error('Unexpected import '+name);
 },
 AbortController,Uint8Array,Number,Math,String,Error,
 process:{env:{EXPO_PUBLIC_SUPABASE_URL:'http://127.0.0.1:54321',EXPO_PUBLIC_SUPABASE_ANON_KEY:'test-only'}}
};
runtime.exports=runtime.module.exports;
vm.runInNewContext(javascript,runtime,{filename:'nativeVideoUpload.ts',timeout:1000});
const lib=runtime.module.exports;
assert.equal(lib.MAX_BETA_VIDEO_BYTES,20971520);
assert.equal(lib.sniffVideoHeader(bytes,'video/mp4'),true);
assert.equal(lib.sniffVideoHeader(bytes,'video/webm'),false);
assert.throws(()=>lib.validateNativeVideoSelection({...selected,size:20971521}));
assert.throws(()=>lib.validateNativeVideoSelection({...selected,mimeType:'video/webm'}));
assert.throws(()=>lib.validateNativeVideoSelection({...selected,uri:'https://evil.example/movie.mp4'}));
assert.equal((await lib.pickNativeVideo()).name,'test.mp4');
const id=await lib.uploadNativeVideo(
 lib.validateNativeVideoSelection(selected),
 {title:'Test Native Upload',description:'Private test',kind:'short'},
 p=>notices.push(p)
);
assert.equal(id,'22222222-2222-4222-8222-222222222222');
assert.equal(uploads.length,1);
assert.ok(uploads[0].url.startsWith('http://127.0.0.1:54321/storage/v1/object/aspekt-video-private/11111111-1111-4111-8111-111111111111/'));
assert.equal(uploads[0].options.headers.Authorization,'Bearer test-access-token');
assert.equal(uploads[0].options.headers['x-upsert'],'false');
assert.equal(uploads[0].options.uploadType,0);
assert.ok(notices.some(n=>n.stage==='uploading'&&n.percent===99));
assert.equal(notices.at(-1).stage,'complete');
assert.equal(registered.title,'Test Native Upload');
loggedIn=false;
await assert.rejects(lib.uploadNativeVideo(lib.validateNativeVideoSelection(selected),{
 title:'No login',description:'',kind:'video'
},()=>{}));
assert.equal(uploads.length,1,'Unauthenticated request reached Storage');
loggedIn=true;responseStatus=403;
await assert.rejects(lib.uploadNativeVideo(lib.validateNativeVideoSelection(selected),{
 title:'Forbidden',description:'',kind:'video'
},()=>{}));
assert.equal(uploads.length,2);
assert.equal(registered.title,'Test Native Upload','Rejected upload must not register quarantine');
const controller=new AbortController();controller.abort();
await assert.rejects(lib.uploadNativeVideo(lib.validateNativeVideoSelection(selected),{
 title:'Cancelled',description:'',kind:'video'
},()=>{},controller.signal));
assert.equal(uploads.length,2,'Cancelled upload still reached the network');
// Cancellation while bytes are being sent must not register or save metadata.
responseStatus=200;
const midFlight=new AbortController();
const beforeMidFlight={uploads:uploads.length,registrationCalls,metadataCalls};
await assert.rejects(lib.uploadNativeVideo(lib.validateNativeVideoSelection(selected),{
 title:'Mid-flight cancellation',description:'',kind:'video'
},p=>{if(p.stage==='uploading')midFlight.abort();},midFlight.signal));
assert.equal(uploads.length,beforeMidFlight.uploads+1);
assert.equal(registrationCalls,beforeMidFlight.registrationCalls);
assert.equal(metadataCalls,beforeMidFlight.metadataCalls);
// A successful Storage response is not sufficient to claim a registered draft.
registrationFails=true;
const beforeRegistration={registrationCalls,metadataCalls};
await assert.rejects(lib.uploadNativeVideo(lib.validateNativeVideoSelection(selected),{
 title:'Registration fails',description:'',kind:'video'
},()=>{}),/Quarantäne-Registrierung fehlgeschlagen/);
assert.equal(registrationCalls,beforeRegistration.registrationCalls+1);
assert.equal(metadataCalls,beforeRegistration.metadataCalls);
registrationFails=false;
// Metadata persistence failure must never report a completed upload.
metadataFails=true;
const stages=[];
const beforeMetadata=metadataCalls;
await assert.rejects(lib.uploadNativeVideo(lib.validateNativeVideoSelection(selected),{
 title:'Metadata fails',description:'',kind:'short'
},p=>stages.push(p.stage)),/metadata unavailable/);
assert.equal(metadataCalls,beforeMetadata+1);
assert.ok(!stages.includes('complete'),'Failed metadata was announced as complete');
metadataFails=false;
console.log('PASS: native picker, signature, byte limits, progress, authorization, preflight and mid-flight cancellation, registration and metadata failure');
