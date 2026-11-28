import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source=readFileSync('src/lib/videoStagingGate.ts','utf8');
const output=ts.transpileModule(source,{compilerOptions:{
 module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022
}}).outputText;
const context={module:{exports:{}},exports:{},URL};
context.exports=context.module.exports;
vm.runInNewContext(output,context,{filename:'videoStagingGate.ts',timeout:1000});
const {isApprovedVideoStagingUrl:allowed,APPROVED_VIDEO_STAGING_ORIGINS:approved}=context.module.exports;
assert.deepEqual([...approved],[],'HTTPS origin allowlist must remain empty until reviewed');
for(const url of ['http://127.0.0.1:54321','http://localhost:54321','http://localhost:54321/']) assert.equal(allowed(url),true,url);
for(const url of [
 undefined,null,'','http://127.0.0.1:54322','http://192.168.1.3:54321',
 'http://localhost:54321@evil.example','http://localhost:54321/storage',
 'https://example.supabase.co','https://approved-staging.example.org',
 'https://example.supabase.co/storage/v1',
 'https://user:password@example.supabase.co','https://example.supabase.co/?x=1',
 'javascript:alert(1)'
]) assert.equal(allowed(url),false,String(url));
console.log('PASS: video staging remains fail-closed for every non-loopback origin');
