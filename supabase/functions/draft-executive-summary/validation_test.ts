/**
 * Pure-function tests for validateDraft.
 *
 * The architectural property — "no client_audit_log row is written when
 * validation hard-fails" — is enforced at the type level: the failure
 * branch returns `{ ok: false, reason }` with no `draft` field, and the
 * calling code in index.ts gates the `client_audit_log.insert` behind
 * `if (!validation.ok) return json(...502)` so the insert is structurally
 * unreachable. These tests exercise every failure mode the validator
 * detects, including the highest-leverage check: fabricated finding IDs.
 */
import { assert, assertEquals } from 'jsr:@std/assert@1';
import { validateDraft, type DraftJson } from './_validation.ts';

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const C = '33333333-3333-3333-3333-333333333333';
const FABRICATED = '99999999-9999-9999-9999-999999999999';

const validIds = new Set([A, B, C]);

function goodDraft(overrides: Partial<DraftJson> = {}): DraftJson {
  return {
    executive_summary: 'The audit examined the RTO across SRTOs 2025 Standards 1 to 4 and identified material gaps in trainer currency evidence and assessment validation cycles. Governing Persons demonstrated awareness of the issues but the rectification timeline is constrained by current consultant capacity.',
    overall_finding: 'The RTO is at High Risk against SRTOs 2025 with two critical findings requiring immediate remediation.',
    risk_rationale: 'The High Risk rating reflects the two critical findings against Standards 1.13 and 2.1 — trainer currency cannot be evidenced for three of the seven trainers in scope, and assessment validation has not occurred within the required 24-month cycle.',
    action_plan_rollup: {
      introduction: 'Remediation work clusters around evidence collection, validation cadence, and Governing Persons oversight. Sequencing is critical-first, with high-priority items running in parallel where consultant capacity permits.',
      priority_groups: [
        {
          priority: 'critical',
          narrative: 'These two actions address the immediate risk to ongoing registration and must be completed before the next ASQA touchpoint.',
          actions: [
            { summary: 'Collect current vocational competency evidence for all trainers on scope.', linked_finding_ids: [A] },
            { summary: 'Schedule and complete an assessment validation cycle for all current TPs.', linked_finding_ids: [B] },
          ],
        },
        {
          priority: 'high',
          narrative: 'These actions reduce the standing risk profile materially within the next quarter.',
          actions: [
            { summary: 'Refresh the policy register and re-issue the staff acknowledgement schedule.', linked_finding_ids: [C] },
          ],
        },
      ],
      closing: 'Implementation owner is the Compliance Manager with consultant support; expected timeline is 90 days for critical items, 180 days for high.',
    },
    confidence: 'high',
    uncertainty_notes: null,
    ...overrides,
  };
}

Deno.test('validateDraft: accepts a well-formed draft', () => {
  const result = validateDraft(goodDraft(), validIds);
  assert(result.ok, `expected ok, got: ${!result.ok && result.reason}`);
  if (result.ok) {
    assertEquals(result.draft.confidence, 'high');
  }
});

Deno.test('validateDraft: rejects a non-object', () => {
  const result = validateDraft(null, validIds);
  assert(!result.ok);
  // Architectural assertion — failure result has no `draft` field. The
  // calling code's log insert is structurally unreachable.
  assert(!('draft' in result));
});

Deno.test('validateDraft: rejects empty executive_summary', () => {
  const result = validateDraft(goodDraft({ executive_summary: '   ' }), validIds);
  assert(!result.ok);
  assert(result.reason.includes('executive_summary'));
});

Deno.test('validateDraft: rejects invalid confidence', () => {
  const result = validateDraft(goodDraft({ confidence: 'sky-high' as unknown as DraftJson['confidence'] }), validIds);
  assert(!result.ok);
  assert(result.reason.includes('confidence'));
});

Deno.test('validateDraft: rejects banned term — directors', () => {
  const result = validateDraft(
    goodDraft({
      executive_summary:
        'The directors of the RTO accepted the audit findings and committed to remediation within 90 days.',
    }),
    validIds,
  );
  assert(!result.ok);
  assert(result.reason.toLowerCase().includes('banned'));
  assert(result.reason.toLowerCase().includes('directors'));
});

Deno.test('validateDraft: rejects banned term — board', () => {
  const result = validateDraft(
    goodDraft({
      overall_finding:
        'The board accepted the High Risk rating and the rectification timetable.',
    }),
    validIds,
  );
  assert(!result.ok);
  assert(result.reason.toLowerCase().includes('banned'));
});

Deno.test('validateDraft: rejects overlong verbatim Standards excerpt (with citation)', () => {
  // 35-word quote inside straight double-quotes, with a clause citation adjacent.
  const longQuote =
    '"' +
    Array.from({ length: 35 }, (_, i) => `word${i}`).join(' ') +
    '"';
  const result = validateDraft(
    goodDraft({
      risk_rationale: `SRTOs 2025 Standard 1.5 says ${longQuote}, which the RTO has not met.`,
    }),
    validIds,
  );
  assert(!result.ok);
  assert(result.reason.includes('Standards excerpt exceeds 30 words'));
  assert(result.reason.includes("Field 'risk_rationale'"));
});

