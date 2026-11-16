import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ANONYMOUS_QUESTION_IDS, validateAnonymousSubmission, classifySubmissionRetry, canReleasePlanningThemes, type CampaignContext } from './anonymous-planning-survey.ts';
const campaign: CampaignContext = {
  id: 'c9cdfa38-4c2e-48c9-91a5-05720dd332fe', business: 'vivacity', year: 2027,
  questionnaireVersion: '2027-strategy-v1', state: 'open', opensAtMs: 100, closesAtMs: 200,
};
const valid = () => ({ campaignId: campaign.id, questionnaireVersion: campaign.questionnaireVersion,
  idempotencyKey: '9d4c20e4-0265-4cd1-b4ba-7f6fd3b6517c',
  answers: Object.fromEntries(ANONYMOUS_QUESTION_IDS.map(id => [id, id === 'strengths' ? 'Useful sample' : ''])),
});
describe('anonymous planning collection contract (not live collection)', () => {
  it('keeps only the exact specified application fields', () => {
    const result = validateAnonymousSubmission(valid(), campaign, 150);
    assert.deepEqual(Object.keys(result), ['campaignId', 'questionnaireVersion', 'idempotencyKey', 'answers']);
    assert.equal(result.answers.strengths, 'Useful sample');
  });
  it('rejects every identity/timing/transport field rather than retaining it', () => {
    for (const key of ['userId', 'email', 'createdBy', 'createdAt', 'ip', 'token', 'business', 'year', 'role', 'clientId']) {
      assert.throws(() => validateAnonymousSubmission({ ...valid(), [key]: 'IDENTITY_CANARY' }, campaign, 150),
        { message: 'Submission is not accepted.' });
    }
  });
  it('rejects nested identity and metadata in answers', () => {
    const input = valid();
    assert.throws(() => validateAnonymousSubmission({ ...input, answers: { ...input.answers, email: 'IDENTITY_CANARY' } }, campaign, 150));
    assert.throws(() => validateAnonymousSubmission({ ...input, answers: { ...input.answers, strengths: { user: 'IDENTITY_CANARY' } } }, campaign, 150));
  });
  it('rejects cross-campaign and old questionnaire submissions', () => {
    assert.throws(() => validateAnonymousSubmission({ ...valid(), campaignId: 'b10da8ee-f8a3-41fb-a374-62f773fe746b' }, campaign, 150));
    assert.throws(() => validateAnonymousSubmission({ ...valid(), questionnaireVersion: 'old' }, campaign, 150));
  });
  it('fails closed for unavailable campaigns and invalid clock/window', () => {
    for (const state of ['draft', 'closed'] as const) assert.throws(() => validateAnonymousSubmission(valid(), { ...campaign, state }, 150));
    for (const now of [99, 200, NaN, Infinity]) assert.throws(() => validateAnonymousSubmission(valid(), campaign, now));
    assert.throws(() => validateAnonymousSubmission(valid(), { ...campaign, opensAtMs: 200 }, 150));
    assert.throws(() => validateAnonymousSubmission(valid(), { ...campaign, closesAtMs: NaN }, 150));
  });
  it('bounds answers and requires a nonempty contribution', () => {
    const input = valid();
    assert.throws(() => validateAnonymousSubmission({ ...input, answers: { ...input.answers, strengths: 'x'.repeat(3001) } }, campaign, 150));
    assert.throws(() => validateAnonymousSubmission({ ...input, answers: { ...input.answers, strengths: '  ' } }, campaign, 150));
    assert.throws(() => validateAnonymousSubmission({ ...input, idempotencyKey: 'email@example.test' }, campaign, 150));
  });
  it('identifies identical retries without permitting replacement or cross-business reuse', () => {
    const accepted = validateAnonymousSubmission(valid(), campaign, 150);
    assert.equal(classifySubmissionRetry(accepted, { ...accepted, answers: { ...accepted.answers } }), 'same');
    assert.equal(classifySubmissionRetry(accepted, { ...accepted, answers: { ...accepted.answers, strengths: 'Changed' } }), 'conflict');
    assert.equal(classifySubmissionRetry(accepted, { ...accepted, campaignId: 'b10da8ee-f8a3-41fb-a374-62f773fe746b' }), 'different');
  });
  it('does not pretend to anonymise self-identifying text', () => {
    const input = valid(); input.answers.strengths = 'I am IDENTITY_CANARY';
    assert.equal(validateAnonymousSubmission(input, campaign, 150).answers.strengths, 'I am IDENTITY_CANARY');
  });
  it('releases themes only after close, threshold decision and privacy review', () => {
    const gate = { campaignState: 'closed' as const, responseCount: 7, minimumResponses: 5, privacyReviewPassed: true };
    assert.equal(canReleasePlanningThemes(gate), true);
    for (const patch of [{campaignState: 'open' as const}, {minimumResponses: null}, {minimumResponses: 0}, {responseCount: 4}, {responseCount: NaN}, {privacyReviewPassed: false}]) {
      assert.equal(canReleasePlanningThemes({ ...gate, ...patch }), false);
    }
  });
});
