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

function findOverlongQuote(text: string): { snippet: string; words: number } | null {
  const re = /["“]([^"”]{30,})["”]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const words = m[1].trim().split(/\s+/).length;
    if (words > 30) return { snippet: m[1].slice(0, 80) + '…', words };
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

  const rollup = r.action_plan_rollup as any;
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

  const overlong = findOverlongQuote(combined);
  if (overlong) {
    const over = overlong.words - 30;
    return {
      ok: false,
      reason: `quote exceeds 30 words (${overlong.words} words, ${over} over): "${overlong.snippet}"`,
    };
  }

  return { ok: true, draft: r as unknown as DraftJson };
}
