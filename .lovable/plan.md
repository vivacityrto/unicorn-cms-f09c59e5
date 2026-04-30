## Goal

Create a NEW sibling edge function `compliance-assistant-client` that serves Ask Viv to **client tenant users** (Admin / User). It must NOT touch `compliance-assistant`. Like V4 of compliance-assistant, the answer is built **deterministically** from facts — the only external API call is the embedding generation for vector search. No SRTO corpus retrieval, no LLM completion call.

## Files to add / change

1. **New**: `supabase/functions/compliance-assistant-client/index.ts`
2. **Edit**: `supabase/config.toml` — append:
   ```
   [functions.compliance-assistant-client]
   verify_jwt = false
   ```

## Function pipeline

1. CORS preflight; reject non-POST with 405.
2. `extractToken(req)` → 401 if missing.
3. Build TWO clients:
   - `supabase` = anon-key client with the user's `Authorization` header (RLS-scoped — used for cap SELECT, fact builder, vector search RPC).
   - `serviceClient` = `createServiceClient()` (used only for `ai_client_query_usage` UPSERT and `ai_interaction_logs` INSERT, which has Vivacity-only RLS).
4. `verifyAuth(supabase, token)` → 401 on failure.
5. Parse JSON body. Require non-empty `question` string. Reject (400) if payload contains any of `tenant_id`, `client_id`, `package_id`, `phase_id` — clients cannot specify scope.
6. `validateClientAskVivAccess(supabase, user.id, profile, "compliance-assistant-client")`. On deny → `askVivAccessDeniedResponse(clientAskVivDenialMessage(reason))`. On allow → capture `gateTenantId = check.tenant_id`.
7. **Daily cap check** (use `supabase`):
   - `query_date = new Date().toISOString().split('T')[0]`
   - `SELECT query_count FROM ai_client_query_usage WHERE user_id = … AND query_date = …`
   - If `query_count >= 20`: return 429 with body `{ ok: false, code: "DAILY_LIMIT_REACHED", detail: "You've reached your daily Ask Viv limit (20 queries). Resets daily.", retry_after_seconds: <secs to next UTC midnight> }` and `Retry-After` header.
8. **Vector search** (only if `LOVABLE_API_KEY` present). Mirror the `performVectorSearch` helper from `compliance-assistant/index.ts` exactly:
   - POST `https://ai.gateway.lovable.dev/v1/embeddings` with `model: "openai/text-embedding-3-small"`, `input: question`.
   - `supabase.rpc("search_vector_embeddings", { p_tenant_id: gateTenantId, p_query_embedding, p_mode: "compliance", p_source_types: null, p_limit: 10, p_similarity_threshold: 0.7 })`.
   - Use the user-auth `supabase` client so RLS enforces tenant scope.
9. `buildAskVivFacts(supabase, { user_id, tenant_id: gateTenantId, role: profile.unicorn_role, scope: { client_id: null, package_id: null, phase_id: null }, now_iso, timezone: "Australia/Sydney", question })`.
10. **Deny-list filter** on `factsResult.facts` — drop any fact whose `source_table` is in: `notes`, `meeting_transcripts`, `eos_issues`, `audit_events`, `ai_interaction_logs`, `pricing`, `health_leave`, plus any keys/values referencing Vivacity staff PII (e.g. owner_email, owner_phone). Implement as `const DENIED_SOURCES = new Set([...])` filter.
11. `processAIBrainInput(...)` (reuse `convertFactsToDataForFacts` style mapping inline) to obtain `brainResult.confidence`, `brainResult.reasoning`.
12. **Freshness derivation** — copy the same logic from `compliance-assistant/index.ts` lines 317–363:
    - latest `audit_events.created_at` for tenant; fall back to `tasks.updated_at`.
    - days thresholds: `≤14 fresh`, `≤30 aging`, else `stale`.
13. **`buildClientResponse`** — deterministic markdown (NO LLM):
    ```
    ## Answer
    - <bullets, max 8, plain language; fold next-action recommendations in here>

    ## What we looked at
    - <friendly label>   (no IDs, no table names)

    ## What we couldn't find
    - <translated gap>
    ```
    Bullets are derived from filtered facts (status, blockers, next due task, escalations) and top vector results (paraphrased, no raw chunk dumps).
