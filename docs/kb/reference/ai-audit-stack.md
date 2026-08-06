# AI Audit Stack — Reference

> **Last updated:** 2026-04-30 · **Reconsider by:** 2026-07-30 · **Confidence:** high — derived from direct diff analysis of `unicorn-cms-f09c59e5@9cdc2a85`.
>
> **Reflects commit:** `<codebase>@9cdc2a85` (2026-04-30)
>
> Comprehensive reference for the AI drafting stack introduced across two Lovable sessions on 29–30 April 2026. Covers the RAG corpus, finding drafter, evidence analyser, executive summary drafter, and the AI Insights dashboard. For the audit trail of when and why this was shipped, see `unicorn-audit/audit/2026-04-30-angela-ai-rag-finding-drafter-evidence-analyser.md` and `unicorn-audit/audit/2026-04-30-angela-ai-executive-summary-multi-framework-corpus.md`.

---

## Overview

The AI audit stack gives auditors three assistance tools within the audit workspace, backed by a shared RAG corpus of regulatory documents:

| Tool | Trigger | What it produces | Persists? |
|---|---|---|---|
| AI Finding Drafter | Button in `AddFindingForm` (per question) | Draft finding (summary, priority, corrective action) | No — auditor accepts via existing finding-save flow |
| AI Evidence Analyser | Button in `EvidencePanel` (per question) | Suggested rating + notes + excerpts + gaps | Yes — to `client_audit_responses.ai_*` columns; auditor accepts/overrides/discards |
| AI Executive Summary Drafter | Button in `ReportTab` (per audit) | Four-part executive narrative | Partially — `executive_summary`, `overall_finding`, `risk_rationale` to `client_audits`; `action_plan_rollup` is clipboard-only |

All three are **advisory** — no rating or text is written without explicit auditor action. All three are logged to `client_audit_log` for the AI Insights dashboard.

---

## 1. SRTO Corpus (RAG Layer)

### Database

**Table:** `public.srto_corpus`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK |
| `source_document` | `text` | Filename of the source PDF |
| `source_type` | `srto_source_type` enum | See values below |
| `framework` | `text` | `SRTO_2025` / `NATIONAL_CODE_2018` / `ESOS_ACT_2000`; `CHECK` constraint; NOT NULL, default `SRTO_2025` |
| `source_version` | `text` | nullable |
| `clause` | `text` | nullable — standard clause reference (e.g. `1.1`, `7.2`) |
| `quality_area` | `text` | nullable — derived from clause prefix |
| `heading` | `text` | nullable |
| `content` | `text` | The chunk text |
| `token_count` | `integer` | |
| `chunk_index` / `chunk_total` | `integer` | Position within the source document |
| `content_hash` | `text` | SHA-based dedup; unique index with `(source_document, chunk_index, content_hash)` |
| `embedding` | `vector(1536)` | `text-embedding-3-small` via Lovable AI Gateway |
| `metadata` | `jsonb` | Extensible; default `{}` |

**pgvector indexes:** HNSW (cosine, `m=16`, `ef_construction=64`) + clause, quality_area, source_type, framework btree indexes.

**RLS:** Authenticated users with a `users` row can SELECT. Writes are via service role only (through `embed-srto-corpus`).

**`srto_source_type` enum values:**

| Value | Framework | Maps to |
|---|---|---|
| `outcome_standards` | `SRTO_2025` | Outcome Standards (F2025L00354) |
| `compliance_requirements` | `SRTO_2025` | Compliance Requirements (F2025L00355) |
| `credential_policy` | `SRTO_2025` | Credential Policy |
| `practice_guide` | `SRTO_2025` | SRTO Practice Guides |
| `national_code` | `NATIONAL_CODE_2018` | National Code 2018 (CRICOS) |
| `cricos_practice_guide` | `NATIONAL_CODE_2018` | CRICOS Practice Guides |
| `esos_act` | `ESOS_ACT_2000` | ESOS Act 2000 |

