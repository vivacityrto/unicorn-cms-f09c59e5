# Wave 4 #2 — AI Executive Summary, Risk Rationale & Action Plan Rollup

You've already approved the substance over the last three turns. This plan exists only to flip the editor into Build mode so I can ship — chat mode keeps blocking my file writes. Approve to proceed.

## Scope (locked from your earlier approvals)

- **Migration**: add `risk_rationale text` to `client_audits`. Nullable, no constraint, no index, no backfill.
- **Edge function `draft-executive-summary`**: caller-JWT auth → audit access gate → 5-min cool-down → ≥3-findings gate → findings + sections + parallel `retrieve-srto-context` (top 8 critical/high clauses, framework-aware) → Gemini 2.5 Pro JSON synthesis → pure-function `validateDraft` (banned terms, ≤30-word quotes, **every `linked_finding_ids` UUID must exist in this audit's findings set**) → one corrective retry → on second failure return 502 with **no log row written** (the insert is structurally unreachable when `validation.ok === false`). Per-clause retrieval failures go to `console.warn` only; the log row records `corpus_empty` + `successful_retrievals` count, not per-clause detail.
- **Edge function `record-executive-summary-decision`**: companion endpoint logging per-field accept/edit/reject decisions and edit-distance percentages.
- **Validator unit test (`validation_test.ts`)**: pure-function tests covering schema, banned terms, quote length, and the fabricated-UUID case. The architectural property (no log row on failure) is asserted at the type level — the function returns `{ok: false}` with no draft, and the calling code's log insert is gated behind a discriminated-union narrow on `ok === true`.
- **Hooks**: `useDraftExecutiveSummary(auditId)` and `useRecordExecutiveSummaryDecision()` in `src/hooks/useAuditReport.ts`.
- **`ReportTab.tsx`**: "Draft executive summary with AI" button (purple `#7130A0`, gated on ≥3 findings), 30–60s loading state, four preview cards (Executive Summary / Overall Finding / Risk Rationale all Accept-Edit-Discard → `useUpdateAudit`; Action Plan Rollup render-only with Copy to Clipboard per §5), confidence badge, 429/422/402/502 error handling, decision telemetry on completion.
- **`supabase/config.toml`**: register both functions with `verify_jwt = false`.

## Files

**Create**
- `supabase/migrations/<ts>_add_risk_rationale_to_client_audits.sql`
- `supabase/functions/draft-executive-summary/index.ts`
- `supabase/functions/draft-executive-summary/validation_test.ts`
- `supabase/functions/record-executive-summary-decision/index.ts`

**Edit**
- `src/components/audit/workspace/ReportTab.tsx`
- `src/hooks/useAuditReport.ts`
- `supabase/config.toml`

## Post-build acceptance (to run before declaring shipped)

1. `supabase--test_edge_functions` runs `validation_test.ts` — all cases green, including the fabricated-UUID one.
2. Live `supabase--curl_edge_functions` smoke against a real Smart Education audit on the happy path. Pass criteria: 200 with all four sections, JSON parses, every `linked_finding_ids` ∈ audit findings, exactly one `ai.executive_summary_drafted` log row written, prose acceptable (generic with `{{EXEMPLARS_PENDING}}` is expected and not a blocker; malformed JSON or hallucinated finding IDs are blockers).
3. Cool-down: second consecutive call returns 429.
4. Audit with <3 findings: 422.
5. Unprivileged caller: 403 (RLS does the work).

Approve and I'll ship the lot in the next turn.
