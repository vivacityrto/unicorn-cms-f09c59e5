/**
 * Pure-function validator for the AI-drafted executive summary.
 *
 * Extracted from index.ts so the test suite (validation_test.ts) can import
 * it without transitively executing the Deno.serve() registration in index.ts.
 *
 * Architectural property (verified at the type level): when
 * `result.ok === false`, no `draft` field exists on the return value, so
 * any caller that gates `client_audit_log.insert(... details: { draft })`
 * behind `if (result.ok) { ... }` literally cannot persist a half-validated
 * draft. Don't break this invariant in callers.
 */

const BANNED_TERMS = [
  /\bdirectors?\b/i,
  /\bboard members?\b/i,
  /\b(?:the )?board\b(?! of)/i,
  /\blanguage model\b/i,
  /\bAI\b/,
  /\bartificial intelligence\b/i,
  /\bas an AI\b/i,
  /\bdraft for review\b/i,
];

function findBannedTerm(text: string): string | null {
  for (const re of BANNED_TERMS) {
    const m = text.match(re);
    if (m) return m[0];
  }
  return null;
}

/**
 * Raw UUIDs (finding IDs) must never appear in client-facing prose — only
 * in the structured linked_finding_ids array, which this check does not
 * scan. Catches the model citing "(851dfa9d-...)" inline in the narrative
 * instead of describing the finding in words.
 */
const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;

function findUuidInProse(text: string): string | null {
  const m = text.match(UUID_RE);
  return m ? m[0] : null;
}

function collectRollupProse(rollup: unknown): string[] {
  const out: string[] = [];
  if (!rollup || typeof rollup !== 'object') return out;
  const value = rollup as { introduction?: unknown; closing?: unknown; priority_groups?: unknown };
  if (typeof value.introduction === 'string') out.push(value.introduction);
  if (typeof value.closing === 'string') out.push(value.closing);
  for (const group of Array.isArray(value.priority_groups) ? value.priority_groups : []) {
    if (!group || typeof group !== 'object') continue;
    const g = group as { narrative?: unknown; actions?: unknown };
    if (typeof g.narrative === 'string') out.push(g.narrative);
    for (const action of Array.isArray(g.actions) ? g.actions : []) {
      if (action && typeof action === 'object' && typeof (action as { summary?: unknown }).summary === 'string') {
        out.push((action as { summary: string }).summary);
      }
    }
  }
  return out;
}

/**
 * Detect a verbatim Standards excerpt longer than 30 words.
 *
 * Discriminates Standards excerpts (quoted span sitting next to a clause
 * citation) from AI prose-in-quotes (stylistic emphasis without a citation).
 * Only the former is rejected — the 30-word cap is a copyright/compliance
 * guard for verbatim Standards reproduction, not a stylistic constraint.
 */
const CLAUSE_CITATION = /\b(?:Std|Standard|Clause|Section|s\.?)\s*\d+(?:\.\d+)?(?:\([a-z]\))?/i;
const FRAMEWORK_CITATION = /\b(?:SRTOs?\s*2025|National\s*Code\s*2018|ESOS\s*Act)\s+(?:Standard|Clause|Section|s\.?)\s*\d/i;
const ADJACENT_WINDOW = 50;

function findOverlongStandardsExcerpt(
  text: string,
): { snippet: string; words: number; citation: string } | null {
  const re = /["“]([^"”]{30,})["”]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const words = m[1].trim().split(/\s+/).length;
    if (words <= 30) continue;
    const start = m.index;
    const end = m.index + m[0].length;
    const before = text.slice(Math.max(0, start - ADJACENT_WINDOW), start);
    const after = text.slice(end, end + ADJACENT_WINDOW);
    const ctx = before + ' ' + after;
    const citation = ctx.match(FRAMEWORK_CITATION)?.[0] ?? ctx.match(CLAUSE_CITATION)?.[0];
    if (!citation) continue; // AI prose-in-quotes — not a Standards excerpt; skip.
    return { snippet: m[1].slice(0, 120) + '…', words, citation };
  }
  return null;
}

export interface DraftJson {
  executive_summary: string;
  overall_finding: string;
  risk_rationale: string;
  action_plan_rollup: {
    introduction: string;
    priority_groups: Array<{
      priority: 'critical' | 'high' | 'medium';
      narrative: string;
      actions: Array<{ summary: string; linked_finding_ids: string[] }>;
    }>;
    closing: string;
  };
  confidence: 'high' | 'medium' | 'low';
  uncertainty_notes: string | null;
}

export type ValidationResult =
  | { ok: true; draft: DraftJson }
  | { ok: false; reason: string };