**Quality area mappings:**
- SRTO 2025: clause prefix `1` → Training & Assessment; `2` → VET Student Support; `3` → VET Workforce; `4` → Governance.
- National Code 2018: clause prefix `1`–`11` mapped to National Code Standard names.

**`match_srto_chunks()` RPC:** Cosine-similarity search. Accepts `query_embedding vector(1536)`, `match_threshold float` (default 0.7), `match_count int` (default 8), optional `filter_source_type`, `filter_clause`, `filter_framework`. Security invoker — RLS applies to caller.

### Storage

**Bucket:** `srto-source-documents` (private). Super Admin read/write. Path convention: `<source_type>/<filename>.pdf` — the folder prefix is used by `embed-srto-corpus` to auto-detect source type and framework.

### Edge functions

**`embed-srto-corpus`** — Admin-only ingestion pipeline.
- Auth: caller must be Super Admin.
- Pipeline: reads PDFs from `srto-source-documents` → extracts text via `unpdf` → chunks into ~800-token segments (150-token overlap, `gpt-tokenizer`) → embeds in batches of 100 via `text-embedding-3-small` (Lovable AI Gateway) → upserts into `srto_corpus` (unique on `source_document + chunk_index + content_hash`).
- Optional body params: `source_document` (single file), `source_type`, `force_reembed` (re-embeds even if hash unchanged).
- Returns: `{ documents_processed, chunks_inserted, chunks_skipped, chunks_deleted, duration_ms, errors[] }`.
- **Status:** Corpus population is a prerequisite for AI quality. Confirm with Angela that the function has been run against the SRTO 2025 PDFs. National Code 2018 / ESOS Act 2000 PDFs need to be uploaded and embedded separately.

**`retrieve-srto-context`** — Caller-JWT semantic search.
- Embeds the incoming query via `text-embedding-3-small`, calls `match_srto_chunks()`.
- Optional params: `top_k` (1–20, default 8), `threshold` (0–1, default 0.7), `source_type`, `clause`, `framework`.
- Returns matched chunks with similarity scores and timing.
- Used internally by `draft-finding`, `analyse-evidence`, and `draft-executive-summary` (they call the Supabase RPC directly; this function is the public-facing retrieval endpoint).

---

## 2. AI Finding Drafter

**Trigger:** "Generate AI Draft" button in `AddFindingForm.tsx` — available for `at_risk` and `non_compliant` responses only.

### Edge function: `draft-finding`

Pipeline:
1. Caller-JWT auth → audit-access gate (RLS via `client_audits` select).
2. Daily cap check: 40 drafts/user/day (hardcoded; `client_audit_log` count).
3. Load response + question + section + audit rows.
4. Resolve compliance framework from `compliance_templates.framework`:
   - `SRTO_2025_CHC` / `SRTO_2025_MOCK` / `DUE_DILIGENCE` → filter corpus to `SRTO_2025`
   - `CRICOS` → filter to `NATIONAL_CODE_2018`
   - `DUE_DILIGENCE_COMBINED` / `RTO_CRICOS_CHC` → no filter (cross-framework cosine similarity)
   - Unknown → no filter (safe fallback)
5. Semantic retrieval: up to 6 chunks, threshold 0.65, clause-filtered where available.
6. Gemini 2.5 Pro via Lovable AI Gateway → draft JSON.
7. Validation: banned-term guard (no "board", "directors", "AI", etc.), overlong-quote guard (≤30 words verbatim), structure check. Retry once on failure.
8. Service-role log insert to `client_audit_log` (`action: 'ai.finding_drafted'`), including provenance: model, prompt/completion tokens, duration, corpus chunks used, `corpus_empty` flag, confidence.
9. Return draft JSON + provenance to caller.

**Draft JSON schema:**
```json
{
  "summary": "string",
  "priority": "critical | high | medium | low",
  "corrective_action": "string",
  "clause_references": ["string"],
  "confidence": "high | medium | low",
  "uncertainty_notes": "string | null"
}
```

**Daily cap:** 40 drafts/user/day. Hardcoded in the function; requires a code change to adjust.

### Edge function: `record-finding-decision`