Deno.test('validateDraft: ACCEPTS overlong AI prose-in-quotes (no citation)', () => {
  // 50-word quoted span with NO clause citation nearby — this is AI stylistic
  // emphasis, not a Standards excerpt, and must pass.
  const longProse =
    '"' +
    Array.from({ length: 50 }, (_, i) => `phrase${i}`).join(' ') +
    '"';
  const result = validateDraft(
    goodDraft({
      risk_rationale: `The auditor characterised the gap as ${longProse} — a framing the RTO accepted.`,
    }),
    validIds,
  );
  assert(result.ok, `expected ok, got: ${!result.ok && result.reason}`);
});

Deno.test('validateDraft: accepts a 30-word Standards excerpt at the cap', () => {
  const exactly30 =
    '"' + Array.from({ length: 30 }, (_, i) => `word${i}`).join(' ') + '"';
  const result = validateDraft(
    goodDraft({
      risk_rationale: `Std 1.5 reads ${exactly30}, which the RTO has not met.`,
    }),
    validIds,
  );
  assert(result.ok, `expected ok, got: ${!result.ok && result.reason}`);
});

Deno.test('validateDraft: rejects fabricated finding ID — highest-leverage guardrail', () => {
  const draft = goodDraft();
  draft.action_plan_rollup.priority_groups[0].actions[0].linked_finding_ids = [
    A,
    FABRICATED,
  ];
  const result = validateDraft(draft, validIds);
  assert(!result.ok);
  assert(result.reason.includes('fabricated'));
  assert(result.reason.includes(FABRICATED));
  // Architectural assertion — no draft surfaces on failure.
  assert(!('draft' in result));
});

Deno.test('validateDraft: rejects multiple fabricated finding IDs and lists them', () => {
  const FAB2 = '88888888-8888-8888-8888-888888888888';
  const draft = goodDraft();
  draft.action_plan_rollup.priority_groups[0].actions[0].linked_finding_ids = [
    A,
    FABRICATED,
  ];
  draft.action_plan_rollup.priority_groups[1].actions[0].linked_finding_ids = [FAB2];
  const result = validateDraft(draft, validIds);
  assert(!result.ok);
  assert(result.reason.includes(FABRICATED));
});

Deno.test('validateDraft: rejects missing action_plan_rollup', () => {
  const draft = goodDraft();
  delete (draft as unknown as Record<string, unknown>).action_plan_rollup;
  const result = validateDraft(draft, validIds);
  assert(!result.ok);
  assert(result.reason.includes('action_plan_rollup'));
});

Deno.test('validateDraft: rejects invalid priority_group priority', () => {
  const draft = goodDraft();
  (draft.action_plan_rollup.priority_groups[0] as unknown as Record<string, unknown>).priority = 'urgent';
  const result = validateDraft(draft, validIds);
  assert(!result.ok);
  assert(result.reason.includes('priority'));
});

Deno.test('validateDraft: overlong Standards-excerpt reason exposes parseable word count', () => {
  const longQuote =
    '"' + Array.from({ length: 35 }, (_, i) => `word${i}`).join(' ') + '"';
  const result = validateDraft(
    goodDraft({ risk_rationale: `Std 1.5 says ${longQuote}.` }),
    validIds,
  );
  assert(!result.ok);
  const m = !result.ok && result.reason.match(/verbatim Standards excerpt exceeds 30 words \((\d+) words, (\d+) over\)/);
  assert(m, `reason should expose word count, got: ${!result.ok && result.reason}`);
  assertEquals(Number((m as RegExpMatchArray)[1]), 35);
  assertEquals(Number((m as RegExpMatchArray)[2]), 5);
});

Deno.test('validateDraft: word-count regex does NOT match non-quote failures', () => {
  // Banned-term failure must not accidentally satisfy the quote-retry parser.
  const result = validateDraft(
    goodDraft({ executive_summary: 'The directors accepted the audit findings.' }),
    validIds,
  );
  assert(!result.ok);
  const m = !result.ok && result.reason.match(/verbatim Standards excerpt exceeds 30 words \((\d+) words, (\d+) over\)/);
  assertEquals(m, null, `non-quote reason must not match the quote-retry regex: ${!result.ok && result.reason}`);
});

Deno.test('validateDraft: accepts empty linked_finding_ids array', () => {
  // Action with no linked findings is legitimate (general remediation steps).
  const draft = goodDraft();
  draft.action_plan_rollup.priority_groups[0].actions.push({
    summary: 'Schedule a general internal audit review session.',
    linked_finding_ids: [],
  });
  const result = validateDraft(draft, validIds);
  assert(result.ok, `expected ok, got: ${!result.ok && result.reason}`);
});
