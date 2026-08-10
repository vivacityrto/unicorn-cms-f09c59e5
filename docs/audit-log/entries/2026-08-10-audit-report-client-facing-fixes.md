# Audit: 2026-08-10 — Audit report client-facing content fixes

**Trigger:** Carl reported three issues in the audit report PDF Tanya
generated for a real audit (ABSOLUTE MEDICAL RESPONSE PTY LTD): (1) a
"Risk Rating Rationale" section citing a raw finding UUID inline, with no
easy way for Tanya to edit it before sending to the client; (2) the
"Section Rollup" table showing "Not scored" / "—" for every section despite
real Findings counts; (3) Opening Meeting responses badged "NOT ANSWERED"
despite visibly containing the client's actual answer text, plus internal
`[Context]`/`[Changes]`/etc. labels leaking into the client-facing report.
**Author:** Claude (session run by Carl)
**Scope:** Three edge functions (`generate-client-audit-report`,
`generate-client-audit-report-docx`, `draft-executive-summary` +
`_validation.ts`) and one frontend component (`ReportTab.tsx`). No schema
changes, no RLS changes.

---

## Findings

- **Infrastructure gap found first:** `generate-client-audit-report` — the
  PDF generator actually used by the report Tanya downloaded — had **no
  file anywhere in this git checkout**. It exists only as a live-deployed
  Supabase edge function (version 19 at session start), pulled via
  `mcp__supabase__get_edge_function`. Checked into the repo for the first
  time as part of this fix (see `supabase/functions/generate-client-audit-report/`).
- **Issue 3a (NOT ANSWERED) — confirmed bug, not missing data.** Live query
  of the 4 Opening Meeting responses for the reported audit: all four had
  `rating = 'not_applicable'` and substantial `notes` text (the client's
  real answers). The PDF's `ratingLabel()`/`ratingColour()` switch checked
  for the key `'na'`, but the actual stored/canonical value is
  `'not_applicable'` (confirmed against `RATING_OPTIONS_FULL` in
  `src/types/auditWorkspace.ts` and the DOCX generator's own correct
  `RATING_LABEL` map, which already had it right). The wrong key meant
  every `not_applicable`-rated response in the *entire* report — not just
  Opening Meeting — silently fell through to the `'NOT ANSWERED'` default.
  `'not_sighted'` was missing entirely too, added alongside.
- **Issue 3b (bracket labels) — scoping gap, not a data bug.**
  `compliance_template_questions.clause` holds `"Context"`, `"Changes"`,
  `"Third parties"`, `"Vulnerable cohorts"` for the Opening Meeting section
  specifically — a repurposed internal categorisation hint, not a real
  Standards clause (contrast with `auditor_assessment` sections, where
  `clause` holds actual clause codes). The internal staff workspace
  (`QuestionCard.tsx`) already gates this correctly (shown for
  non-`auditor_assessment` contexts); neither report generator had the
  equivalent gate. Fixed by keying off `client_audit_sections.audit_phase
  = 'opening_meeting'` — reliable and simple, confirmed live against the
  reported audit's 19 sections. Scoped to Opening Meeting only, per Carl —
  Closing Meeting's own `client_discussion`-style questions were left
  untouched.
- **Issue 2 (Section Rollup) — not a bug, an unfinished feature.**
  `client_audit_sections.score_total`/`score_max` are **never written by
  any code path in the entire app** — confirmed via full-repo grep and live
  query (all 19 of the reported audit's sections null on both columns).
  The only scoring that exists (`useAuditScore` in `useAuditWorkspace.ts`)
  computes one audit-wide total (`45 of 136` for this audit) and writes it
  only to `client_audits`, never per-section. `risk_level` *can* be set,
  but only via a manual 4-button control buried in each collapsed section
  card (`DocumentReviewPhase.tsx`) — Tanya never used it for any section.
  Per Carl's explicit direction: dropped the Score column entirely (real
  per-section scoring is a separate, larger feature not built this
  session) and derive Risk automatically from the highest-`priority`
  finding raised against each section — `client_audit_findings.priority`
  and `.section_id` already existed and required no new write path.
  Verified live: the reported audit's findings are 1 critical / 52 high /
  16 medium — plausible per-section badges without any manual step.
- **Issue 1 (Risk Rationale editable, plainer tone) — two separate gaps.**
  `client_audits.risk_rationale` is a plain editable `text` column, but the
  *only* UI path to change it was via `ReportTab.tsx`'s "Draft executive
  summary with AI" button — which discards the currently-saved text and
  generates an entirely new draft to edit, rather than letting the auditor
  open the existing saved value directly. Same gap existed for
  `executive_summary` and `overall_finding` (both rendered read-only in the
  "Report Preview" card with zero edit affordance outside a full AI
  regenerate) — Carl asked to fix all three, not just the reported one.
  Separately, the jargon/UUID-citing content itself traces to
  `draft-executive-summary`'s system prompt: `SYSTEM_PROMPT`'s "VOICE"
  section was written for an internal-auditor reader ("technical",
  "reference clauses by full identifier") with no client-facing mode, and
  the "WHAT YOU MUST NOT DO" list constrained UUID usage only for the
  structured `linked_finding_ids` field, never the prose narrative — so
  nothing stopped the model citing a finding's raw ID inline in
  `risk_rationale`.