Companion. Called by `AddFindingForm` after the auditor saves or discards the draft. Logs `accepted`, `edited`, or `rejected` to `client_audit_log` (`action: 'ai.finding_decision'`) along with `final_summary`, `final_priority`, and `edit_distance_pct`. Best-effort from the UI perspective — the finding has already been saved (or not) before this fires.

### UI

`AddFindingForm.tsx` — AI draft button triggers `draft-finding`. Draft displayed inline; auditor edits directly in the form fields, then saves via the existing finding-save flow. Decision is recorded via `record-finding-decision` on save or discard.

---

## 3. AI Evidence Analyser

**Trigger:** "Analyse Evidence" button in `EvidencePanel.tsx` — available in `QuestionCard` for auditor-assessment context.

### New tables

**`client_audit_response_documents`** — join table linking documents as evidence to a specific question response.

| Column | Notes |
|---|---|
| `response_id` | FK → `client_audit_responses.id` ON DELETE CASCADE |
| `document_id` | `bigint` — FK to documents table |
| `linked_by` | User UUID |
| `note` | Optional text annotation |

Full RLS (select/insert/update/delete). Insert/update policies include cross-tenant FK check: `document.tenant_id` must match `audit.subject_tenant_id`.

**`ai_evidence_analysis_usage`** — daily cap tracking. User-owns-own-row policy (`user_id = auth.uid()`). Tracks `usage_date`, `response_id`, `audit_id`, `document_count`, `model`, `status`.

**New columns on `client_audit_responses`:**

| Column | Type | Purpose |
|---|---|---|
| `ai_suggested_rating` | `text` | AI-suggested compliance rating |
| `ai_suggested_notes` | `text` | AI-generated notes |
| `ai_confidence` | `numeric` | Confidence score |
| `ai_analyzed_at` | `timestamptz` | When the analysis ran |
| `ai_analysis_id` | `uuid` | Links to the log entry |
| `ai_excerpts` | `jsonb` | `[{ quote, source, verified_against? }]` |
| `ai_gaps` | `jsonb` | `["gap description"]` |
| `ai_model` | `text` | Model used |

### Edge function: `analyse-evidence`

Pipeline:
1. Caller-JWT auth → audit-access gate.
2. Daily cap check: 30 analyses/user/day (`ai_evidence_analysis_usage` table).
3. Load response + question + linked documents.
4. Cross-tenant leakage check (defence-in-depth beyond RLS): verifies each document's `tenant_id` matches `audit.subject_tenant_id`.
5. Fetch files from storage (`documents` bucket); extract text:
   - PDF: `unpdf`
   - DOCX: `mammoth`
   - XLSX/XLS: `xlsx`
   - TXT/CSV/MD: UTF-8 decode
   - Unknown: UTF-8 best-effort
   - Per-file limits: 25 MB, 200k chars.
6. Semantic retrieval over `srto_corpus`.
7. Gemini 2.5 Pro analysis via Lovable AI Gateway.
8. Hallucination guard: verifies any quoted excerpt (≥12 chars) is found verbatim (normalised) in the source document text. Strips unverified quotes.
9. Persist suggestion to `client_audit_responses.ai_*` columns.
10. Record usage in `ai_evidence_analysis_usage`.
11. Return suggestion to caller.

**Daily cap:** 30 analyses/user/day. Hardcoded; requires code change to adjust.

**Loading copy:** "This typically takes up to a minute" — this is intentional; TAS documents >100 pages can take 50+ seconds.

### UI: `EvidencePanel.tsx`

New component rendered inside `QuestionCard`. Three capabilities:
1. **Link documents** — search/select dialog lists tenant documents; auditor links relevant ones as evidence. Stored in `client_audit_response_documents`.
2. **Trigger analysis** — calls `analyse-evidence`; shows loading state with the approved loading copy.
3. **Review suggestion** — shows rating badge, confidence indicator, excerpts with source attribution, and gaps list. Auditor chooses Accept (applies rating + notes via existing handlers), Override (edits before accepting), or Discard (wipes `ai_*` columns).

---

## 4. AI Executive Summary Drafter

