#!/usr/bin/env bash
set -euo pipefail
# Local-only, standalone staging. No remote Supabase credentials may be used.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STAGE="${ASPEKT_BETA_STAGE_DIR:-${TMPDIR:-/tmp}/aspekt-next-video-beta}"
if [[ -n "${SUPABASE_ACCESS_TOKEN:-}" || -n "${DATABASE_URL:-}" || -n "${SUPABASE_DB_URL:-}" ]]; then
  echo "Refusing to run with remote database credentials in the environment" >&2; exit 1
fi
if [[ -e "$STAGE" ]]; then
  echo "Staging directory already exists; refusing to overwrite: $STAGE" >&2; exit 1
fi
mkdir -p "$STAGE"
cd "$STAGE"
supabase init
mkdir -p supabase/migrations supabase/functions/video-playback
for migration in \
  20261128023000_trust_justice.sql \
  20261128060000_video_drafts.sql \
  20261128062000_video_engine.sql \
  20261128063000_video_review.sql \
  20261128065000_video_register_upload.sql \
  20261128070000_video_processing_publication.sql \
  20261128072000_video_platform.sql \
  20261128073000_video_platform_publish_gate.sql \
  20261128074000_video_creator_unpublish.sql \
  20261128080000_video_beta_catalog.sql; do
  cp "$ROOT/supabase/migrations/$migration" supabase/migrations/
done
cp "$ROOT/supabase/functions/video-playback/index.ts" supabase/functions/video-playback/index.ts
# The public delivery flag stays OFF. Only CI turns it on against disposable test data.
supabase start
echo "Local Supabase staging started at http://127.0.0.1:54321"
echo "Source project untouched. Run 'cd "$STAGE" && supabase stop --no-backup' to stop."
echo "Do not use real creator accounts or production keys."
