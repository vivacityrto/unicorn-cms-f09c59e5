/**
 * Ask Viv Client Redaction (shared)
 *
 * Filters DerivedFact[] output from `_shared/ask-viv-fact-builder` down to
 * what a client-portal user is allowed to see, for any client-facing Ask Viv
 * surface. Extracted from `compliance-assistant-client/index.ts` (the
 * original client-mode assistant) so both it and the new
 * `ask-viv-assistant-client` share exactly one deny-list — a redaction rule
 * added here protects every client surface at once, not just whichever one
 * a dev remembered to update.
 *
 * This is a second, application-layer line of defense, not the primary one.
 * The primary boundary is Postgres RLS: every caller of `buildAskVivFacts`
 * on a client surface must pass a user-auth (RLS-scoped) Supabase client,
 * not a service-role one — so a table like `client_timeline_events`, whose
 * client-read RLS policy already restricts rows to `visibility = 'client'`,
 * never returns internal-only rows (e.g. notes-sourced timeline entries,
 * which are inserted with the `visibility` column's default of 'internal')
 * regardless of what this module does. The deny-list below exists for
 * sources that do NOT yet have that kind of RLS-enforced client visibility
 * flag — notes and meeting transcripts chief among them — where the only
 * thing standing between a client and internal-only data is this filter.
 */

import type { DerivedFact } from "./ask-viv-fact-builder/index.ts";

/** Vivacity's own tenant id — used to anonymise staff ownership on client-visible records. */
export const VIVACITY_TENANT_ID = 6372;

/** Sources whose facts must NEVER be exposed to a client-portal user. */
export const DENIED_SOURCES = new Set<string>([
  "notes",
  "meeting_transcripts",
  "meeting_transcript",
  "eos_issues",
  "audit_events",
  "ai_interaction_logs",
  "ask_viv_client_turns",
  "pricing",
  "health_leave",
]);

/** Fact-key fragments that hint at staff PII; if matched, the fact is dropped. */
export const DENIED_KEY_FRAGMENTS = [
  "owner_email",
  "owner_phone",
  "staff_email",
  "staff_phone",
  "consultant_email",
  "consultant_phone",
];

/**
 * Filter a fact-builder result down to client-safe facts. Apply this to
 * every DerivedFact[] before it reaches an LLM prompt, a tool result, or a
 * records_accessed list on a client-facing surface.
 */
export function filterFactsForClient(facts: DerivedFact[]): DerivedFact[] {
  return facts.filter((f) => {
    if (DENIED_SOURCES.has(f.source_table)) return false;
    const keyLower = f.key.toLowerCase();
    if (DENIED_KEY_FRAGMENTS.some((frag) => keyLower.includes(frag))) return false;
    return true;
  });
}

/** Shared builder for task facts — owner substitution so a client never sees which Vivacity staffer owns a task. */
function buildTaskLabel(f: DerivedFact): string | null {
  const v = (f.value ?? {}) as Record<string, unknown>;
  const title = (v.title as string | undefined) ?? (v.label as string | undefined);
  if (!title) return null;
  const ownerTenantId = (v.owner_tenant_id as number | undefined) ?? null;
  const ownerName = (v.owner_name as string | undefined) ?? null;
  if (ownerTenantId === VIVACITY_TENANT_ID || (ownerName && /vivacity/i.test(ownerName))) {
    return `Task: ${title} (Vivacity)`;
  }
  return `Task: ${title}`;
}

/** Whitelist of source_table → friendly-label builder. Anything not here is suppressed from records_accessed. */
const LABEL_BUILDERS: Record<string, (fact: DerivedFact) => string | null> = {
  client_audits: (f) => {
    const v = (f.value ?? {}) as Record<string, unknown>;
    const auditType = (v.audit_type as string | undefined) ?? "audit";
    const monthYear = (v.month_year as string | undefined) ?? "";
    return `Your ${auditType} audit${monthYear ? ` (${monthYear})` : ""}`;
  },
  package_instances: (f) => {
    const v = (f.value ?? {}) as Record<string, unknown>;
    const name = (v.package_name as string | undefined) ?? (v.name as string | undefined);
    return name ? String(name) : null;
  },
  package_stage_instances: (f) => {
    const v = (f.value ?? {}) as Record<string, unknown>;
    const stageName = (v.stage_name as string | undefined) ?? (v.title as string | undefined);
    return stageName ? `Your ${stageName} stage` : null;
  },
  evidence: (f) => {
    const v = (f.value ?? {}) as Record<string, unknown>;
    const label = (v.filename as string | undefined) ?? (v.label as string | undefined) ?? (v.title as string | undefined);
    return label ? `Evidence: ${label}` : null;
  },
  tasks: (f) => buildTaskLabel(f),
  tasks_tenants: (f) => buildTaskLabel(f),
  eos_rocks: (f) => {
    const v = (f.value ?? {}) as Record<string, unknown>;
    const title = (v.title as string | undefined) ?? (v.label as string | undefined);
    return title ? `Your Rock: ${title}` : null;
  },
  eos_meetings: (f) => {
    const v = (f.value ?? {}) as Record<string, unknown>;
    const date = (v.date as string | undefined) ?? (v.meeting_date as string | undefined);
    return date ? `Meeting on ${date}` : null;
  },
  client_timeline_events: (f) => {
    const entries = Array.isArray(f.value) ? f.value : [];
    return entries.length > 0 ? `Recent activity (${entries.length} update${entries.length === 1 ? "" : "s"})` : null;
  },
};

/** Build friendly {label}[] for a "what I looked at" list from already-filtered facts. Suppresses anything not whitelisted. */
export function buildFriendlyRecords(facts: DerivedFact[]): { label: string }[] {
  const seen = new Set<string>();
  const out: { label: string }[] = [];
  for (const fact of facts) {
    const builder = LABEL_BUILDERS[fact.source_table];
    if (!builder) continue;
    const label = builder(fact);
    if (!label) continue;
    if (seen.has(label)) continue;
    seen.add(label);
    out.push({ label });
  }
  return out.slice(0, 12);
}
