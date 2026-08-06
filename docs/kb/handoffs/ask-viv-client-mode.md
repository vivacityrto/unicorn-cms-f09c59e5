# Ask Viv — Client Mode Build Spec

> **Created:** 30 April 2026
> **Status:** Active — use this to scope and ship client-facing Ask Viv.
> **Trigger:** Building case (a) of the original product brief — clients querying their own tenant data ("what's outstanding on our package", "when's our next phase due").
> **Authority:** Carl (decisions locked across 7-step decision tree on 30 Apr).
> **Sibling doc:** [`ask-viv-fix-procedure.md`](ask-viv-fix-procedure.md) — the V4 staff restoration procedure this build sits on top of.

---

## Codebase review amendments (30 April 2026)

Five gaps found during a codebase review against `unicorn-cms-f09c59e5` at commit `9cdc2a85`. Corrections are marked inline with `[Amendment]` callouts throughout this document.

| # | Severity | Location | Issue |
|---|---|---|---|
| A1 | **Critical** | Prompt 2 | `profile.status` is not a field — `UserProfile` has `state`. Use `profile.state !== 'inactive' && profile.state !== 'suspended'`. |
| A2 | **Critical** | Prompt 3 | Two supabase clients needed; not distinguished. Cap check + facts use user-auth client; `ai_interaction_logs` INSERT and `ai_client_query_usage` UPSERT use service client. Wrong client → silent audit failure. |
| A3 | **Medium** | Prompt 3 | Embedding generation step missing. Vector search requires calling `https://ai.gateway.lovable.dev/v1/embeddings` first using `LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")`. Guard the entire vector path with `if (LOVABLE_API_KEY)`. |
| A4 | **Medium** | Prompt 3 | V4 is deterministic (template/rules-based) — no LLM call. `buildFullPrompt` is only used for debug logging. `buildClientResponse` formats facts, it does not call an LLM. Remove `buildPromptPack` from imports; step 8 should say "Format answer" not "Generate answer." |
| A5 | **Medium** | Prompt 5 | Client layout is `src/components/layout/ClientLayout.tsx` (confirmed). It is a plain `{children}` wrapper — no panel slot, no context provider. Panel trigger (isOpen + button) goes there. `ClientAskVivPanel` must use local `useState` (as spec already requires). |
| A6 | **Low** | Prompt 1 | Trigger name not specified. Use `update_ai_client_query_usage_updated_at` calling `public.update_updated_at_column()`. |

**Things the review confirmed are correct (do not change):**
- `records_accessed` and `request_context` columns exist on `ai_interaction_logs` (migration `20260208231115`) ✓
- Service-role bypasses `ai_interaction_logs` RLS — correct by design ✓
- `factsToRecordsAccessed` exported from fact-builder ✓
- `AskVivFreshnessChip` exists with the exact shape in `§3` ✓
- `search_vector_embeddings` RPC params match spec exactly ✓

---

## Goal

Let client-tenant users (roles `Admin` and `User`) query Ask Viv about their own account — the consulting work Vivacity is doing for them, their evidence, learners, packages, phases, tasks, and EOS module. Tenant-scoped, RLS-enforced, audit-logged, daily-capped.

**Explicit non-goals (v1):**
- No Standards interpretation. Client mode does not retrieve from `srto_corpus` or interpret SRTO 2025 / CRICOS / GTO Standards. Regulatory questions return "no relevant information found in your account."
- No flag-for-review button. Quality signal comes from `ai_interaction_logs` aggregate review, not per-response client feedback.
- No multi-tenant client users. Gate assumes one `tenant_members` row per client user.
- No SRTO corpus retrieval. Tenant-scoped vector search via `search_vector_embeddings` only.

---

## What exists today (Ask Viv staff)

| Component | Path | Notes |
|---|---|---|
| Staff edge function | `supabase/functions/compliance-assistant/index.ts` | V4, 38KB, restored 29 Apr per `ask-viv-fix-procedure.md` |
| Staff gate helper | `supabase/functions/_shared/ask-viv-access.ts` | `validateAskVivAccess` — staff-only (`Super Admin | Team Leader | Team Member`) |
| Fact builder | `supabase/functions/_shared/ask-viv-fact-builder/` | Tenant-scoped; returns derived facts, never raw rows |
| Tiered prompts | `supabase/functions/_shared/ask-viv-prompts/` | `buildPromptPack`, `buildFullPrompt`, validation, sanitisation |
| Audit log table | `ai_interaction_logs` | RLS: Vivacity-staff INSERT/SELECT only (migration `20260208232333`). CHECK: `mode IN ('knowledge', 'compliance')` |
| Frontend panel | `src/components/ask-viv/AskVivPanel.tsx` | ~900 lines, mounted in `DashboardLayout` |
| Denied-access audit | `audit_ask_viv_access_denied` | Logs `endpoint`, `user_role`, `reason` |
| Client layout | `src/components/layout/ClientLayout.tsx` | Wraps all `/client/*` routes — plain `{children}` wrapper, no panel slot |

