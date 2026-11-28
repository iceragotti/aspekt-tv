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
- The app currently requires `EXPO_PUBLIC_VIDEO_STAGING=true` and the **literal** `EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321` (or localhost) with the local anon/publishable key; this intentionally **rejects cloud and production URLs**.
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

## Known beta limitations
- 20 MiB limit is intentionally small; native selection copies to cache. Very large files and background-resumable uploads are out of scope.
- Network interruptions can leave an unregistered private Storage object; require a server-side stale-object cleanup process before scaling.
- Progress is only for bytes sent to Storage; processing, review and publication use separate server states.
- Server performs actual byte validation after upload; the client-side file header check is only fast feedback.
- Temporary signed links can continue working until they expire; revocation prevents issuance of new links.
