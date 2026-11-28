import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const eas=JSON.parse(readFileSync('eas.json','utf8'));
const app=JSON.parse(readFileSync('app.json','utf8'));
const profiles=['development','beta-preview'];
for(const name of profiles){
 const p=eas.build?.[name];
 assert.ok(p,`Missing EAS profile: ${name}`);
 assert.equal(p.distribution,'internal',`Public distribution forbidden: ${name}`);
 assert.equal(p.env?.EXPO_PUBLIC_VIDEO_STAGING,'false',`Unexpected video staging enablement: ${name}`);
 assert.equal(p.env?.EXPO_PUBLIC_TRUST_STAGING,'false',`Unexpected trust staging enablement: ${name}`);
 assert.ok(p.channel?.startsWith('aspekt-next-'),`Unexpected update channel: ${name}`);
 assert.ok(!p.env?.EXPO_PUBLIC_SUPABASE_URL,`Never commit a backend origin into ${name}`);
 assert.ok(!p.env?.EXPO_PUBLIC_SUPABASE_ANON_KEY,`Never commit backend keys into ${name}`);
}
assert.equal(eas.build['beta-preview'].android?.buildType,'apk','Android preview must be installable APK');
assert.equal(eas.build['beta-preview'].ios?.simulator,false,'iOS preview targets real devices');
assert.equal(app.expo?.slug,'aspekt-tv');
assert.ok(!app.expo?.extra?.eas?.projectId,'EAS project ID requires explicit account verification before beta release');
assert.ok(!app.expo?.ios?.bundleIdentifier && !app.expo?.android?.package,
 'Dedicated beta application IDs must be reviewed before distribution; keep app.json unchanged');
console.log('PASS: EAS internal profiles and disabled staging; distribution still requires verified app IDs and credentials');