---

## Code changes

- **`supabase/functions/generate-client-audit-report/index.ts`** (new
  file, checked into git for the first time) — `ratingLabel`/`ratingColour`
  fixed (`not_applicable`→N/A, `not_sighted` added); Section Rollup Score
  column removed, Risk derived from `sectionRiskFromFindings()`; Detailed
  Responses suppresses `[clause]` when `section.audit_phase ===
  'opening_meeting'`.
- **`supabase/functions/generate-client-audit-report-docx/index.ts`** —
  same Section Rollup and clause-label fixes (its rating map was already
  correct, so no NOT ANSWERED fix needed there); added `audit_phase` to
  its `client_audit_sections` select (previously not fetched).
- **`supabase/functions/draft-executive-summary/index.ts`** — VOICE section
  rewritten for a client-facing, plain-language reader; explicit
  prohibition added on citing a finding's UUID in prose; reinforcing note
  added to the user-prompt's `FINDING_ID` framing.
- **`supabase/functions/draft-executive-summary/_validation.ts`** — added
  `findUuidInProse()`/`collectRollupProse()` as a defense-in-depth
  validation gate: any UUID found in `executive_summary`,
  `overall_finding`, `risk_rationale`, or any `action_plan_rollup`
  narrative/summary text now fails validation and triggers the existing
  one-shot corrective retry, with a reason string explaining the actual
  rule violated.
- **`src/components/audit/workspace/ReportTab.tsx`** — new
  `EditableReportField` component: inline "Edit" toggle → Textarea →
  Save/Cancel, writing straight to `client_audits` via the existing
  `useUpdateAudit` hook. Applied to Executive Summary, Overall Finding, and
  Risk Rating Rationale in the Report Preview card — all three are now
  directly editable without touching the AI-draft flow. (`risk_rating`
  itself deliberately left alone — `useUpdateAudit` already strips it from
  client writes since it's server-derived from finding priorities; that
  guardrail is correct and untouched.)

---

## Verification

- **Root causes confirmed against live data before any fix**, not assumed:
  queried the reported audit's actual `client_audit_sections`,
  `client_audit_responses`, `client_audit_findings`, and `client_audits`
  rows directly.
- **Fixes verified live via rolled-back dry-run transactions** (no data
  changed): confirmed `sectionRiskFromFindings`-equivalent logic and the
  clause-label/rating-label mappings against real rows for this audit.
- **Both edited edge functions diffed against their live-deployed source**
  before redeploying (`mcp__supabase__get_edge_function` pull, normalised
  for CRLF, diffed against the local working copy) to rule out unrelated
  drift between the git checkout and what was actually running in prod —
  confirmed clean for both `generate-client-audit-report-docx` and
  `draft-executive-summary`.
- **Frontend**: `npx tsc --noEmit` clean after the `ReportTab.tsx` changes.
- Deployed all three edge functions to prod via `mcp__supabase__deploy_edge_function`,
  with Carl's explicit approval (the harness's auto-mode classifier
  blocked the first attempt and required a fresh confirmation, consistent
  with this repo's risk-action policy).
- **Not independently re-verified**: the actual rendered PDF/DOCX output
  for a real audit post-deploy (no tool available in this session to
  invoke an edge function as an authenticated user and inspect binary
  output). Recommend Carl or Tanya regenerate the report for a real audit
  and eyeball it before it's next sent to a client.

---

## Decisions

- **Section Rollup: hide Score, derive Risk — no new scoring feature.**
  Carl explicitly chose this over building real per-section scoring (which
  would require new design decisions — what counts, weighting — and more
  testing) after confirming findings already carry a usable `priority`
  field.
- **Risk Rationale/Executive Summary/Overall Finding: add direct edit,
  also fix the prompt.** Carl chose to do both rather than either alone —
  a prompt fix alone wouldn't let Tanya fix the *already-saved* bad text
  without a full regenerate; a UI fix alone would leave future drafts
  jargon-heavy.
- **Bracket-label suppression scoped to Opening Meeting only,** per Carl's
  explicit wording — Closing Meeting's similar `client_discussion`-style
  questions were left as-is.
- **UUID-in-prose check added to the validator, not just the prompt** — a
  prompt instruction alone is not enforcement; the existing one-shot
  corrective-retry mechanism already existed and this is exactly what it's
  for.

---

## Open questions parked

- No real per-section scoring exists anywhere in the app. If that's wanted
  later, it's a new feature (weighting model, what counts, aggregation
  rule) — flagged, not designed, this session.
- The manual per-section `risk_level` control in `DocumentReviewPhase.tsx`
  is now redundant with the Section Rollup's auto-derived Risk (which
  reads from findings, not `risk_level`). Not removed this session — worth
  a follow-up decision on whether to keep, repurpose, or delete it.
- PDF/DOCX visual output not re-verified post-deploy (see Verification).
