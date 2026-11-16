/**
 * Pure draft collection contract. No handler, storage, auth bypass or deployment.
 * This validates application data; it does not establish infrastructure anonymity.
 * Eligibility/collection transport remains a separate release-gated decision.
 */
export const ANONYMOUS_QUESTION_IDS = [
  'strengths', 'weaknesses', 'opportunities', 'threats',
  'start', 'stop', 'keep', 'priority',
] as const;
export type AnonymousQuestionId = typeof ANONYMOUS_QUESTION_IDS[number];
export type AnonymousAnswers = Record<AnonymousQuestionId, string>;
export type CampaignContext = {
  id: string;
  business: 'vivacity' | 'complyhub';
  year: number;
  questionnaireVersion: string;
  state: 'draft' | 'open' | 'closed';
  opensAtMs: number;
  closesAtMs: number;
};
export type ValidatedSubmission = {
  campaignId: string;
  questionnaireVersion: string;
  /** Random, campaign-scoped retry identifier, never a respondent identifier. */
  idempotencyKey: string;
  answers: AnonymousAnswers;
};
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SUBMISSION_KEYS = ['campaignId', 'questionnaireVersion', 'idempotencyKey', 'answers'];

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const own = Object.keys(value);
  return own.length === keys.length && keys.every(key => Object.hasOwn(value, key));
}
function reject(): never {
  // Do not reflect payload, answer text, tokens or identity in diagnostics.
  throw new Error('Submission is not accepted.');
}

export function validateAnonymousSubmission(
  input: unknown,
  campaign: CampaignContext,
  nowMs: number,
): ValidatedSubmission {
  // Campaign context is server-resolved, not copied from request metadata.
  if (!UUID_V4.test(campaign.id) || !['vivacity', 'complyhub'].includes(campaign.business)
    || !Number.isInteger(campaign.year) || campaign.year < 2027 || campaign.year > 2100
    || !campaign.questionnaireVersion || campaign.questionnaireVersion.length > 100
    || campaign.state !== 'open' || !Number.isFinite(nowMs)
    || !Number.isFinite(campaign.opensAtMs) || !Number.isFinite(campaign.closesAtMs)
    || campaign.opensAtMs >= campaign.closesAtMs
    || nowMs < campaign.opensAtMs || nowMs >= campaign.closesAtMs) reject();
  if (!record(input) || !exactKeys(input, SUBMISSION_KEYS)) reject();
  if (input.campaignId !== campaign.id || input.questionnaireVersion !== campaign.questionnaireVersion
    || typeof input.idempotencyKey !== 'string' || !UUID_V4.test(input.idempotencyKey)
    || !record(input.answers) || !exactKeys(input.answers, ANONYMOUS_QUESTION_IDS)) reject();

  const entries: [AnonymousQuestionId, string][] = [];
  for (const id of ANONYMOUS_QUESTION_IDS) {
    const value = input.answers[id];
    if (typeof value !== 'string' || value.length > 3000) reject();
    entries.push([id, value.trim()]);
  }
  if (!entries.some(([, answer]) => answer.length > 0)) reject();
  return {
    campaignId: campaign.id,
    questionnaireVersion: campaign.questionnaireVersion,
    idempotencyKey: input.idempotencyKey,
    answers: Object.fromEntries(entries) as AnonymousAnswers,
  };
}

/**
 * Retry semantics, not one-person-one-response. Database adapter must enforce an
 * atomic unique (campaign_id, idempotency_key) and compare canonical contents.
 * Never overwrite an earlier ballot or report success on a changed retry.
 */
export function classifySubmissionRetry(
  accepted: ValidatedSubmission,
  retry: ValidatedSubmission,
): 'same' | 'conflict' | 'different' {
  if (accepted.campaignId !== retry.campaignId || accepted.idempotencyKey !== retry.idempotencyKey) return 'different';
  return accepted.questionnaireVersion === retry.questionnaireVersion
    && ANONYMOUS_QUESTION_IDS.every(id => accepted.answers[id] === retry.answers[id]) ? 'same' : 'conflict';
}

/** Fail closed until a reviewer-approved release policy exists. Not authorization. */
export function canReleasePlanningThemes(input: {
  campaignState: CampaignContext['state'];
  responseCount: number;
  minimumResponses: number | null;
  privacyReviewPassed: boolean;
}): boolean {
  return input.campaignState === 'closed' && input.privacyReviewPassed
    && Number.isInteger(input.responseCount) && input.responseCount >= 0
    && input.minimumResponses !== null && Number.isInteger(input.minimumResponses)
    && input.minimumResponses >= 2 && input.responseCount >= input.minimumResponses;
}
