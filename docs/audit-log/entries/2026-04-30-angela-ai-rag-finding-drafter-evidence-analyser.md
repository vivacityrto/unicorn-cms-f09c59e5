# Audit: 2026-04-30 — Angela's AI RAG Corpus, Finding Drafter & Evidence Analyser

**Trigger:** ad-hoc — Angela shipped 26 commits to `main` in `unicorn-cms-f09c59e5` while local branch was at `e8cbfac4`. Carl requested analysis and audit log before pulling.

**Author:** Carl (analysis only — Angela ran the Lovable session; this entry documents the outcome from Carl's review).

**Scope:** All commits between `bc148492` (oldest in advance set) and `eba8e66f` (origin/HEAD at time of audit). Local codebase was **not** pulled; read-only diff via `git show origin/HEAD:<path>`. Four new migrations, five new edge functions, one new admin page, one new UI component, two modified UI components.

---

## What Angela built

This session introduced three vertically stacked AI capabilities, all routing via the Lovable AI Gateway. They were shipped as a coordinated block in a single Lovable session on 29 April 2026.

### 1 — SRTO 2025 RAG Corpus Infrastructure

**Purpose:** Give the AI functions a grounded, retrievable source of truth from the Standards for RTOs 2025 corpus rather than relying on model training data alone. This is the retrieval layer that every downstream AI feature depends on.

**What was built:**
- `srto_corpus` table with `pgvector` (1536-dim, `text-embedding-3-small`), HNSW index (cosine), clause/quality-area metadata columns, and a `match_srto_chunks()` RPC for semantic retrieval.
- `srto-source-documents` storage bucket — private; Super Admin read/write for PDF uploads.
- `embed-srto-corpus` edge function — Super Admin–only admin operation. Reads PDFs from storage, chunks them (~800 tokens, 150-token overlap), embeds via gateway, upserts into `srto_corpus`. Quality-area mapping for SRTO 2025 clause prefixes (`1.x` → Training & Assessment, `2.x` → VET Student Support, `3.x` → VET Workforce, `4.x` → Governance).
- `retrieve-srto-context` edge function — caller-JWT retrieval endpoint; calls `match_srto_chunks` via `security_invoker` (RLS preserved).
- Two migrations: `20260429073239` (table, RPC, bucket, read policy) and `20260429074954` (Super Admin write/update/delete policies on bucket).

**Note:** The corpus table exists but whether it has been populated (i.e., whether `embed-srto-corpus` has been run against the actual Standards PDFs) is not verifiable from this diff. This is a meaningful open question — the AI draft and evidence analysis pipelines degrade gracefully when `corpus_empty = true`, but the quality of their output is substantially lower without a seeded corpus.

### 2 — AI Finding Drafter

**Purpose:** Allow auditors to generate a polished, Standards-cited draft finding for any `at_risk` or `non_compliant` response at the click of a button, rather than writing the finding from scratch. The draft is advisory — it surfaces in `AddFindingForm`, the auditor edits it, and the existing finding-save flow persists it.

**What was built:**
- `draft-finding` edge function — the generation pipeline: caller-JWT auth → audit-access gate → daily cap check (40 drafts/user/day) → pulls response/question/section/audit rows → semantic retrieval over `srto_corpus` → Gemini 2.5 Pro draft via Lovable AI Gateway → validation → retry once on failure → service-role log to `client_audit_log` (action: `ai.finding_drafted`) → returns draft JSON + provenance.
- `record-finding-decision` edge function — companion; logs `accepted`, `edited`, or `rejected` to `client_audit_log` (action: `ai.finding_decision`) after the auditor acts on the draft. Best-effort from the UI perspective — the actual finding has already been saved/discarded before this fires.
- `AddFindingForm.tsx` — significantly extended with AI draft button, inline draft display, and auditor-edit-before-save flow.
- `QuestionCard.tsx` — minor wiring updates to pass through the draft trigger.
- Migration `20260429081550` — `v_ai_finding_draft_outcomes` view (draft log joined to decision log, `outcome_bucket` classification: pending / accepted_unchanged / accepted_light_edit / accepted_moderate_edit / accepted_heavy_edit / rejected); `ai_drafting_summary()` RPC (headline metrics over configurable window); `ai_drafting_by_clause()` RPC (per-clause breakdown, min-draft threshold to suppress noise).

**Governance and voice compliance in the system prompt:**
- Australian English spelling enforced.
- "Governing Persons" required; "directors", "the board", "board members" banned.
- Model may paraphrase Standards; verbatim quotes capped at 30 words.
- Model must not invent observations beyond what the auditor's note states.
- Model must not identify itself as AI, mention it is drafting, or flag that a human will review.

**Model choice:** Gemini 2.5 Pro via Lovable AI Gateway. The code comment explicitly notes Anthropic is not currently routed by the gateway in this project. A direct Anthropic call is flagged as a swap path if voice fidelity against Sam's existing Smart Education findings proves insufficient — only the gateway URL and model ID would need to change.

### 3 — AI Evidence Analyser

**Purpose:** Allow auditors to link uploaded RTO documents as evidence against a specific audit question, then trigger an AI analysis that suggests a rating and notes gaps. The suggestion is advisory — auditor chooses Accept, Override, or Discard.

**What was built:**
- `analyse-evidence` edge function — pipeline: caller-JWT auth → audit-access gate → daily cap (30 analyses/user/day) → load response + question + linked documents → cross-tenant leakage check (defence-in-depth beyond RLS) → fetch storage files → extract text (PDF via `unpdf`, DOCX via `mammoth`, XLSX via `xlsx`) → semantic retrieval over `srto_corpus` → Gemini 2.5 Pro analysis → hallucination check (verifies any quoted excerpt is found verbatim in source text, min 12 chars) → persist suggestion to `client_audit_responses.ai_*` columns → return.
- `EvidencePanel.tsx` — new component rendered inside `QuestionCard`. Three capabilities: (1) link tenant documents as evidence via a search/select dialog; (2) trigger `analyse-evidence`; (3) display suggestion (rating badge, confidence, excerpts with source attribution, gaps list) and act on it.
- Migration `20260429084303` — adds 7 `ai_*` columns to `client_audit_responses`; new `client_audit_response_documents` join table (response ↔ document, with FULL RLS: select/insert/update/delete, cross-tenant FK check on insert/update); `ai_evidence_analysis_usage` table for daily cap tracking (user-owns-own-row policy).

**Loading copy note:** The UI displays "This typically takes up to a minute" — this was an explicitly approved amendment in the session; TAS documents over 100 pages can reach 50+ seconds.

### 4 — AI Drafting Insights Dashboard

**Purpose:** Super Admin–only operational view for monitoring AI drafting activity. Surfaces acceptance rates, edit distances, per-clause patterns, and side-by-side comparisons of AI draft vs. final saved finding. Intended to drive system-prompt tuning.

**What was built:**
- New page at `/admin/ai-insights` (Super Admin gate via `isSuperAdmin()`, redirects to `/` otherwise).
- `SummaryTiles` — headline metrics (total drafts, acceptance rate, avg edit distance, token usage, cap-hit users) over a configurable window (7/14/30/90 days).
- `PatternsPanel` — per-clause breakdown; surfaces which clauses have high rejection rates, heavy edits, or low-confidence outputs. Click to filter the drafts table.
- `RecentDraftsTable` — paginated list of all AI drafts with outcome bucket and decision metadata.
- `DraftDrillDown` — slide-out sheet showing AI draft JSON vs. final saved finding side by side.
- Route registered in `App.tsx`.

---

## Findings

- **Architecture is sound and multi-layer.** The RAG corpus is a shared library table, the generation functions are thin stateless edge functions, and all AI outputs are append-only logged to `client_audit_log`. The AI Insights dashboard reads from the log, closing the loop. Nothing auto-applies a rating or finding without auditor action.
- **RLS pattern is consistent with project conventions.** New tables have RLS enabled; edge functions use service-role writes only after caller-JWT auth has passed. Views and RPCs use `security_invoker` to preserve underlying RLS rather than escalating to definer rights.
- **Corpus population is an open prerequisite.** The embedding infrastructure exists, but no evidence from this diff that the Standards PDFs have been embedded. Until `embed-srto-corpus` is run against the actual SRTO 2025 documents, both `draft-finding` and `analyse-evidence` will operate with `corpus_empty = true` — the prompt tells the model to express uncertainty in this case, but output quality will be lower.
- **Model is Gemini 2.5 Pro, not Claude.** This is a deliberate gateway constraint — the Lovable AI Gateway does not currently route Anthropic models. The code documents the swap path explicitly. Carl should decide whether voice fidelity against Vivacity's existing findings style meets the bar, or whether an Anthropic key should be added.
- **Daily caps are hardcoded in the edge functions** (40 for `draft-finding`, 30 for `analyse-evidence`). These are not configurable via env var or DB. A code change is required to adjust them. Worth noting for the next planning cycle.
- **No KB changes were made during this session.** The AI drafting workflow, the corpus pattern, and the evidence analysis pattern are not yet documented in `unicorn-kb/`.

---

## KB changes shipped

- No changes — this was a Lovable codebase session only.

---

## Codebase observations (read-only)

- `unicorn-cms-f09c59e5` @ `eba8e66f` (origin/HEAD at time of audit) — 26 commits ahead of local `e8cbfac4`. Local branch was **not** pulled during this audit session. Carl to decide whether to pull.
- Earliest commit in the advance set: `bc148492` (first migration, `20260429073239`).
- Migrations are all timestamped 29 April 2026 and are strictly additive (no ALTER of existing columns, no DROP, no FK changes to pre-existing tables beyond adding new FKs on new tables).
- `supabase/config.toml` was modified twice (commits `16ef65d6` and `cf36a81b`) — these register the new edge functions with the Supabase CLI. Consistent with project pattern.

---

## Decisions

- No new ADRs drafted this session.
- Open question from prior sessions: whether to document the AI edge-function auth pattern (service-role-after-JWT-gate) in an ADR — this session adds three more functions following the same pattern. Recommend ADR.

---

## Open questions parked

1. **Has `embed-srto-corpus` been run?** If not, the AI features exist but are operating without corpus context. Recommend Carl confirms with Angela and notes the run timestamp here.
2. **Gemini vs. Claude for finding voice.** The code comment says to swap if voice fidelity is insufficient. Angela should run a few test drafts against real findings (e.g., Sam's Smart Education audits) and report back. If Claude is preferred, an Anthropic key needs to be added to the Supabase project secrets.
3. **Daily caps.** 40 drafts / 30 evidence analyses per user per day — were these agreed with Angela/Dave, or Angela's default? Not configurable without a code change.
4. **AI Insights gate.** Currently Super Admin only. Should Vivacity consulting staff (non-Super Admin) see aggregate stats? Or is Super Admin the correct boundary?
5. **KB documentation.** The corpus embed pattern, the finding-drafter pipeline, the evidence-analysis pattern, and the AI Insights dashboard are not yet in `unicorn-kb/`. These are non-obvious enough that they warrant KB entries before the next dev picks up this area.
6. **`v_ai_finding_draft_outcomes` tenant isolation.** The view is `security_invoker`, so it inherits RLS from `client_audit_log`. The existing `client_audit_log` read policy should be verified to enforce tenant scoping — worth a targeted RLS audit before Super Admins from multiple tenants use the Insights dashboard simultaneously.

---

## Tag

`audit-2026-04-30-angela-ai-rag-finding-drafter-evidence-analyser`