**Trigger:** "Generate AI Draft" button in `ReportTab.tsx` — available when the audit has ≥ 3 findings.

### New column

**`client_audits.risk_rationale`** (`text`) — narrative justification for the auto-derived `risk_rating`. AI-drafted, auditor-accepted. Distinct from the computed `risk_rating` value.

### Edge function: `draft-executive-summary`

Pipeline:
1. Caller-JWT auth → audit-access gate.
2. Cool-down check: 5 minutes per audit (not a daily cap — this is a once-per-audit synthesis operation).
3. Minimum findings gate: `MIN_FINDINGS_FOR_SYNTHESIS = 3`. Returns 422 if fewer findings exist.
4. Load all findings, section rollup, and audit metadata.
5. Per-clause corpus retrieval for the most-cited critical/high clauses (up to 8 clauses × 6 chunks each). Retrieval failures are logged to `console.warn` only — they never block the draft.
6. Gemini 2.5 Pro via Lovable AI Gateway → four-part draft JSON.
7. `validateDraft()` from `_validation.ts` (discriminated-union: `{ ok: true; draft } | { ok: false; reason }`). **Architectural invariant:** the `client_audit_log.insert` is behind `if (result.ok)` — a half-validated draft structurally cannot reach the DB.
8. Service-role log insert to `client_audit_log` (`action: 'ai.executive_summary_drafted'`).
9. Return draft + provenance.

**Draft JSON schema:**
```json
{
  "executive_summary": "string (3–5 paragraphs)",
  "overall_finding": "string (1–2 sentences)",
  "risk_rationale": "string (1–2 paragraphs)",
  "action_plan_rollup": {
    "introduction": "string",
    "priority_groups": [
      {
        "priority": "critical | high | medium",
        "narrative": "string",
        "actions": [{ "summary": "string", "linked_finding_ids": ["uuid"] }]
      }
    ],
    "closing": "string"
  },
  "confidence": "high | medium | low",
  "uncertainty_notes": "string | null"
}
```

**Validation extras:** banned-term guard (same as `draft-finding`), overlong-quote guard (≤30 words), and critically — **fabricated-finding-ID check**: every UUID in `linked_finding_ids` must exist in the actual findings list for this audit.

**`_validation.ts` module:** Extracted from `index.ts` so `validation_test.ts` can import it without triggering `Deno.serve()`. This is the first edge function in the project with a companion test file — a pattern worth repeating for other non-trivial output contracts.

**`EXEMPLARS_PENDING` placeholder:** The system prompt contains `{{EXEMPLARS_PENDING}}` where Sam is to supply 2–3 redacted historical executive summaries (one CRICOS/Combined, one CHC/Mock, one Due Diligence). **The function works without these but output quality — particularly voice and narrative structure — will be lower until they are supplied.**

### Edge function: `record-executive-summary-decision`

Companion. Logs per-field decisions for `executive_summary`, `overall_finding`, and `risk_rationale` — each with its own `decision` (`accepted | edited | rejected`) and `edit_distance_pct`. The `action_plan_rollup` is **intentionally excluded** — it is render-only and clipboard-only; it never persists to `client_audits`.

### UI: `ReportTab.tsx`

Heavily extended. AI draft button triggers `useDraftExecutiveSummary` (from `useAuditReport.ts`). Each of the three persisted fields has its own editable textarea with Accept and Reject controls. Edit-distance is computed client-side via a Levenshtein implementation (bounded matrix; length-delta fallback for very long strings). The `action_plan_rollup` is rendered read-only with a clipboard copy button.

**`action_plan_rollup` is ephemeral.** If the auditor navigates away before copying it, it is lost. This is a deliberate design decision per Wave 4 #2 specification.

---

## 5. AI Drafting Insights Dashboard

**Route:** `/admin/ai-insights` — Super Admin only (redirects to `/` otherwise).

**Purpose:** Operational view for monitoring AI drafting activity and driving system-prompt tuning.

### Database

