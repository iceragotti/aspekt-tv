#!/usr/bin/env node
// Read-only beta release preflight. Does not connect to Supabase, EAS or GitHub.
import {readFileSync} from 'node:fs';
import {strict as assert} from 'node:assert';
const read=(path)=>JSON.parse(readFileSync(path,'utf8'));
const eas=read('eas.json'),app=read('app.json');
const gate=readFileSync('src/lib/videoStagingGate.ts','utf8');
const issues=[];
const requireCondition=(test,message)=>{if(!test) issues.push(message);};
for(const profileName of ['development','beta-preview']){
 const p=eas.build?.[profileName];
 requireCondition(p?.distribution==='internal',profileName+' must use internal distribution');
 requireCondition(p?.env?.EXPO_PUBLIC_TRUST_STAGING==='false',profileName+' trust staging must be off');
 requireCondition(p?.env?.EXPO_PUBLIC_VIDEO_STAGING==='false',profileName+' video staging must be off until approval');
}
requireCondition(eas.build?.['beta-preview']?.android?.buildType==='apk','Android beta-preview must use APK');
requireCondition(eas.build?.['beta-preview']?.ios?.simulator===false,'iOS beta-preview must target devices');
const matches=gate.match(/APPROVED_VIDEO_STAGING_ORIGINS:\s*readonly string\[\]\s*=\s*\[([^\]]*)\]/);
requireCondition(Boolean(matches),'Cannot verify HTTPS staging origin allowlist');
if(matches && matches[1].trim()) issues.push('Staging origin is configured; independently verify it belongs to a non-production project.');
requireCondition(!app.expo?.ios?.bundleIdentifier,'No reviewed iOS beta app ID recorded; distribution blocked');
requireCondition(!app.expo?.android?.package,'No reviewed Android beta app ID recorded; distribution blocked');
requireCondition(!app.expo?.extra?.eas?.projectId,'No reviewed EAS project recorded; distribution blocked');
// This check intentionally blocks release until an operator verifies requirements.
// It is not a replacement for manual account and CI evidence validation.
const blockers=[
 'GitHub Quality and isolated Supabase integration SUCCESS for the exact target SHA are not attested by this script',
 'An independent HTTPS staging Supabase project with RLS, private buckets and dummy accounts has not been verified',
 'Dedicated app IDs, EAS project and signing owners have not been verified',
 'Physical iOS and Android upload, cross-account and offline tests have not been verified'
];
console.log('ASPEKT NEXT 6.7.4 – READ-ONLY BETA PREFLIGHT');
for(const issue of issues) console.log('CONFIG: '+issue);
for(const blocker of blockers) console.log('BLOCKED: '+blocker);
console.log('No deployments, remote calls or mutations were performed.');
process.exitCode=1;