The staff function gates Vivacity-internal first, then validates tenant access via a separate `validateTenantAccess` (which already handles `tenant_members` for non-staff — that path is reachable in code but unreachable in practice because the gate denies non-staff first).

---

## What's new

### 1. Edge function — `compliance-assistant-client/index.ts`

New sibling function. Does NOT replace or modify `compliance-assistant`. Imports the same `_shared/ask-viv-fact-builder/` and `_shared/ask-viv-prompts/` modules, plus a new `validateClientAskVivAccess` helper.

**Pipeline:**
1. CORS + method check (POST only)
2. Extract token, verify auth via `verifyAuth`
3. Parse payload — must include `question` (string), no `tenant_id` field (forced from gate)
4. Call `validateClientAskVivAccess(supabase, user.id, profile, endpoint='compliance-assistant-client')` — gate resolves and returns the user's tenant_id
5. Daily cap check against `ai_client_query_usage` for `(user_id, today UTC)`. If `>= 20`, return 429.
6. Generate query embedding + run fact builder with the gate-resolved `tenant_id`, the user's role, scope = self (no client_id/package_id/phase_id passed)
7. Tenant-scoped vector search via `search_vector_embeddings` (same as staff)
8. Format answer via `buildClientResponse` (new helper — see §3)
9. Translate gaps via small switch (see §3)
10. Compute `consultant_handoff_suggested` — `true` if `confidence === 'low'` OR escalation triggers fired
11. UPSERT increment `ai_client_query_usage` via service client
12. Insert `ai_interaction_logs` row via service client: `mode='compliance'`, `request_context.surface='client'`, plus existing fields
13. Return the 6-field client response shape

**Files to create:**
- `supabase/functions/compliance-assistant-client/index.ts`
- Register in `supabase/config.toml` alongside `compliance-assistant`

**Files to modify:**
- `supabase/functions/_shared/ask-viv-access.ts` — add `validateClientAskVivAccess` (see §2)

### 2. Gate helper — `validateClientAskVivAccess`

Lives in `_shared/ask-viv-access.ts` alongside the existing staff helper. Same `{allowed, reason}` shape, same denied-access logging to `audit_ask_viv_access_denied`.

**Signature:**
```ts
validateClientAskVivAccess(
  supabase: SupabaseClient,
  userId: string,
  profile: UserProfile | null,
  endpoint: string
): Promise<
  | { allowed: true; tenant_id: number }
  | { allowed: false; reason: string }
>
```

**Note the return shape diverges from staff** — on success, returns the resolved `tenant_id`. The gate is the source of truth for which tenant the user belongs to; the function never trusts a `tenant_id` from the request payload.