**`v_ai_finding_draft_outcomes` view** — joins `client_audit_log` draft entries to their decision entries. Classifies each draft into an `outcome_bucket`:
- `pending` — no decision yet
- `rejected`
- `accepted_unchanged` — accepted, 0% edit distance
- `accepted_light_edit` — ≤20% edit distance
- `accepted_moderate_edit` — ≤50% edit distance
- `accepted_heavy_edit` — >50% edit distance

Security invoker — RLS on `client_audit_log` applies to caller.

**`ai_drafting_summary(p_window_days int)` RPC** — headline stats: total drafts, pending, accepted by bucket, rejected, acceptance rate %, avg edit distance %, prompt/completion tokens, unique users, cap-hit users (users who hit the 40/day cap in the past 24 hours).

**`ai_drafting_by_clause(p_window_days int, p_min_drafts int)` RPC** — per-clause breakdown: acceptance rate, avg edit distance, rejection rate, low-confidence percentage. Filtered to clauses with ≥ `p_min_drafts` to suppress noise.

### UI components

| Component | Purpose |
|---|---|
| `SummaryTiles` | Headline metrics over configurable window (7/14/30/90 days) |
| `PatternsPanel` | Per-clause patterns — high rejection, heavy edits, low confidence. Click to filter drafts table |
| `RecentDraftsTable` | Paginated list of all AI drafts with outcome bucket |
| `DraftDrillDown` | Slide-out sheet: AI draft JSON vs. final saved finding side-by-side |

---

## 6. LLM and embedding model summary

| Function | Model | Gateway |
|---|---|---|
| `embed-srto-corpus` / `retrieve-srto-context` | `text-embedding-3-small` (1536 dims) | Lovable AI Gateway (`LOVABLE_API_KEY`) |
| `draft-finding` | `google/gemini-2.5-pro` | Lovable AI Gateway |
| `analyse-evidence` | `google/gemini-2.5-pro` | Lovable AI Gateway |
| `draft-executive-summary` | `google/gemini-2.5-pro` | Lovable AI Gateway |

**Note on Anthropic:** The Lovable AI Gateway does not currently route Anthropic models. The `draft-finding` comment documents a swap path: add `ANTHROPIC_API_KEY` and change the gateway URL + model ID — the rest of the pipeline is identical. If voice fidelity against Vivacity's existing findings style proves insufficient, this is the path. Open decision — see `pinned/decisions.md`.

---

## 7. Auth and security patterns

All AI audit edge functions follow the **service-role-after-JWT-gate** pattern:

1. Validate caller JWT (`userClient.auth.getUser()` with caller's bearer token).
2. Perform all data reads and access checks using the **caller-JWT client** (RLS enforced).
3. Log writes to `client_audit_log` using the **service-role client** — because `client_audit_log` INSERT is restricted to Super Admin under existing RLS, and the log should be append-only regardless of the auditor's role.

The service-role write occurs AFTER the auth gate has passed. The caller cannot escalate themselves — only the log write itself uses elevated privileges.

---

## 8. Open questions and known gaps

| # | Question | Priority |
|---|---|---|
| 1 | Has `embed-srto-corpus` been run against SRTO 2025 PDFs? | High — blocks AI quality |
| 2 | National Code 2018 / ESOS Act 2000 PDFs uploaded and embedded? | High for CRICOS audits |
| 3 | **`EXEMPLARS_PENDING`** — Sam to supply 2–3 redacted historical executive summaries | High — voice calibration |
| 4 | Gemini 2.5 Pro vs Claude — voice fidelity against Vivacity's existing findings style? | Medium |
| 5 | Daily caps hardcoded (40 finding drafts, 30 evidence analyses) — approved limits? | Medium |
| 6 | `action_plan_rollup` clipboard-only — is this communicated clearly in UI? | Medium — UX |
| 7 | `validation_test.ts` — wired into CI? | Low |
| 8 | Minimum findings gate (3) — right threshold for due diligence audits? | Low |
| 9 | `v_ai_finding_draft_outcomes` — `client_audit_log` RLS verified for multi-tenant isolation? | Medium — security |
| 10 | AI Insights gate — Super Admin only correct, or should Vivacity consulting staff see it? | Low |
