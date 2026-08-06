# Audit: 2026-05-05 — ask-viv-client-gemini-integration

**Trigger:** ad-hoc — Ask Viv client surface producing empty/incorrect data and
deterministic (non-AI) responses; user-visible bugs reported in production session.
**Scope:** `compliance-assistant-client` edge function and `_shared/ask-viv-fact-builder/data-retrieval.ts`.
No migrations, no schema changes, no UI changes.

## Findings

- `compliance-assistant-client` was entirely deterministic — `buildClientResponse()` produced a fixed-template markdown answer regardless of the question asked. No LLM call was made. The function comment said "NO LLM completion call" by design.
- `package_instances` query in `data-retrieval.ts` previously selected `updated_at`, a column that does not exist on that table. PostgREST returned a silent error, `data` resolved to `null`, and packages appeared empty for all client tenants. This was fixed in a prior deploy (v20/v21) — confirmed via git diff and log timestamps.
- `tasks` table has no `tenant_id` column. Two `.eq("tenant_id", tenantId)` calls caused silent PostgREST failures: one in `data-retrieval.ts` step 4 (tasks always empty), one in `deriveFreshness` (freshness always reported "Stale: Data last updated unknown"). Both removed in this session.
- `buildClientResponse` referenced only `package_count` (total/active numbers), never `package_status` facts — meaning individual package names (e.g. "M-DR") never appeared in answers even when data was correct.
- `LOVABLE_API_KEY` already set in Supabase secrets; 14 edge functions already calling `https://ai.gateway.lovable.dev/v1/chat/completions`. Zero new secrets needed.
- `client-ai-companion` edge function (Gemini-powered, guardrails, mode-gated) was fully built but orphaned — `ClientAICompanionPanel.tsx` was never mounted in any layout. Not touched by this session; confirmed it does not conflict with the `compliance-assistant-client` changes.

## KB changes shipped

- No KB changes this session.

## Codebase observations (read-only)

- unicorn-cms-f09c59e5 @ e7a8d70: HEAD at time of audit. Gemini integration deployed via Lovable prompt into `compliance-assistant-client`. Post-deploy version confirmed via Supabase edge function logs (version 22 → new version); live Ask Viv question returned natural-language Gemini response, verified working.

## Changes shipped (via Lovable prompt)

- `supabase/functions/compliance-assistant-client/index.ts`:
  - Added `LOVABLE_API_KEY` constant.
  - Added `buildFactsContext()` helper — summarises safe facts (tenant, packages, tasks, phases, consult hours) into plain text for Gemini system prompt.
  - Replaced `buildClientResponse()` call with Gemini API call (`google/gemini-2.5-flash`, max_tokens 500, temperature 0.3). Fallback to friendly error message on API failure.
  - Deleted `buildClientResponse()` deterministic formatter.
  - Removed broken tasks fallback in `deriveFreshness` (`.eq("tenant_id", tenantId)` on a table without that column).
- `supabase/functions/_shared/ask-viv-fact-builder/data-retrieval.ts`:
  - Removed `.eq("tenant_id", tenantId)` from tasks query (step 4). RLS handles tenant scoping; the filter caused silent PostgREST failures returning null.

## Decisions

- n/a — no ADRs drafted or resolved.

## Open questions parked

- `OPENAI_API_KEY` not set in Supabase secrets; vector search against `srto_corpus` (Standards for RTOs 2025 content) is disabled. Setting this key would enable Gemini answers to cite specific clauses from the standards. Low urgency — Gemini answers are already grounded via tenant facts.
- `client-ai-companion` remains orphaned. If the other dev's work on that component activates it, confirm it does not conflict with the `compliance-assistant-client` Gemini surface (different endpoints, independent).

## Tag

audit-2026-05-05-ask-viv-client-gemini-integration
