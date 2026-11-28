/**
 * Explicit, code-reviewed origins for the NON-PRODUCTION video beta.
 *
 * Keep this list EMPTY until a separate HTTPS staging deployment has passed
 * ownership, project isolation and access-control review.
 * Never put the production Supabase origin here.
 *
 * Example syntax after approval:
 *   'https://approved-staging.example.org',
 */
export const APPROVED_VIDEO_STAGING_ORIGINS: readonly string[] = [];

const LOOPBACK = /^http:\/\/(localhost|127\.0\.0\.1):54321\/?$/;

export function isApprovedVideoStagingUrl(url: unknown): boolean {
  if (typeof url !== 'string') return false;
  if (LOOPBACK.test(url)) return true;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password ||
        parsed.pathname !== '/' || parsed.search || parsed.hash || parsed.port) return false;
    return APPROVED_VIDEO_STAGING_ORIGINS.includes(parsed.origin) &&
      url === parsed.origin;
  } catch {
    return false;
  }
}
