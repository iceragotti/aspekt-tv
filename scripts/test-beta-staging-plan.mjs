import assert from 'node:assert/strict';
import {inspectStagingPlan} from './check-beta-staging-plan.mjs';
const base={
 schemaVersion:1,environment:'aspekt-next-beta',
 stagingSupabaseProjectRef:'abcdefghijklmnopqrst',
 productionSupabaseProjectRef:'uvwxyzabcdefghijklmn',
 stagingSupabaseUrl:'https://abcdefghijklmnopqrst.supabase.co',
 easProjectId:'123e4567-e89b-42d3-a456-426614174000',
 iosBundleIdentifier:'at.aspekt.beta',productionIosBundleIdentifier:'at.aspekt.prod',
 androidApplicationId:'at.aspekt.beta',productionAndroidApplicationId:'at.aspekt.prod',
 targetCommitSha:'a'.repeat(40),qualityCommitSha:'a'.repeat(40),storageCommitSha:'a'.repeat(40),
 reviewedBy:'reviewer-example'
};
assert.deepEqual(inspectStagingPlan(base),[]);
const fail=(changes,pattern)=>{
 const errors=inspectStagingPlan({...base,...changes});
 assert.ok(errors.some(e=>pattern.test(e)),JSON.stringify(errors));
};
fail({stagingSupabaseProjectRef:base.productionSupabaseProjectRef},/references MUST differ/);
fail({stagingSupabaseUrl:'http://abcdefghijklmnopqrst.supabase.co'},/stagingSupabaseUrl/);
fail({stagingSupabaseUrl:'https://wrong.supabase.co'},/stagingSupabaseUrl/);
fail({stagingSupabaseUrl:'https://uvwxyzabcdefghijklmn.supabase.co'},/URL must match/);
fail({iosBundleIdentifier:base.productionIosBundleIdentifier},/Beta iOS/);
fail({androidApplicationId:base.productionAndroidApplicationId},/Beta Android/);
fail({qualityCommitSha:'b'.repeat(40)},/both match target/);
fail({storageCommitSha:'b'.repeat(40)},/both match target/);
fail({reviewedBy:''},/reviewedBy/);
fail({serviceRoleKey:'never'},/Unexpected field/);
console.log('PASS: offline beta staging plan validates identity, HTTPS, distinct apps, matching commits and rejects secrets');
