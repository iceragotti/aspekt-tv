# ASPEKT NEXT – Phase 6.6 Beta-Testplan

**Status:** Development-only. No public production release or production migrations.
**Branch:** `aspekt-next`. Never merge unreviewed changes into `main`.

## Isolated staging setup
1. Install Docker, Supabase CLI 2.x, Node 24 and ffmpeg/ffprobe on a test computer.
2. From the repository, run `bash scripts/prepare-video-beta-staging.sh`. It refuses remote database credentials and any existing target directory. The script copies ONLY the video/Trust migrations into an independent local Supabase directory and starts local services on 127.0.0.1:54321.
3. Set `EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` to the **local** publishable key, and `EXPO_PUBLIC_VIDEO_STAGING=true` for the **development** app. Do not put the service-role key in any EXPO_PUBLIC variable.
4. Use a separate terminal for `node scripts/video-worker.mjs --daemon` with local `SUPABASE_URL` and the locally generated `SUPABASE_SERVICE_ROLE_KEY`. The worker refuses cloud URLs.
5. The Edge function is disabled unless explicitly started for local tests with `VIDEO_PUBLIC_DELIVERY_ENABLED=true`. No automatic deployment is configured. Use separate dummy accounts only.
6. Stop services from the staging directory with `supabase stop --no-backup`. Do not point the local project at a remote Supabase project.

## Creator acceptance tests (web)
- Create a dedicated dummy creator account in the Video tab, log in and out, and verify the private library is inaccessible after sign-out.
- Create a unique channel with handle, display name and description. Reload and verify persistence.
- Upload a valid MP4/WebM under 20 MiB with title, description and Video/Short format in Studio. Confirm that the new item is quarantined and not in Discover.
- Start the isolated worker and verify the item reaches *validated*. The JPEG preview is generated and remains private.
- In the local Trust & Justice flow, an **independent** moderator approves and publishes the video. Verify that Search, Discover, the channel page and the Shorts filter (for Shorts) show it.
- Verify that only a 60-second signed link is returned by the local video-playback endpoint. Inspect that internal Docker hostnames and service keys are not exposed.
- Try editing the title after moderation approval: the backend must reject it.
- Withdraw the publication as the creator. New playback/thumbnail links and anonymous catalog entries must become unavailable.
- Test foreign-account access to private Storage, metadata, worker jobs, creator profiles and unpublished videos.

## Automated CI
- `ASPEKT NEXT quality`: TypeScript, Expo web export, SQL authorization tests, FFprobe validation and dependency checks.
- `Isolated Supabase video integration`: temporary Supabase Auth + Storage, database migrations, accounts, private uploads, real FFmpeg transcoding, poster generation, independent moderation, release/revocation and anonymous search.
- The workflow has **no database deployment credentials** and must not be extended to use production credentials.

## Outstanding beta blockers
- Native iOS/Android upload and end-to-end physical device testing are **not implemented/verified**. The Expo native player supports approved playback, but localhost staging is not reachable directly from physical devices.
- No operating public staging domain or CDN. Local Edge-delivery may be enabled only with test accounts.
- Operational monitoring, transcoding quotas, video copyright review, vulnerability scanning of third-party binaries and persistent backups are pending.
- Uploaded video volume/length limits remain prototype-sized. Expired signatures cannot revoke already fetched media bytes.
- The current workflow checks one synthesized video; it is not a complete performance, accessibility or abuse-resistance test.