**Checks in order (fail-fast):**
1. `profile.unicorn_role` is `Admin` or `User` — NOT staff. Hard role split. Reason code: `not_client_role`.
2. > **[Amendment A1]** `UserProfile` has `state`, not `status`. Check `profile.state !== 'inactive' && profile.state !== 'suspended'` (matching the pattern in `auth-helpers.ts:116`). `profile.status` does not exist and will always be `undefined`. Reason: `user_archived`.
3. Query `tenant_members` for `(user_id = userId, status = 'active')`. Expect exactly one row. If zero rows → `no_tenant_membership`. If more than one → `multiple_memberships` (v1 doesn't support this; flag for Angela).
4. Return `{ allowed: true, tenant_id: <from tenant_members row> }`.

**Denied attempts logged** to `audit_ask_viv_access_denied` with `endpoint='compliance-assistant-client'`, `reason`, `user_role`. Reuse existing `logDeniedAccess` (already private to the file but generalised when you add the new helper).

### 3. Response builder — `buildClientResponse`

Lives in the new function (not in `_shared/`) — it's specific to client mode. Sibling to staff's `buildTierFormattedResponse`.

> **[Amendment A4]** V4 compliance-assistant is **deterministic** — no LLM call is made for the answer. `buildClientResponse` formats facts and derived values into the markdown structure below. `buildFullPrompt` in the codebase is used only for debug logging (line 608 of compliance-assistant). Do not call an LLM in client mode; follow the same pattern.

**Markdown structure:**
```
## Answer
[bullets, max 8, plain language]

## What we looked at
- [friendly label]
- [friendly label]

## What we couldn't find
- [translated gap]
- [translated gap]
```

No "Confidence" heading (UI chip), no "Next safe actions" heading (folded into Answer).

**`records_accessed` building:**

After fact builder runs, transform `factsResult.facts` and `vectorResults` into friendly labels. Map per source table:

| Internal source | Friendly label pattern |
|---|---|
| `client_audits` | "Your {audit_type} audit ({month_year})" |
| `package_instances` | "{package_name}" |
| `package_stage_instances` | "Your {stage_name} stage" |
| `evidence` | "Evidence: {filename or label}" |
| `tasks` | "Task: {title}" |
| `eos_rocks` | "Your Rock: {title}" |
| `eos_meetings` | "Meeting on {date}" |
| anything else | suppress (don't expose) |

Output: `{ label: string }[]`. No `table`, no `id`.

**Gap translation switch:**

```ts
function translateGap(gap: string): string {
  if (gap.includes('No relevant facts')) return "No relevant information found in your account";
  if (gap.includes('No vector embeddings')) return "We don't have indexed content for this question yet";
  if (gap.includes('confidence is low')) return "We're not fully confident in this answer";
  if (gap.match(/tables_queried did not contain/i)) return "We couldn't find this type of information";
  // catch-all
  return "No relevant information found in your account";
}
```

Apply to every entry in `factsResult.gaps`. Dedupe after translation.

**Final response object:**

```ts
{
  answer_markdown: string,
  records_accessed: { label: string }[],
  confidence: "high" | "medium" | "low",
  gaps: string[],
  freshness: {
    last_activity_at: string | null,
    days_since_activity: number | null,
    status: "fresh" | "aging" | "stale",
    derived_at: string
  } | null,
  consultant_handoff_suggested: boolean,
}
```

### 4. Daily cap — `ai_client_query_usage` table

```sql
CREATE TABLE public.ai_client_query_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(user_uuid),
  tenant_id bigint NOT NULL REFERENCES public.tenants(id),
  query_date date NOT NULL DEFAULT CURRENT_DATE,
  query_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, query_date)
);

-- Three-step RLS ritual per pinned/conventions.md
CREATE POLICY tenant_read ON public.ai_client_query_usage
  FOR SELECT USING (tenant_id IN (
    SELECT tenant_id FROM tenant_members WHERE user_uuid = auth.uid()
  ));

CREATE POLICY staff_all ON public.ai_client_query_usage
  FOR ALL USING (is_vivacity()) WITH CHECK (is_vivacity());

ALTER TABLE public.ai_client_query_usage ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_ai_client_query_usage_user_date
  ON public.ai_client_query_usage(user_id, query_date);
```

> **[Amendment A6]** Trigger name: `update_ai_client_query_usage_updated_at` calling `public.update_updated_at_column()` — consistent with the project's standard pattern.

**This is a schema migration → triggers Lovable production DB change handoff** ([`lovable-production-db-change.md`](lovable-production-db-change.md)). The dev running the build authors the audit entry; Carl reviews via PR.

**Cap-check + increment in the edge function:**

```ts
const CLIENT_DAILY_CAP = 20;

// Check (user-auth supabase client — RLS scopes to the calling user)
const { data: usage } = await supabase
  .from('ai_client_query_usage')
  .select('query_count')
  .eq('user_id', user.id)
  .eq('query_date', new Date().toISOString().split('T')[0])
  .maybeSingle();

if (usage && usage.query_count >= CLIENT_DAILY_CAP) {
  const secondsToMidnightUTC = 86400 - Math.floor(Date.now() / 1000) % 86400;
  return new Response(JSON.stringify({
    ok: false,
    code: "DAILY_LIMIT_REACHED",
    detail: "You've reached your daily Ask Viv limit (20 queries). Resets daily.",
    retry_after_seconds: secondsToMidnightUTC,
  }), {
    status: 429,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": String(secondsToMidnightUTC) },
  });
}

// ... process query ...

// Increment (UPSERT) — use serviceClient: staff_all policy covers Vivacity; tenant_read is SELECT only
await serviceClient.from('ai_client_query_usage').upsert(
  {
    user_id: user.id,
    tenant_id: gateTenantId,
    query_date: new Date().toISOString().split('T')[0],
    query_count: (usage?.query_count ?? 0) + 1,
  },
  { onConflict: 'user_id,query_date' }
);
```

UTC rollover is acceptable per decision 6 — cap effectively resets ~10am AEST. Documented as known UX quirk; copy says "Resets daily" not "Resets at midnight."

### 5. Frontend mount

Mount a client-mode Ask Viv panel in the client layout.

> **[Amendment A5]** The client layout is confirmed as `src/components/layout/ClientLayout.tsx`. It wraps all `/client/*` routes and is a plain `{children}` wrapper with no existing panel slot and no `AskVivProvider` context. Add the panel + trigger button directly to `ClientLayout`. `ClientAskVivPanel` must use local `useState` for its open/close state (no shared context hook available, and this is the correct approach per the Zustand precedent from the 29 Apr restoration session).

**Two implementation paths:**

**(a) Reuse `AskVivPanel.tsx`** with a prop `clientMode={true}` that strips staff-only UI:
- Hide mode selector (Knowledge / Compliance / Web) — clients only get one mode
- Hide scope selector modal — scope is implicit (their tenant)
- Hide flag-for-review button
- Hide explain-sources toggle
- Hide capabilities banner
- Replace fetch URL with `compliance-assistant-client`
- Strip the V4 metadata display (reasoning_tiers, validation, governance banners) — render only the 6 client fields

**(b) New `ClientAskVivPanel.tsx`** purpose-built for client mode.

Lean (b) for the same reason as decision 1 (sibling function over mode parameter). The staff panel is brittle. Adding `if (clientMode)` branches throughout 900 lines invites the same V3→V4-style cascade failures.

**Files to create:**
- `src/components/ask-viv/ClientAskVivPanel.tsx`
- Mount in `src/components/layout/ClientLayout.tsx`

**Reuse from staff:**
- `AskVivCapabilitiesBanner` — NO, replace with simpler client-facing copy
- Confidence chip styling — YES, copy the visual pattern
- Records-accessed collapsible — YES, but rendering only `label` fields
- Freshness chip component (`AskVivFreshnessChip`) — YES, same shape
- Message bubble layout — YES

**Don't reuse:**
- `AskVivScopeBanner`, `AskVivFlagButton`, `AskVivExplainPanel`, `AskVivMicroExplain`, `AskVivModeSelector`, `AskVivContextChips`, `AskVivExplainSourcesToggle`, `AskVivScopeSelectorModal`

### 6. Consultant-handoff banner (frontend)

When response has `consultant_handoff_suggested: true`, render a small amber banner above the answer:

> "If this doesn't match what you expected, your Vivacity consultant can help — reach out via your usual channel."

Banner copy lives in the front-end. Single source of truth for i18n later.

---

## What's reused unchanged

- `_shared/ask-viv-fact-builder/` — same module, called with client's tenant_id
- `_shared/ask-viv-prompts/` — same prompts, same validation, same sanitisation
- `_shared/auth-helpers.ts` — `extractToken`, `verifyAuth`
- `_shared/response-helpers.ts` — `jsonOk`, `jsonError`, `jsonRaw`
- `audit_ask_viv_access_denied` — same table, new endpoint value
- `ai_interaction_logs` — same table, no schema change. CHECK constraint stays `('knowledge', 'compliance')`. Distinguish client traffic via `request_context.surface = 'client'`
- `search_vector_embeddings` — same RPC, tenant-scoped
- Confidence/freshness logic — same calculations

---

## Access control summary

| Surface | Roles | Tenant scope | Where enforced |
|---|---|---|---|
| `compliance-assistant` (staff) | Super Admin, Team Leader, Team Member | Any (Vivacity can switch) | `validateAskVivAccess` |
| `compliance-assistant-client` (NEW) | Admin, User | Single — own tenant only | `validateClientAskVivAccess` |

Hard role split — a staff user calling `compliance-assistant-client` is denied (`not_client_role`). A client user calling `compliance-assistant` is denied (`not_vivacity_internal`). Both denials log to `audit_ask_viv_access_denied`.

---

## Redaction policy (filter at source, not at response)

Client fact builder narrowed scope. Tables the client function **does** read:

- `tenants` (the user's own tenant)
- `package_instances`, `packages`
- `package_stage_instances`, `package_stages`
- `tasks` (own tenant)
- `evidence`, `evidence_links`, `client_audit_response_documents`
- `client_audits`, `client_audit_responses`
- `documents` filtered to those flagged shared with the client
- `eos_rocks`, `eos_scorecard_metrics`, `eos_meetings` (own tenant)
- Email/chat tables filtered by `sender_user_id IN tenant_users` OR `recipient_user_id IN tenant_users`
- Meeting metadata only (date, title, duration), no `meeting_transcript`

Tables the client function **does not** read:
- `notes` — all hidden in v1 (no visibility flag yet)
- `meeting_transcript` content — all hidden in v1
- `eos_issues` (Vivacity's internal IDS issues about the client)
- `audit_events` (raw observability)
- `ai_interaction_logs` (including the user's own — keeps AI from feeding back)
- Pricing, commercial terms, Vivacity staff PII (`health_leave`)

Implementation: this becomes a flag/parameter on the fact-builder call. Either:
- (a) Pass `surface: 'client'` into the fact-builder; fact-builder branches internally
- (b) Build a thin wrapper `buildClientFacts` in the new function that calls `buildAskVivFacts` then strips disallowed fact categories

(b) is safer — explicit deny list, easier to audit. Lean (b).

Vivacity staff anonymisation: tasks owned by Vivacity staff render as "Vivacity is working on this" without naming the staffer. Apply at the friendly-label transformation step in §3.

---

## Lovable Claude Code prompts (in execution order)

These are intended to be run sequentially via Claude Code, mirroring the shape of `ask-viv-fix-procedure.md`. Each prompt is self-contained — paste verbatim.

### Prompt 1 — Database migration (triggers prod DB handoff)

> Run this first. Schema migration. Triggers `lovable-production-db-change.md` — author the audit entry per that handoff before merging.

```
Create a new Supabase migration that adds the ai_client_query_usage table for
tracking daily query caps on client-mode Ask Viv.

Schema:
- id: uuid PRIMARY KEY DEFAULT gen_random_uuid()
- user_id: uuid NOT NULL, FK to public.users(user_uuid)
- tenant_id: bigint NOT NULL, FK to public.tenants(id)
- query_date: date NOT NULL DEFAULT CURRENT_DATE
- query_count: integer NOT NULL DEFAULT 0
- created_at: timestamptz NOT NULL DEFAULT now()
- updated_at: timestamptz NOT NULL DEFAULT now()
- UNIQUE (user_id, query_date)

RLS policies (three-step ritual per pinned/conventions.md):
1. tenant_read SELECT policy using tenant_members membership check
2. staff_all ALL policy using is_vivacity()
3. ALTER TABLE ... ENABLE ROW LEVEL SECURITY

Add an index on (user_id, query_date) for the cap-check query.

Add the updated_at trigger using the project standard pattern:
  CREATE TRIGGER update_ai_client_query_usage_updated_at
    BEFORE UPDATE ON public.ai_client_query_usage
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

Do NOT modify ai_interaction_logs — its existing CHECK constraint
(mode IN ('knowledge', 'compliance')) stays as-is. Client traffic will use
mode='compliance' and disambiguate via request_context.surface='client'.
```

### Prompt 2 — Gate helper

```
Add a new function validateClientAskVivAccess to
supabase/functions/_shared/ask-viv-access.ts. Place it alongside the existing
validateAskVivAccess. Do NOT modify validateAskVivAccess.

Signature:
  validateClientAskVivAccess(
    supabase: SupabaseClient,
    userId: string,
    profile: UserProfile | null,
    endpoint: string
  ): Promise<
    | { allowed: true; tenant_id: number }
    | { allowed: false; reason: string }
  >

Checks in order, fail-fast:

1. profile.unicorn_role must be 'Admin' or 'User'. Anything else (including
   'Super Admin', 'Team Leader', 'Team Member', null, undefined) → return
   { allowed: false, reason: 'not_client_role' } and log via logDeniedAccess.

2. IMPORTANT: UserProfile has a 'state' field, NOT 'status'. Check
   profile.state !== 'inactive' && profile.state !== 'suspended'.
   If either is true → return { allowed: false, reason: 'user_archived' }
   and log. (Note: the existing validateAskVivAccess at line 53 incorrectly
   checks profile.status — do not repeat that bug here.)

3. Query tenant_members for (user_uuid = userId, status = 'active').
   - Zero rows → { allowed: false, reason: 'no_tenant_membership' } and log.
   - Exactly one row → { allowed: true, tenant_id: <row.tenant_id> }.
   - More than one row → { allowed: false, reason: 'multiple_memberships' }
     and log. (v1 does not support multi-tenant client users.)

The existing private logDeniedAccess function already handles the audit
table insert. Reuse it as-is — do not modify its signature.
Its signature is: logDeniedAccess(supabase, userId, userRole, endpoint, reason)

Reuse the existing askVivAccessDeniedResponse helper for HTTP responses.
The denied-access reason codes go into the response body's message field
(map them to user-friendly strings — e.g. 'not_client_role' →
"Ask Viv client mode is for client-tenant users only.").
```

### Prompt 3 — New edge function: compliance-assistant-client

```
Create a new edge function at
supabase/functions/compliance-assistant-client/index.ts.

Register it in supabase/config.toml alongside compliance-assistant:
  [functions.compliance-assistant-client]
  verify_jwt = false

This is a SIBLING function to compliance-assistant — do NOT modify
compliance-assistant. Imports the same _shared modules.

IMPORTANT ARCHITECTURE NOTE: V4 compliance-assistant is deterministic —
it builds answers from facts using template/rules logic, NOT an LLM call.
The only external API call is for embedding generation (vector search).
Follow the same pattern here: buildClientResponse formats facts into
markdown; it does not call an LLM.

Imports needed:
- createServiceClient from "../_shared/supabase-client.ts"
- extractToken, verifyAuth, UserProfile from "../_shared/auth-helpers.ts"
- jsonOk, jsonError, jsonRaw from "../_shared/response-helpers.ts"
- validateClientAskVivAccess, askVivAccessDeniedResponse from
  "../_shared/ask-viv-access.ts"
- buildAskVivFacts, factsToRecordsAccessed, type AskVivFactsResult,
  type DerivedFact from "../_shared/ask-viv-fact-builder/index.ts"
- processAIBrainInput from "../_shared/ai-brain/index.ts"
- (vector search uses supabase.rpc directly — no import needed)

TWO SUPABASE CLIENTS are required:
- supabase = createClient(url, anonKey, { auth: { ... token ... } })
  Used for: cap check SELECT, fact builder, vector search (RLS scopes results
  to the authenticated user's tenant).
- serviceClient = createServiceClient()
  Used for: ai_client_query_usage UPSERT, ai_interaction_logs INSERT.
  ai_interaction_logs has Vivacity-only INSERT RLS — only service-role can
  write to it from a non-staff context.

Pipeline:

1. CORS preflight handling (POST and OPTIONS only).
2. Extract token via extractToken; 401 if missing.
3. Initialise both supabase (user-auth) and serviceClient (service-role).
4. verifyAuth → user, profile. 401 if fails.
5. Parse JSON body. Required: question (non-empty string). Reject any
   tenant_id, client_id, package_id, phase_id in the payload — clients
   cannot specify scope; the gate resolves it.
6. Call validateClientAskVivAccess(supabase, user.id, profile,
   'compliance-assistant-client'). If denied, return
   askVivAccessDeniedResponse with the user-friendly reason.
   If allowed, capture the gate-returned tenant_id as gateTenantId.
7. Daily cap check (use supabase — user-auth client):
   - SELECT query_count from ai_client_query_usage for (user_id = user.id,
     query_date = today UTC). Use new Date().toISOString().split('T')[0].
   - If query_count >= 20, return 429 with:
     { ok: false, code: "DAILY_LIMIT_REACHED",
       detail: "You've reached your daily Ask Viv limit (20 queries). Resets daily.",
       retry_after_seconds: <seconds to next UTC midnight> }
     Set Retry-After header with the same value.
8. Generate query embedding (required before vector search):
   const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
   let vectorResults = [];
   if (LOVABLE_API_KEY) {
     // POST to https://ai.gateway.lovable.dev/v1/embeddings
     // model: "text-embedding-3-small", input: question
     // Then call search_vector_embeddings RPC with the returned embedding
     vectorResults = await performVectorSearch(
       supabase, gateTenantId, question, LOVABLE_API_KEY
     );
   }
   Mirror the performVectorSearch helper from compliance-assistant exactly.
   RPC params: p_tenant_id, p_query_embedding, p_mode: "compliance",
   p_source_types: null, p_limit: 10, p_similarity_threshold: 0.7.
9. Call buildAskVivFacts (use supabase — user-auth client) with:
     user_id: user.id, tenant_id: gateTenantId, role: profile.unicorn_role,
     scope: { client_id: null, package_id: null, phase_id: null },
     now_iso: new Date().toISOString(), timezone: "Australia/Sydney",
     question.
10. Filter the returned facts to client-allowed sources only — see the
    redaction policy below. Implement as a deny-list filter on
    factsResult.facts after the call.
11. Run processAIBrainInput to get brainResult (confidence, reasoning,
    escalation_triggers).
12. Compute freshness using the same logic as compliance-assistant V4
    (see lines ~317-363 of compliance-assistant for the full derivation —
    audit_events lookup, tasks fallback, day thresholds: <=14 fresh,
    <=30 aging, else stale).
13. FORMAT answer markdown via buildClientResponse (defined in this file).
    This is NOT an LLM call — it builds the response deterministically from
    facts, brainResult, and vectorResults. Structure:
      ## Answer
      [bullets, max 8, plain language. Fold any next-action recommendations
       into Answer; do NOT use a "Next safe actions" heading.]

      ## What we looked at
      - [friendly label]   (only labels, no IDs, no table names)

      ## What we couldn't find
      - [translated gap]
14. Build records_accessed as { label: string }[] using the friendly-label
    map (see redaction policy below). Suppress any source not in the map.
15. Translate gaps via translateGap helper:
      - "No relevant facts" → "No relevant information found in your account"
      - "No vector embeddings" → "We don't have indexed content for this question yet"
      - confidence-low markers → "We're not fully confident in this answer"
      - "tables_queried did not contain" → "We couldn't find this type of information"
      - else → "No relevant information found in your account"
    Dedupe after translation.
16. consultant_handoff_suggested = (confidence === "low") ||
    (any escalation triggers fired during reasoning)
17. UPSERT increment ai_client_query_usage (use serviceClient):
      serviceClient.from('ai_client_query_usage').upsert(
        { user_id, tenant_id: gateTenantId, query_date, query_count: +1 },
        { onConflict: 'user_id,query_date' }
      )
18. Insert ai_interaction_logs row (use serviceClient — Vivacity-only RLS
    blocks non-staff inserts; service-role bypasses it):
      mode: "compliance",
      user_id: user.id,
      tenant_id: gateTenantId,
      prompt_text: question,
      response_text: answer_markdown,
      records_accessed: <internal records, not the friendly-label version>,
      request_context: {
        surface: "client",     // ← KEY DIFFERENTIATOR
        confidence,
        gaps_count,
        tables_queried: factsResult.audit.tables_queried,
        ... (rest of existing context shape)
      },
      chunks_used, source_types_used.
    Do not block on insert failure (best-effort logging).
19. Return jsonRaw with the 6-field shape:
      { answer_markdown, records_accessed, confidence, gaps,
        freshness, consultant_handoff_suggested }

REDACTION POLICY — filter facts to client-allowed sources:

Allowed (let through): tenant info, package_instances, package_stage_instances,
tasks (own tenant), evidence, client_audits, client_audit_responses,
documents flagged shared with client, eos_rocks, eos_scorecard_metrics,
eos_meetings (metadata only — strip transcript fields if present),
emails/chats filtered to where sender or recipient is in the client's
tenant_users.

Denied (suppress entirely): notes (all of them in v1), meeting_transcript
content, eos_issues, audit_events, ai_interaction_logs, pricing,
health_leave, any Vivacity staff PII fields.

Friendly-label map for records_accessed:
  client_audits → "Your {audit_type} audit ({month_year})"
  package_instances → "{package_name}"
  package_stage_instances → "Your {stage_name} stage"
  evidence → "Evidence: {filename or label}"
  tasks → "Task: {title}"  (anonymise: never expose Vivacity staff names —
                            replace owner with "Vivacity" if owner is a
                            tenant 6372 user)
  eos_rocks → "Your Rock: {title}"
  eos_meetings → "Meeting on {date}"
  anything else → suppress

Do NOT call retrieve-srto-context or match_srto_chunks. Client mode does
not retrieve from the SRTO corpus.

Do NOT return scope_lock, explain, reasoning_tiers, validation, governance,
chunks_used, source_types_used, ai_interaction_log_id. Strip all internal
fields before returning.
```

### Prompt 4 — Frontend client panel

```
Create a new component src/components/ask-viv/ClientAskVivPanel.tsx.
Do NOT modify AskVivPanel.tsx.

This is a purpose-built client-mode panel — not a flag-toggled variant of
the staff panel. Brittleness is the reason; see the V4 restoration story
in handoffs/ask-viv-fix-procedure.md.

Reuse from the staff panel (visual patterns and child components):
- Confidence chip styling (low/medium/high colour scheme)
- Records-accessed collapsible structure (but rendering ONLY the label
  field — there is no table or id in the client response)
- AskVivFreshnessChip component (same shape — last_activity_at,
  days_since_activity, status, derived_at)
- Message bubble layout
- Input box and send button

Do NOT reuse or import:
- AskVivScopeBanner, AskVivFlagButton, AskVivExplainPanel,
  AskVivMicroExplain, AskVivModeSelector, AskVivContextChips,
  AskVivExplainSourcesToggle, AskVivScopeSelectorModal,
  AskVivCapabilitiesBanner.

Endpoint: POST to compliance-assistant-client (not compliance-assistant).
Request body: { question: string }. No tenant_id, no client_id,
no package_id, no phase_id — the function rejects those fields.

Response shape (TypeScript):
  type ClientAskVivResponse = {
    answer_markdown: string;
    records_accessed: { label: string }[];
    confidence: "high" | "medium" | "low";
    gaps: string[];
    freshness: {
      last_activity_at: string | null;
      days_since_activity: number | null;
      status: "fresh" | "aging" | "stale";
      derived_at: string;
    } | null;
    consultant_handoff_suggested: boolean;
  };

UI behaviour:

1. When consultant_handoff_suggested is true, render an amber banner above
   the assistant message bubble:
     "If this doesn't match what you expected, your Vivacity consultant
     can help — reach out via your usual channel."

2. Render gaps as a small italic list below the answer if non-empty.

3. Render records_accessed in a collapsible "What we looked at" section
   if non-empty — labels only.

4. Render the confidence chip (low → amber, medium → yellow, high → green
   per existing staff styling).

5. Render the freshness chip when freshness is non-null AND status is
   "aging" or "stale" — match the staff treatment.

Error handling:

- 429 DAILY_LIMIT_REACHED → render the detail copy as a non-bubble
  notice and disable the send button until the next session.
- 403 ASK_VIV_ACCESS_DENIED → render a friendly "this feature isn't
  available on your account" notice. Should never happen for a logged-in
  client tenant user, but possible if their tenant_members row was
  archived mid-session.
- 5xx → generic "Something went wrong" with retry button.

Use the existing supabase client from src/integrations/supabase/client.ts —
do not create a new one.

Persist conversation in component state only — no localStorage. (The
prior issue with web-mode Zustand persistence per the 29 Apr restoration
session is the precedent.)

State management: use local useState for open/close and conversation history.
Do NOT use useAskViv() hook — that context is only provided inside
DashboardLayout, not ClientLayout.
```

### Prompt 5 — Mount in client layout

```
Mount ClientAskVivPanel.tsx in the client-side layout component.

The layout component is src/components/layout/ClientLayout.tsx — this is
confirmed. Do NOT open App.tsx to check.

ClientLayout is currently a plain {children} wrapper with no panel slot
and no AskVivProvider context. Modify it to:
1. Import ClientAskVivPanel.
2. Add local useState: const [isAskVivOpen, setIsAskVivOpen] = useState(false)
3. Add a trigger button in the header/nav area (match the visual pattern
   used in DashboardLayout for AskVivPanel).
4. Render <ClientAskVivPanel isOpen={isAskVivOpen} onClose={() => setIsAskVivOpen(false)} />
   alongside {children}.

Do NOT mount AskVivPanel in the client layout. Do NOT mount
ClientAskVivPanel in DashboardLayout. The two surfaces stay separate.
```

---

## Verification checklist

Run after each prompt completes.

After Prompt 1:
- [ ] `ai_client_query_usage` table visible in Supabase Studio
- [ ] RLS shows enabled in Studio (the silent-failure trap from ADR-005)
- [ ] All three policies present: tenant_read, staff_all, the implicit RLS-enabled check
- [ ] `update_ai_client_query_usage_updated_at` trigger present
- [ ] Audit entry written to `unicorn-audit/audit/YYYY-MM-DD-ask-viv-client-mode-*.md`

After Prompt 2:
- [ ] `_shared/ask-viv-access.ts` exports both `validateAskVivAccess` (unchanged) and `validateClientAskVivAccess` (new)
- [ ] New function uses `profile.state` not `profile.status`
- [ ] Existing staff `compliance-assistant` still works — smoke-test by sending a compliance query as a Super Admin

After Prompt 3:
- [ ] `compliance-assistant-client` deploys
- [ ] `supabase/config.toml` has `[functions.compliance-assistant-client]` entry
- [ ] Calling as a Super Admin → 403 with `not_client_role`
- [ ] Calling as a client `Admin` user → 200 with valid response
- [ ] Calling 21 times in one UTC day → 21st returns 429
- [ ] Audit row in `ai_interaction_logs` with `request_context.surface = 'client'`
- [ ] Audit row in `ai_client_query_usage` increments correctly
- [ ] Response contains exactly the 6 specified fields, no extras
- [ ] Records labels are friendly — no `client_audits:1234`-style entries
- [ ] Asking a regulatory question ("what does clause 2.3 say?") returns gracefully — gaps array contains "No relevant information found in your account", `consultant_handoff_suggested` is true

After Prompt 4:
- [ ] `ClientAskVivPanel.tsx` renders in isolation (Storybook or test page)
- [ ] No imports from disallowed staff sub-components
- [ ] Does not import or call `useAskViv()`

After Prompt 5:
- [ ] Logging in as a client user shows the panel in the client layout
- [ ] Logging in as a staff user does NOT show ClientAskVivPanel (only the staff AskVivPanel in dashboard)
- [ ] Cross-tenant test: client user from tenant A cannot see data from tenant B (RLS check — should be impossible by construction but verify)

---

## Open questions parked for Angela

These were flagged during the decision-tree session. None block v1; all are visible-on-launch or near-term.

1. **Multi-tenant client users.** The gate denies users with multiple `tenant_members` rows. Is that ever a real case? If yes, gate becomes `tenant_id IN (memberships)` rather than equality, and the request payload would need to specify which tenant.

2. **`notes.client_visible` and `meetings.is_internal` flags.** v1 hides all notes and transcripts from clients. v2 schema additions would let clients see explicitly-shared ones. Both default `false` on backfill.

3. **Vivacity staff anonymisation.** v1 replaces staff names on tasks with "Vivacity is working on this." Some firms want named relationships visible. Per-tenant flag is one path.

4. **Regulatory question detection.** Watch `ai_interaction_logs` post-launch (`request_context.surface = 'client'`) for client questions that look regulatory. If meaningful share, that's a v2 signal — either explicit deflection routing or scope SRTO corpus in.

5. **AI Insights dashboard.** `/admin/ai-insights` reads `ai_interaction_logs`. Client traffic will appear mixed with staff. Add a `surface` filter or toggle to segment. Not v1.

6. **Configurability of daily caps.** `CLIENT_DAILY_CAP = 20` is hardcoded, matching Angela's pattern across `draft-finding` (40) and `analyse-evidence` (30). When configurability work happens, do all three at once.

---

## Notes for the dev running this build

- `compliance-assistant-client` is a sibling, not a fork. Do not duplicate `compliance-assistant`'s tier-formatted response logic — it's not relevant for clients. Use `buildClientResponse` only.
- The fact-builder (`_shared/ask-viv-fact-builder/`) is shared. If a future change to the fact-builder shape breaks staff Ask Viv, it'll break this too. Test both surfaces after any `_shared/` change.
- Lovable will likely need multiple turns to complete Prompt 3 — it's the longest. Review each diff carefully against this spec.
- When Prompt 1's migration ships, follow `lovable-production-db-change.md` to write the audit entry. Do not skip — the dev who ran the session is the author per ADR-012.
- The ai_interaction_logs CHECK constraint ('knowledge', 'compliance') is intentionally untouched — disambiguating via `request_context.surface` keeps client traffic in the same query space as staff for the AI Insights dashboard.
- **Two supabase clients** — the edge function needs both. Use `supabase` (user-auth) for anything where RLS should scope results, and `serviceClient` for writes to `ai_interaction_logs` and `ai_client_query_usage`.

---

## Tag

`build-ask-viv-client-mode-v1`
