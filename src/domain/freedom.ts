/** Pure domain rules; not a substitute for server authorization. */
export const FREEDOM_POLICY_VERSION = 'draft-1' as const;
export const FREEDOM_PRINCIPLES = [
  'Kontroverse Meinungen allein sind kein Sanktionsgrund.',
  'Redaktionelle Auswahl und Community-Moderation bleiben getrennt.',
  'Moderationsmaßnahmen benötigen eine nachvollziehbare Begründung.',
  'Betroffene erhalten einen Weg zum Einspruch.',
  'Persönliche Filter sind keine Plattformstrafen.',
  'Geltendes Recht und der Schutz anderer bleiben verbindlich.',
] as const;

export type FeedMode = 'chronological' | 'following';
export type FeedEntry = { id: string; authorId: string; createdAt: number };
/** Call only with entries already authorized by the server. */
export function selectFeed<T extends FeedEntry>(
  entries: readonly T[], mode: FeedMode, following: ReadonlySet<string>,
): T[] {
  return entries.filter(entry => Number.isFinite(entry.createdAt) &&
    (mode !== 'following' || following.has(entry.authorId)))
    .sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id));
}
export type ModerationReason = 'legal_requirement' | 'credible_threat' |
  'harassment' | 'fraud' | 'privacy_violation' | 'child_safety' | 'spam';
export type ModerationAction = 'restrict' | 'remove' | 'suspend';
export interface ModerationNotice {
  policyVersion: string;
  reason: ModerationReason;
  action: ModerationAction;
  explanation: string;
  appealAvailable: boolean;
}
/** Client-side completeness check only. Server must validate authority and facts. */
export function isCompleteNotice(notice: ModerationNotice): boolean {
  return notice.policyVersion.trim().length > 0 &&
    notice.explanation.trim().length > 0 &&
    ['legal_requirement','credible_threat','harassment','fraud','privacy_violation','child_safety','spam'].includes(notice.reason) &&
    ['restrict','remove','suspend'].includes(notice.action) &&
    typeof notice.appealAvailable === 'boolean';
}
