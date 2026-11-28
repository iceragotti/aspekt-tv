# ASPEKT NEXT Phase 6.7 – Device & Closed Beta Readiness

This implementation is **only** on `aspekt-next`. Do not merge into `main`, link Supabase to production, or ship a public beta without review.

## Native creator journey (iOS + Android)

1. Install an **Expo development build** compatible with SDK 58 and the modules `expo-document-picker`, `expo-file-system`, `expo-crypto`, and `expo-video`.
2. Sign in using a **dummy** account in the Video Center, create a creator channel, and open Studio.
3. Select MP4 or WebM via the OS document picker (file copied to app cache), maximum **20 MiB**.
4. Enter a title (mandatory), description (optional) and Video/Short format.
5. Use **Privat hochladen** to run Expo's native binary upload task. The progress bar reflects native `bytesSent/totalBytes`, not a fake timer. Abbrechen cancels the request.
6. A successful Storage upload is registered through `video_register_upload` (owner-only) and `video_save_metadata`. Only then does the app announce a completed private draft. On failures it does **not** pretend to publish.
7. Open Library and verify `quarantine` state, processing status and eventual independent approval. The moderator publishes as a separate action; withdrawal prevents issuing new signed links.

## Running in the *isolated* local beta environment

- Use `bash scripts/prepare-video-beta-staging.sh` from the repository, after checking no remote Supabase keys/environment variables are present.
- The app requires `EXPO_PUBLIC_VIDEO_STAGING=true` and an allowed Supabase URL. Local loopback works as before. External HTTPS origins are denied until reviewed and explicitly listed in `src/lib/videoStagingGate.ts`. The shipped allowlist is empty; never add production.
- **Android emulator:** if Supabase is running on the same development computer, set up `adb reverse tcp:54321 tcp:54321` so `127.0.0.1:54321` on the emulator reaches the host.
- **iOS simulator:** loopback generally reaches the local host. Verify the connection in the simulator rather than assuming.
- **Physical iOS/Android phones cannot access this loopback-only configuration across Wi-Fi.** No physical-device end-to-end success has been established. A separate, non-production HTTPS staging host, its authentication and key handling, and a deliberately reviewed staging allowlist are prerequisites before physical-device upload testing.
- For the local worker, use only local `SUPABASE_URL` and local `SUPABASE_SERVICE_ROLE_KEY`. Never put the service key in `EXPO_PUBLIC_*` or a client build.
- Both `aspekt-video-private` and `aspekt-video-processed` remain private. Only approved/publication-active media can receive a new signed viewing link.

## Closed beta builds (preparation only)

`eas.json` contains `development` and `beta-preview` **internal distribution** profiles. Both explicitly disable video staging by default. No Android APK, iOS IPA, store submission, or hosted staging service has been generated or deployed.

Before actual internal build distribution:
- Choose and verify unique iOS bundle identifier / Android application ID (not provided in current `app.json`).
- Set up an Expo/EAS project in the correct owner account and app-signing credentials. Do not share secrets in chat or commit them.
- Have a trusted human review the branch and data handling.
- Create an independent staging service accessible from devices (never the production Supabase project).
- Confirm device UX with at least one real Android device, one real iPhone, low bandwidth, expired login, large and malformed file rejection, network loss, cancellation, duplicate uploads, account switches, private access by a second user, and final publication withdrawal.

## Automated verification
The `ASPEKT NEXT quality` workflow runs `scripts/test-native-video-upload.mjs` against the actual TypeScript upload module using mocked document picker, native file task, user auth and storage API. It checks file validation, progress based on real byte counters, authorization, failed uploads and cancellation.

The `Isolated Supabase video integration` workflow separately exercises real local Supabase Auth/Storage with transcoding, quarantine, media review and publication. **The mocked native upload test does not replace physical-device testing.**

## Phase 6.7.2 – HTTPS device beta readiness gate

**NOT DEPLOYED:** This branch prepares an origin gate only; no hosted staging server or physical-device upload has been verified.

1. Provision a separate Supabase staging project with unique keys, storage, database and dummy users; never link production.
2. Verify TLS, authentication, RLS, private buckets, upload constraints, rate limits, cleanup of orphaned files and worker isolation.
3. Only after a human security review, add the exact HTTPS origin to `src/lib/videoStagingGate.ts`. Never add production.
4. Configure only the staging public anon/publishable key in the client. Service-role keys belong on isolated servers, never inside the app.
5. Assign unique application identifiers and EAS signing credentials. Keep both beta build profile staging toggles false until approval.
6. Run all CI jobs and test Android/iOS phones with dummy files, failed uploads, cross-user access checks, cancellation and network loss.
7. Record go/no-go and rollback ownership. A client-side origin check is not an authorization boundary.

`scripts/test-video-staging-gate.mjs` is wired into the quality CI workflow; it tests the default fail-closed gate, not a live HTTPS endpoint.
## Phase 6.7.3 – CI and installable beta build preflight

**State:** Configuration prepared only. No HTTPS hosting, production data access, iOS IPA/Android APK generation, EAS credential registration or actual device validation occurred.

- The Quality workflow runs `node scripts/test-beta-build-config.mjs`, `node scripts/test-video-staging-gate.mjs`, the native upload mock suite, TypeScript checks, a web export and dependency audit. Supabase Storage integration runs separately on `aspekt-next` using disposable local services.
- GitHub's combined status may show Vercel success without proving GitHub Actions jobs passed. Inspect the actual workflow runs in GitHub Actions for this branch and record their commit SHA, conclusion, job names and failing step logs. Treat unavailable results as **UNVERIFIED**, never green.
- The internal `beta-preview` EAS profile targets an Android APK and a physical iOS device (`simulator: false`). Both development and beta profiles keep `EXPO_PUBLIC_VIDEO_STAGING=false` and `EXPO_PUBLIC_TRUST_STAGING=false`. This prevents accidental release but also means no device upload can yet occur using those profiles.
- **Build blocker:** App-specific iOS `bundleIdentifier`, Android `package`, EAS `projectId`, Apple signing/provisioning, and Android signing still require the correct owner's verification and a deliberate beta-only configuration. Do not reuse production identifiers or credentials without review.
- **HTTPS staging blocker:** Only after provisioning an independent Supabase project and verifying its project reference, RLS, Storage isolation, TLS, functions, dummy accounts and orphaned-object retention may reviewers approve its exact origin in `src/lib/videoStagingGate.ts`. The origin allowlist remains empty.
- Do not run `supabase link`, `supabase db push`, `supabase functions deploy`, `eas build`, `eas update`, `eas submit` or any remote migration as part of this preflight. These require a separately approved target and credentials.
- For go/no-go, obtain successful GitHub quality and Supabase integration results, verify signed upload and cross-account rejection against staging, and complete real device tests. Keep an evidence record and rollback plan.
## Known beta limitations
- 20 MiB limit is intentionally small; native selection copies to cache. Very large files and background-resumable uploads are out of scope.
- Network interruptions can leave an unregistered private Storage object; require a server-side stale-object cleanup process before scaling.
- Progress is only for bytes sent to Storage; processing, review and publication use separate server states.
- Server performs actual byte validation after upload; the client-side file header check is only fast feedback.
- Temporary signed links can continue working until they expire; revocation prevents issuance of new links.
