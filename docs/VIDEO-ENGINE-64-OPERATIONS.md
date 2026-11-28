# ASPEKT NEXT – VIDEO ENGINE PRO 6.4 (local staging only)

## Safety contract
- No changes to main or a live Supabase project.
- The worker refuses all Supabase URLs except http://localhost:54321 or http://127.0.0.1:54321.
- Never provide a production service-role key. Use only the temporary local Supabase key.
- The raw input bucket and the processed output bucket are both **private**; only server service-role access can read processed files.
- Moderation approval alone does not publish a file. Explicit staff publication creates a publication record; revocation disables issuance of new links. Existing signed links may persist up to 60 seconds.
- Public delivery is disabled until VIDEO_PUBLIC_DELIVERY_ENABLED=true is deliberately configured in the video-playback Edge Function. The app does not deploy it.
- No user-facing publishing UI or paid creator features are enabled.

## Processing path
1. Authenticated creator uploads a 20 MiB max MP4/WebM input to their own Storage folder.
2. video_register_upload() verifies the authenticated owner and inserts a quarantined review row.
3. A database trigger creates a processing job.
4. video_job_claim() atomically claims at most one eligible job using row locking and a three-minute lease; retries are exponential, at most three attempts.
5. scripts/video-worker.mjs downloads input, validates bytes with FFprobe, transcodes with FFmpeg to muted H.264 MP4 at up to 1280×720, validates output, and uploads it to an immutable, lease-specific private output path.
6. video_job_finish() checks the lease token and the existence of the processed object before marking the review validated. Bad media is rejected; transient failures retry.
7. TRUST & JUSTICE staff, never the creator, may approve; a further explicit staff RPC video_publish() publishes metadata only. video_revoke() revokes it.
8. Optional video-playback Edge Function verifies active publication and approval and issues a 60-second signed Storage link.

## Running with disposable Supabase locally
Use the GitHub Actions workflow **Isolated Supabase video integration** for the tested workflow. It creates a fresh temporary Supabase project from selected migrations. Locally, avoid a link to any remote project.

Run `node scripts/video-worker.mjs --drain` to finish current jobs and exit, or `node scripts/video-worker.mjs --daemon` for polling and recovery. Requires Node 24+, ffprobe, ffmpeg, SUPABASE_URL=http://127.0.0.1:54321, and a **local-only** SUPABASE_SERVICE_ROLE_KEY injected by the supervisor. Do not commit it or EXPO_PUBLIC-prefixed service credentials.

The sample systemd unit deploy/systemd/aspekt-video-worker.service restarts the local worker after a crash. It is a **template**, not activated by CI. Install on an isolated Linux test host with a dedicated unprivileged user, version-pinned app code and a root-managed private EnvironmentFile. The worker must be able to reach localhost Supabase in the same network namespace.

## Operational limitations
- No production rollout, no real CDN, no background scheduling or external queue infrastructure is configured.
- Processing leases are three minutes; slow uploads/FFmpeg tasks could exceed this and be retried. Output paths are immutable to prevent stale jobs overwriting new output.
- Failed jobs produce a private error record; monitoring, metrics, alerting and retention cleanup of orphaned temporary processed objects are pending.
- End-to-end tests exercise local Supabase API, private Storage, real transcoding and controlled publication. They do **not** guarantee native device behavior or production security.
- The processed output must remain private. Never turn either bucket public.
