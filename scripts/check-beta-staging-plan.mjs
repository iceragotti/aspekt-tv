// Read-only, offline shape verification. Never grants a deployment approval.
import {readFileSync} from 'node:fs';
import {fileURLToPath, pathToFileURL} from 'node:url';

export function inspectStagingPlan(plan) {
 const errors=[];
 const requireField=(key,pattern,label=key)=>{
  const value=plan?.[key];
  if(typeof value!=='string'||!pattern.test(value)) errors.push('Missing or invalid '+label);
  return typeof value==='string'?value:'';
 };
 if(plan?.schemaVersion!==1)errors.push('Unsupported schemaVersion');
 if(plan?.environment!=='aspekt-next-beta')errors.push('Environment must be aspekt-next-beta');
 const project=/^[a-z0-9]{20}$/;
 const staging=requireField('stagingSupabaseProjectRef',project);
 const production=requireField('productionSupabaseProjectRef',project);
 if(staging&&staging===production)errors.push('Staging and production Supabase references MUST differ');
 const url=requireField('stagingSupabaseUrl',/^https:\/\/[a-z0-9]{20}\.supabase\.co$/);
 if(staging&&url!==`https://${staging}.supabase.co`)errors.push('HTTPS URL must match the staging project ref exactly');
 requireField('easProjectId',/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
 const identifier=/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*){2,}$/;
 const ios=requireField('iosBundleIdentifier',identifier);
 const prodIos=requireField('productionIosBundleIdentifier',identifier);
 const android=requireField('androidApplicationId',identifier);
 const prodAndroid=requireField('productionAndroidApplicationId',identifier);
 if(ios&&ios===prodIos)errors.push('Beta iOS bundle ID must be separate from production');
 if(android&&android===prodAndroid)errors.push('Beta Android application ID must be separate from production');
 const commit=/^[0-9a-f]{40}$/i;
 const target=requireField('targetCommitSha',commit);
 const quality=requireField('qualityCommitSha',commit);
 const storage=requireField('storageCommitSha',commit);
 if(target&&(quality!==target||storage!==target))errors.push('Quality and Storage must both match target commit SHA');
 requireField('reviewedBy',/^[a-zA-Z0-9][a-zA-Z0-9_.-]{1,63}$/);
 const allowed=new Set([
 'schemaVersion','environment','stagingSupabaseProjectRef','productionSupabaseProjectRef',
 'stagingSupabaseUrl','easProjectId','iosBundleIdentifier','productionIosBundleIdentifier',
 'androidApplicationId','productionAndroidApplicationId','targetCommitSha','qualityCommitSha',
 'storageCommitSha','reviewedBy'
 ]);
 if(!plan||typeof plan!=='object'||Array.isArray(plan))errors.push('Plan must be an object');
 else for(const k of Object.keys(plan))if(!allowed.has(k))errors.push('Unexpected field: '+k+' (do not store credentials)');
 return errors;
}

const invoked=process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1];
if(invoked){
 const path=process.argv[2];
 if(!path){console.error('Usage: node scripts/check-beta-staging-plan.mjs PATH_TO_PRIVATE_NONSECRET_PLAN');process.exitCode=2;}
 else{
  try{
   const errors=inspectStagingPlan(JSON.parse(readFileSync(path,'utf8')));
   if(errors.length){for(const e of errors)console.error('BLOCKED: '+e);process.exitCode=1;}
   else console.log('PASS: Nonsecret plan is internally consistent. NOT a security review or deployment approval.');
   console.log('No remote services accessed. Never store credentials in this plan.');
  }catch(e){console.error('BLOCKED: Cannot read/parse plan: '+e.message);process.exitCode=1;}
 }
}
