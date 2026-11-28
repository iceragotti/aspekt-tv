import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// The native upload code executes against controlled picker, File, XHR and
// Supabase stubs. No cloud/network access; regression tests run on every push.
const file=readFileSync('src/lib/nativeVideoUpload.ts','utf8');
const js=ts.transpileModule(file,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const mp4=new Uint8Array(16);
mp4.set([0,0,0,16,102,116,121,112,109,112,52,50,0,0,0,0]);
let bytes=new Uint8Array(12);
bytes.set(mp4.subarray(0,12));
let selected={uri:'file:///cache/test.mp4',name:'test.mp4',size:12,mimeType:'video/mp4'};
let registered=null;
const notices=[];
const uploads=[];
const state={auth:true,uploadStatus:200};
class NativeFile{
 constructor(uri){assert.equal(uri,selected.uri);this.exists=true;this.size=bytes.length;}
 async arrayBuffer(){return Uint8Array.from(bytes).buffer;}
}
class MockXHR{
 upload={onprogress:null};
 timeout=0;
 open(method,url){this.method=method;this.url=url;}
 setRequestHeader(name,value){(this.headers??={})[name.toLowerCase()]=value;}
 send(data){
  uploads.push({method:this.method,url:this.url,headers:this.headers,body:data});
  this.upload.onprogress?.({lengthComputable:true,loaded:bytes.length,total:bytes.length});
  this.status=state.uploadStatus;
  this.onload?.();
 }
 abort(){this.onabort?.();}
}
const supabase={
 auth:{
  getUser:async()=>({data:{user:state.auth?{id:'11111111-1111-4111-8111-111111111111'}:null},error:null}),
  getSession:async()=>({data:{session:state.auth?{access_token:'test-access-token',user:{id:'11111111-1111-4111-8111-111111111111'}}:null},error:null})
 },
 rpc:async(name,args)=>{
  assert.equal(name,'video_register_upload');
  assert.equal(args.p_path,uploads.at(-1).url.split('/aspekt-video-private/')[1]);
  return {data:'22222222-2222-4222-8222-222222222222',error:null};
 }
};
const context={
 module:{exports:{}},exports:{},require:(name)=>{
  if(name==='expo-document-picker')return {getDocumentAsync:async()=>({canceled:false,assets:[selected]})};
  if(name==='expo-file-system')return {File:NativeFile};
  if(name==='expo-crypto')return {randomUUID:()=> '33333333-3333-4333-8333-333333333333'};
  if(name==='./supabase')return {supabase};
  if(name==='./privateVideo')return {privateVideoEnabled:true,PRIVATE_VIDEO_BUCKET:'aspekt-video-private'};
  if(name==='./videoPlatform')return {updateVideoMetadata:async(id,title,desc,kind)=>registered={id,title,desc,kind}};
  throw Error('Unexpected module '+name);
 },XMLHttpRequest:MockXHR,AbortController,URL,Uint8Array,Error,Number,Math,String,
 process:{env:{EXPO_PUBLIC_SUPABASE_URL:'http://127.0.0.1:54321',EXPO_PUBLIC_SUPABASE_ANON_KEY:'test-only'}}
};
context.exports=context.module.exports;
vm.runInNewContext(js,context,{filename:'nativeVideoUpload.ts',timeout:1000});
const lib=context.module.exports;
assert.equal(lib.MAX_BETA_VIDEO_BYTES,20971520);
assert.equal(lib.sniffVideoHeader(bytes,'video/mp4'),true);
assert.equal(lib.sniffVideoHeader(bytes,'video/webm'),false);
assert.throws(()=>lib.validateNativeVideoSelection({...selected,size:20971521}));
assert.throws(()=>lib.validateNativeVideoSelection({...selected,mimeType:'video/webm'}));
assert.throws(()=>lib.validateNativeVideoSelection({...selected,uri:'https://evil.example/movie.mp4'}));
assert.equal((await lib.pickNativeVideo()).name,'test.mp4');
const result=await lib.uploadNativeVideo(
 lib.validateNativeVideoSelection(selected),
 {title:'Test Native Upload',description:'Private test',kind:'short'},
 p=>notices.push(p)
);
assert.equal(result,'22222222-2222-4222-8222-222222222222');
assert.equal(uploads.length,1);
assert.equal(uploads[0].method,'POST');
assert.ok(uploads[0].url.startsWith('http://127.0.0.1:54321/storage/v1/object/aspekt-video-private/11111111-1111-4111-8111-111111111111/'));
assert.equal(uploads[0].headers.authorization,'Bearer test-access-token');
assert.equal(uploads[0].headers['x-upsert'],'false');
assert.equal(uploads[0].body.byteLength,12);
assert.ok(notices.some(n=>n.stage==='uploading'&&n.percent===99));
assert.equal(notices.at(-1).stage,'complete');
assert.equal(registered.title,'Test Native Upload');
state.auth=false;
await assert.rejects(lib.uploadNativeVideo(lib.validateNativeVideoSelection(selected),{title:'No login',description:'',kind:'video'},()=>{}));
assert.equal(uploads.length,1,'Unauthenticated upload reached Storage');
state.auth=true;state.uploadStatus=403;
await assert.rejects(lib.uploadNativeVideo(lib.validateNativeVideoSelection(selected),{title:'Rejected',description:'',kind:'video'},()=>{}));
assert.equal(uploads.length,2,'Expected one rejected request');
assert.equal(registered.title,'Test Native Upload','Failed HTTP upload must not register quarantine');
console.log('PASS: native picker, signature checks, byte limits, authenticated XHR progress and fail-closed quarantine');