14. **records_accessed** — `{ label: string }[]` only. Map filtered fact `source_table` rows via this whitelist (suppress anything else):
    | source_table | label template |
    |---|---|
    | client_audits | `Your {audit_type} audit ({month_year})` |
    | package_instances | `{package_name}` |
    | package_stage_instances | `Your {stage_name} stage` |
    | evidence | `Evidence: {filename or label}` |
    | tasks | `Task: {title}` (replace owner with "Vivacity" if owner's `tenant_id === 6372`) |
    | eos_rocks | `Your Rock: {title}` |
    | eos_meetings | `Meeting on {date}` |
15. **`translateGap`** helper — mapping table:
    - `"No relevant facts"` → `"No relevant information found in your account"`
    - `"No vector embeddings"` → `"We don't have indexed content for this question yet"`
    - confidence-low markers → `"We're not fully confident in this answer"`
    - `"tables_queried did not contain"` → `"We couldn't find this type of information"`
    - else → `"No relevant information found in your account"`
    - Dedupe after translation.
16. `consultant_handoff_suggested = (confidence === "low") || reasoning.escalation_triggers.length > 0`.
17. **UPSERT** `ai_client_query_usage` via `serviceClient`:
    ```ts
    serviceClient.from('ai_client_query_usage').upsert(
      { user_id, tenant_id: gateTenantId, query_date, query_count: prior+1 },
      { onConflict: 'user_id,query_date' }
    );
    ```
18. **INSERT** `ai_interaction_logs` via `serviceClient` (best-effort; do not block on failure):
    `mode: "compliance"`, `user_id`, `tenant_id: gateTenantId`, `prompt_text`, `response_text: answer_markdown`, `records_accessed: <internal {table,id,label} format>`, `request_context: { surface: "client", confidence, gaps_count, tables_queried }`, `chunks_used`, `source_types_used`.
19. **Return** via `jsonRaw` exactly these 6 fields:
    ```json
    {
      "answer_markdown": "...",
      "records_accessed": [{ "label": "..." }],
      "confidence": "high|medium|low",
      "gaps": ["..."],
      "freshness": { ... },
      "consultant_handoff_suggested": false
    }
    ```
    No `scope_lock`, `explain`, `reasoning_tiers`, `validation`, `governance`, `chunks_used`, `source_types_used`, or `ai_interaction_log_id`.

## Imports

```ts
import { createServiceClient } from "../_shared/supabase-client.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { extractToken, verifyAuth, type UserProfile } from "../_shared/auth-helpers.ts";
import { jsonOk, jsonError, jsonRaw } from "../_shared/response-helpers.ts";
import {
  validateClientAskVivAccess,
  askVivAccessDeniedResponse,
  clientAskVivDenialMessage,
} from "../_shared/ask-viv-access.ts";
import {
  buildAskVivFacts,
  factsToRecordsAccessed,
  type AskVivFactsResult,
  type DerivedFact,
} from "../_shared/ask-viv-fact-builder/index.ts";
import { processAIBrainInput } from "../_shared/ai-brain/index.ts";
```

## Architecture guardrails (must hold)

- No modification of `compliance-assistant/index.ts` or any `_shared` module.
- No SRTO retrieval, no `match_srto_chunks`, no `retrieve-srto-context` invocation.
- No LLM completion call — `buildClientResponse` is pure formatting from facts/brain/vector results.
- Embedding model string is exactly `"openai/text-embedding-3-small"` (matches the gateway namespace fix already shipped).
- `serviceClient` is used only for the two writes that require RLS bypass; everything that reads tenant data uses the user-auth client so RLS enforces tenant scope.

## Verification (after switching to Build mode)

1. `supabase--deploy_edge_functions ["compliance-assistant-client"]`.
2. `supabase--curl_edge_functions` smoke as a client-tenant user with question `"What's the status of my current package?"` — expect 200 with the 6-field shape, no internal fields leaking, `records_accessed` containing only friendly labels.
3. Second smoke with `tenant_id` in body — expect 400.
4. Confirm `ai_client_query_usage` row incremented and `ai_interaction_logs` row written.