export function validateDraft(
  raw: unknown,
  validFindingIds: Set<string>,
): ValidationResult {
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'response not an object' };
  const r = raw as Record<string, unknown>;

  for (const k of ['executive_summary', 'overall_finding', 'risk_rationale']) {
    if (typeof r[k] !== 'string' || (r[k] as string).trim().length === 0) {
      return { ok: false, reason: `${k} missing or empty` };
    }
  }
  if (!['high', 'medium', 'low'].includes(r.confidence as string)) {
    return { ok: false, reason: `confidence invalid: ${r.confidence}` };
  }
  if (r.uncertainty_notes !== null && typeof r.uncertainty_notes !== 'string') {
    return { ok: false, reason: 'uncertainty_notes must be string or null' };
  }

  const rollup = r.action_plan_rollup as DraftJson['action_plan_rollup'];
  if (!rollup || typeof rollup !== 'object') {
    return { ok: false, reason: 'action_plan_rollup missing' };
  }
  if (typeof rollup.introduction !== 'string' || !rollup.introduction.trim()) {
    return { ok: false, reason: 'action_plan_rollup.introduction missing' };
  }
  if (typeof rollup.closing !== 'string' || !rollup.closing.trim()) {
    return { ok: false, reason: 'action_plan_rollup.closing missing' };
  }
  if (!Array.isArray(rollup.priority_groups)) {
    return { ok: false, reason: 'priority_groups must be an array' };
  }

  const fabricated: string[] = [];
  for (const group of rollup.priority_groups) {
    if (!['critical', 'high', 'medium'].includes(group.priority)) {
      return { ok: false, reason: `priority_group has invalid priority: ${group.priority}` };
    }
    if (typeof group.narrative !== 'string' || !group.narrative.trim()) {
      return { ok: false, reason: `priority_group ${group.priority} missing narrative` };
    }
    if (!Array.isArray(group.actions)) {
      return { ok: false, reason: `priority_group ${group.priority} actions must be array` };
    }
    for (const action of group.actions) {
      if (typeof action.summary !== 'string' || !action.summary.trim()) {
        return { ok: false, reason: 'action.summary missing' };
      }
      if (!Array.isArray(action.linked_finding_ids)) {
        return { ok: false, reason: 'action.linked_finding_ids must be array' };
      }
      for (const fid of action.linked_finding_ids) {
        if (typeof fid !== 'string' || !validFindingIds.has(fid)) {
          fabricated.push(String(fid));
        }
      }
    }
  }
  if (fabricated.length > 0) {
    return {
      ok: false,
      reason: `fabricated finding IDs not in this audit: ${fabricated.slice(0, 3).join(', ')}${fabricated.length > 3 ? ` (+${fabricated.length - 3} more)` : ''}`,
    };
  }

  const proseFields: Array<[string, string]> = [
    ['executive_summary', r.executive_summary as string],
    ['overall_finding', r.overall_finding as string],
    ['risk_rationale', r.risk_rationale as string],
    ...collectRollupProse(rollup).map(
      (t, i) => [`action_plan_rollup.prose[${i}]`, t] as [string, string],
    ),
  ];
  for (const [field, text] of proseFields) {
    const uuid = findUuidInProse(text);
    if (uuid) {
      return {
        ok: false,
        reason: `Field '${field}' contains a raw finding ID (${uuid}) in prose — clients must never see internal database identifiers. Describe the finding by its content instead (e.g. "the missing trainer credential evidence"), not its ID. UUIDs belong only in the linked_finding_ids array.`,
      };
    }
  }

  const combined = [
    r.executive_summary,
    r.overall_finding,
    r.risk_rationale,
    JSON.stringify(rollup),
    r.uncertainty_notes ?? '',
  ]
    .filter((v): v is string => typeof v === 'string')
    .join('\n');

  const banned = findBannedTerm(combined);
  if (banned) return { ok: false, reason: `banned term: "${banned}"` };

  // Per-field scan so the error message names which field tripped the rule.
  const fields: Array<[string, string]> = [
    ['executive_summary', r.executive_summary as string],
    ['overall_finding', r.overall_finding as string],
    ['risk_rationale', r.risk_rationale as string],
    ['action_plan_rollup', JSON.stringify(rollup)],
    ['uncertainty_notes', (r.uncertainty_notes as string) ?? ''],
  ];
  for (const [field, text] of fields) {
    if (!text) continue;
    const overlong = findOverlongStandardsExcerpt(text);
    if (overlong) {
      const over = overlong.words - 30;
      return {
        ok: false,
        reason: `Field '${field}': verbatim Standards excerpt exceeds 30 words (${overlong.words} words, ${over} over). Excerpt: "${overlong.snippet}". Clause citation found nearby: "${overlong.citation}". Suggested fix: paraphrase the Standard's intent, or split into two short quotations of ≤30 words each.`,
      };
    }
  }

  return { ok: true, draft: r as unknown as DraftJson };
}
