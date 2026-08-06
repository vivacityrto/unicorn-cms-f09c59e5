# Audit: 2026-04-30 — Angela's AI Executive Summary Drafter & Multi-Framework Corpus

**Trigger:** ad-hoc — Angela shipped a further 26 commits to `main` in `unicorn-cms-f09c59e5` while the previous audit entry (PR #17) was still open. Carl requested analysis before pulling.

**Author:** Carl (analysis only — Angela ran the Lovable session; this entry documents the outcome from Carl's review).

**Predecessor:** [2026-04-30 — Angela's AI RAG corpus, Finding Drafter & Evidence Analyser](2026-04-30-angela-ai-rag-finding-drafter-evidence-analyser.md) — covers the first 26-commit batch. This entry covers the second 26-commit batch only.

**Scope:** Commits `e6dbb214` through `9cdc2a85` (origin/HEAD at time of audit). Two new migrations, two new edge functions, one extracted validator module with a test file, significant `ReportTab.tsx` additions, one new hook file, and iterative patches to four previously-shipped edge functions. Read-only diff via `git show origin/HEAD:<path>`.

---

## What Angela built

### 1 — Multi-Framework Corpus Support (National Code 2018 / ESOS Act 2000)

**Purpose:** The original `srto_corpus` table and embedding pipeline were SRTO 2025–only. Angela extended the corpus to support National Code 2018 (CRICOS) and ESOS Act 2000 content, enabling the AI drafting pipeline to serve CRICOS audits and combined CRICOS/RTO audits with framework-appropriate regulatory context.

**What was built:**

- Migration `20260430001228`: extends `srto_source_type` enum with `national_code`, `cricos_practice_guide`, `esos_act`; adds a `framework` column to `srto_corpus` (`NOT NULL`, default `SRTO_2025`, `CHECK` constraint to `SRTO_2025 | NATIONAL_CODE_2018 | ESOS_ACT_2000`); drops and recreates `match_srto_chunks()` with an optional `filter_framework` parameter; adds a `framework` index. Includes a smoke test confirming the new signature accepts a framework filter.

- `embed-srto-corpus/index.ts` — updated to handle the three new source types; adds a full National Code 2018 quality-area clause prefix map (Standards 1–11); detects framework from storage path prefix via a `PATH_PREFIX_MAP` lookup rather than separate conditional logic; passes `framework` into every `ChunkRow`.

- `retrieve-srto-context/index.ts` — updated to accept and validate an optional `framework` parameter; passes it through to `match_srto_chunks` via the RPC `filter_framework` argument; returns it in the response for caller transparency.

- `draft-finding/index.ts` — the most consequential change in this batch: added a step that resolves the audit's compliance framework from `compliance_templates.framework` and routes corpus retrieval accordingly:
  - `SRTO_2025_CHC`, `SRTO_2025_MOCK`, `DUE_DILIGENCE` → filter to `SRTO_2025`
  - `CRICOS` → filter to `NATIONAL_CODE_2018`
  - `DUE_DILIGENCE_COMBINED`, `RTO_CRICOS_CHC` → `null` (no filter; cosine similarity surfaces the right chunks across both frameworks)
  - Unknown template → `null` (safe fallback)

- `analyse-evidence/index.ts` — minor patch (likely framework wiring for the evidence pipeline, 4 lines added, 1 removed).

**Note:** The schema and embedding logic are ready for National Code 2018 content, but the corpus cannot be populated until the National Code 2018 PDFs, CRICOS Practice Guides, and ESOS Act 2000 documents are uploaded to `srto-source-documents` and `embed-srto-corpus` is run against them. Same population gap as noted for the SRTO 2025 corpus in the predecessor audit entry.

### 2 — AI Executive Summary Drafter (Wave 4 #2 Capstone)

**Purpose:** Allow auditors to generate a complete, four-part executive narrative for a near-complete audit in a single click. This is the capstone of the AI drafting stack — it synthesises every finding, the section rollup, and retrieved corpus context into a coherent document that a senior auditor would recognise as one professional's considered view of the whole audit.

**What was built:**

- `draft-executive-summary/index.ts` — the generation pipeline: caller-JWT auth → audit-access gate (RLS-enforced via `client_audits` select) → cool-down check (5 minutes per audit, not a daily cap) → minimum findings gate (`MIN_FINDINGS_FOR_SYNTHESIS = 3`) → loads every finding, section rollup, and audit metadata → per-clause corpus retrieval for the most-cited critical/high clauses (up to 8 clauses × 6 chunks each) → Gemini 2.5 Pro draft via Lovable AI Gateway → `validateDraft()` → service-role log to `client_audit_log` (action: `ai.executive_summary_drafted`) → return draft + provenance.

  The cool-down design is deliberate: this is a once-per-audit synthesis operation, not a per-question tool. A daily cap would be inappropriate; a per-audit cool-down prevents accidental double-fires while the auditor is working.

- `draft-executive-summary/_validation.ts` — pure-function validator extracted to its own module. Returns a discriminated union: `{ ok: true; draft: DraftJson } | { ok: false; reason: string }`. The architectural property is explicitly documented: the `client_audit_log.insert` is structurally unreachable unless `result.ok === true` — a half-validated draft cannot reach the DB at the type level. Applies the same banned-term and overlong-quote guards as `draft-finding`.

  The validator also checks `linked_finding_ids` in the `action_plan_rollup` — every ID the model references must be present in the actual findings list for this audit. This is the fabrication guard for the action plan: the model cannot invent finding references.

- `draft-executive-summary/validation_test.ts` — test suite for the validator. This is the first edge function in the project with a companion test file.

- `record-executive-summary-decision/index.ts` — companion decision logger. Accepts per-field decisions (`executive_summary`, `overall_finding`, `risk_rationale`) each with their own `decision` (`accepted | edited | rejected`) and `edit_distance_pct`. Note: `action_plan_rollup` is intentionally excluded from the decision payload — it is render-only and never persisted.

- Migration `20260430014743` — adds `risk_rationale text` column to `client_audits`. Comment in the migration confirms this is the AI-drafted field accepted by the auditor; it is distinct from the computed `risk_rating`.

- `ReportTab.tsx` — significantly extended. New AI draft button triggers `useDraftExecutiveSummary`; each of the three persisted fields (`executive_summary`, `overall_finding`, `risk_rationale`) has its own editable text area with Accept/Reject controls. The `action_plan_rollup` is rendered read-only with a clipboard copy button. Edit-distance is computed client-side via a Levenshtein implementation in the component (bounded matrix to keep memory sane on long summaries, with a length-delta fallback for very long strings).

- `useAuditReport.ts` — new hook file wiring `useDraftExecutiveSummary`, `useRecordExecutiveSummaryDecision`, `useReleaseReport`, and `useRevokeReport` to the Supabase edge functions.

**Draft output schema (four parts):**
- `executive_summary` — 3–5 paragraphs: audit context, consequential findings, secondary themes, remediation forward-look, closing positioning.
- `overall_finding` — 1–2 sentences, the audit's bottom line. Explicit instruction to name risk level directly.
- `risk_rationale` — 1–2 paragraphs explaining the auto-derived `risk_rating` by clause reference. The model does not set the rating — it explains it.
- `action_plan_rollup` — introduction + priority_groups (critical → high → medium, each with linked finding IDs) + closing. Clipboard-only; never persisted.
- `confidence` + `uncertainty_notes` — advisory metadata for the auditor's awareness.

**Governance and voice compliance in the system prompt:** Same rules as `draft-finding` — Australian English, "Governing Persons", banned-term guard, ≤30-word verbatim quotes, no invented facts, no AI self-identification.

**EXEMPLARS_PENDING placeholder:** The system prompt contains `{{EXEMPLARS_PENDING}}` where Sam is expected to supply 2–3 redacted historical executive summaries (one CRICOS/Combined, one CHC/Mock, one Due Diligence). The function will operate without them but output quality — particularly narrative structure and tone — will be lower until the few-shot block is populated.

### 3 — Iterative patches to previously-shipped functions

All four functions from the first batch received minor follow-up changes in this session:

- `embed-srto-corpus` — five commits of iterative refinement (framework detection, path prefix map, National Code quality-area mapping). Net result is the updated version described under Wave 1 above.
- `retrieve-srto-context` — framework parameter plumbing (four commits, additive only).
- `draft-finding` — framework routing logic added (two commits, 31 lines net). No changes to cap, validation, or logging.
- `analyse-evidence` — minor fix (one commit, 4 lines added).

The `.lovable/plan.md` file was significantly reduced (from ~158 to ~35 lines) as items were marked complete — this reflects the Lovable session plan being consumed as work shipped.

---

## Findings

- **The multi-framework extension is clean and backwards-compatible.** The `framework` column defaults to `SRTO_2025` and the new enum values are additive. Existing corpus rows are untouched. The `match_srto_chunks` RPC is a drop-and-recreate (not an alter), but it is behind a smoke test in the migration and the new signature is a strict superset of the old one.

- **The executive summary drafter has a stronger validation gate than the finding drafter.** The discriminated-union approach in `_validation.ts` makes it structurally impossible to log a half-validated draft — this is a meaningful improvement over a plain boolean check. The fabricated-finding-ID check in the validator is also new and important: it prevents the model from referencing findings that don't exist in the audit.

- **`validation_test.ts` is the first edge function test file in the project.** This is worth noting positively — it sets a precedent. Whether the test is wired into any CI pipeline is not determinable from this diff.

- **`action_plan_rollup` is render-only by design.** The decision not to persist it is explicit in both the edge function comment and the `record-executive-summary-decision` interface. Auditors who want to preserve it must copy it before navigating away. Whether this is communicated clearly in the UI warrants a UX check.

- **`EXEMPLARS_PENDING` is a live gap.** Until Sam supplies the few-shot examples, the executive summary prompt is operating without in-context exemplars. The model will produce structurally valid output (the schema and validation gate ensure this) but the Vivacity voice and narrative structure will be less consistent than it will be with exemplars in place.

- **National Code corpus population is a prerequisite for CRICOS audit quality.** The routing logic in `draft-finding` now correctly sends CRICOS audits to `NATIONAL_CODE_2018` chunks — but those chunks don't exist until the relevant PDFs are uploaded and embedded. Until then, CRICOS drafts will operate with `corpus_empty = true` and thin context.

- **No KB changes were made in this session.** The executive summary drafter pattern, the multi-framework corpus design, and the validation module approach are not yet documented in `unicorn-kb/`.

---

## Amendments to predecessor audit entry

The following open questions from [2026-04-30 — Angela's AI RAG corpus, Finding Drafter & Evidence Analyser](2026-04-30-angela-ai-rag-finding-drafter-evidence-analyser.md) are partially answered by this batch:

- **Q1 (corpus population):** Still unresolved for both SRTO 2025 and National Code. The infrastructure now covers both frameworks.
- **Q2 (Gemini vs Claude):** No change — still Gemini 2.5 Pro via the Lovable AI Gateway.
- **Q3 (daily caps):** The executive summary drafter uses a cool-down model (5 min/audit) rather than a daily cap. Finding drafter (40/day) and evidence analyser (30/day) are unchanged.
- **Q4 (AI Insights gate):** No change — Super Admin only.
- **Q5 (KB documentation):** Still outstanding; now larger in scope.
- **Q6 (`v_ai_finding_draft_outcomes` tenant isolation):** Not addressed in this batch.

---

## KB changes shipped

- No changes — this was a Lovable codebase session only.

---

## Codebase observations (read-only)

- `unicorn-cms-f09c59e5` @ `9cdc2a85` (origin/HEAD at time of audit) — 53 commits ahead of local `e8cbfac4` total; this entry covers commits `e6dbb214` through `9cdc2a85` (26 commits).
- Both new migrations are timestamped 30 April 2026 and are strictly additive (no DROP of data, no breaking changes to existing tables, the `match_srto_chunks` drop-recreate is covered by the smoke test).
- `supabase/config.toml` was modified once (`2545e13c`) to register the two new edge functions.

---

## Decisions

- No new ADRs drafted this session.
- The extracted validator module + test file pattern (`_validation.ts` + `validation_test.ts`) is worth formalising as a KB convention for edge functions with non-trivial output contracts. Recommend an ADR or KB entry.

---

## Open questions parked

1. **`EXEMPLARS_PENDING` — when does Sam supply the exemplars?** Without them, the executive summary voice is not yet calibrated to Vivacity's style. This is the highest-priority quality gap in the current build.
2. **National Code corpus population.** Requires uploading National Code 2018, CRICOS Practice Guide, and ESOS Act 2000 PDFs to `srto-source-documents` and running `embed-srto-corpus`. Who owns this, and when?
3. **`action_plan_rollup` is clipboard-only — is this communicated in the UI?** Auditors may not realise the rollup is ephemeral. Worth a UX review of the ReportTab copy affordance.
4. **Is `validation_test.ts` wired into CI?** The test file exists but no CI pipeline configuration is visible in this diff. If it is not run automatically, it may drift from the implementation.
5. **Minimum findings gate (`MIN_FINDINGS_FOR_SYNTHESIS = 3`).** Due diligence audits may legitimately have fewer than 3 findings. The gate is a reasonable default but should be validated against real audit data.
6. **`risk_rationale` column — is it surfaced in the published report?** The column is on `client_audits` and drafted via the AI flow, but whether it appears in the downloadable report template is not determinable from this diff.
7. Carry-forwards from predecessor entry: corpus seeding (SRTO 2025), Gemini vs Claude, AI Insights gate, KB documentation, `v_ai_finding_draft_outcomes` tenant isolation.

---

## Tag

`audit-2026-04-30-angela-ai-executive-summary-multi-framework-corpus`
