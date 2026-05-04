## Goal
Replace the deterministic markdown response in the `compliance-assistant-client` edge function with a Gemini-powered answer (via Lovable AI Gateway), and fix two silent `.eq("tenant_id", ...)` errors against the `tasks` table that have no such column.

No UI changes. No migrations. No new secrets (`LOVABLE_API_KEY` already set).

## Files to edit

### 1. `supabase/functions/compliance-assistant-client/index.ts`
- **A.** Add `const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;` near the top constants, just after `DAILY_QUERY_CAP`.
- **B.** Add new helper `buildFactsContext(facts)` that summarises safe facts (tenant, packages, tasks, phases, consult hours) into plain text for the system prompt.
- **C.** Replace step 12 of the handler so it builds a Viv system prompt from `factsContext` + top 3 vector results, then calls `https://ai.gateway.lovable.dev/v1/chat/completions` with `google/gemini-2.5-flash` (max_tokens 500, temperature 0.3). Falls back to a friendly error message on failure. Logs Gemini errors to console.
- **D.** Delete the now-unused `buildClientResponse` deterministic markdown formatter.
- **E.** In `deriveFreshness`, remove the fallback block that queries `tasks` filtered by `tenant_id` (column doesn't exist — silent error contributes to "Stale: Data last updated unknown"). The `audit_events` lookup above is sufficient.

### 2. `supabase/functions/_shared/ask-viv-fact-builder/data-retrieval.ts`
- In step 4 (tasks query), remove `.eq("tenant_id", tenantId)`. RLS handles tenant scoping; the filter currently causes silent PostgREST failures and tasks always appear empty.

## Deployment
Deploy both edge functions after edits:
- `compliance-assistant-client`
- (shared file is bundled into any function importing it; redeploy `compliance-assistant-client` to pick it up)

## Expected outcome
- Viv produces natural-language Gemini answers grounded in tenant facts + RTO 2025 standards snippets, with the safety rails (no "compliant" claims, AU English, concise).
- Tasks facts populate correctly; freshness no longer falsely reports "unknown".
