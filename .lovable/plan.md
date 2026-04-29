# Restore scope_lock + freshness in compliance-assistant V4

The frontend (`AskVivScopeBanner`, `AskVivFreshnessChip`) is already wired to consume `scope_lock` and `freshness` on assistant messages, but V4 stopped emitting them. This plan restores both fields end-to-end without touching the banner/chip components.

## 1. Edge function: `supabase/functions/compliance-assistant/index.ts`

### 1a. Build `scope_lock` from fact-builder output

The shared helper `_shared/ask-viv-fact-builder/scope-lock.ts` already produces the exact `ScopeLock` shape the frontend `AskVivScopeBanner` expects (`tenant_id`, `client`, `package`, `phase`, `derived_at`, `inference_notes`). Reuse it.

- Add import next to the existing fact-builder import:
  ```ts
  import { buildScopeLock, type ScopeLock } from "../_shared/ask-viv-fact-builder/scope-lock.ts";
  ```
- After `buildAskVivFacts(...)` returns (around line 215), derive labels and the scope lock:
  - Pull `tenant_name` from `factsResult.facts` (key `tenant_name`).
  - Pull a `package_label` by finding the first `package_*` fact whose `source_ids[0]` matches the resolved `package_id`, falling back to its `reason` / package fact value, or `null`.
  - Pull a `phase_label` similarly from the `phase_*` facts for the resolved `phase_id`.
  - Call `buildScopeLock({...})` passing:
    - `tenantId: tenantId`
    - `tenantName`
    - `providedScope`: the IDs *as sent in the request body* (`context.client_id`, `context.package_id`, `context.phase_id` — all stringified or null)
    - `resolvedScope`: `factsResult.context.scope` (these are the post-inference values)
    - `decisions: factsResult.audit.inference_decisions`
    - `labels: { client_label: tenantName, package_label, phase_label }`
- If no client scope is resolved (`resolvedScope.client_id` is null AND no tenant fact), set `scope_lock = null`.

### 1b. Build `freshness`

Derive last activity from data the fact-builder already pulled — no new query needed in the common path:

- Inspect `factsResult.audit.record_ids_accessed` and the underlying derived facts. The fact-builder retrieves tasks, evidence, consults, packages, phases. For each, the fact-builder stores `value_at` / source rows with `updated_at` already loaded.
- Simpler and more reliable: run one lightweight query bounded by tenant + (optional) package:
  ```ts
  const { data: activityRow } = await supabase
    .from("audit_events")
    .select("created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  ```
  If `audit_events` doesn't yield a row, fall back to `tasks.updated_at` (filtered by tenant_id and, if present, package_instance_id) — `.order("updated_at", desc).limit(1)`.
- Compute:
  ```ts
  const lastActivityAt = activityRow?.created_at ?? null;
  const days = lastActivityAt
    ? Math.floor((Date.now() - new Date(lastActivityAt).getTime()) / 86_400_000)
    : null;
  const status: "fresh" | "aging" | "stale" =
    days === null ? "stale" : days <= 14 ? "fresh" : days <= 30 ? "aging" : "stale";
  const freshness = {
    last_activity_at: lastActivityAt,
    days_since_activity: days,
    status,
    derived_at: new Date().toISOString(),
  };
  ```
- Wrap the query in try/catch; on error set `freshness = null` and continue (must never break the response).

### 1c. Wire into `generateFactBasedAnswer` return (line 690)

`generateFactBasedAnswer` is the function whose return becomes the response body (`return jsonRaw(response)` at line 266). Two clean options:

- **Preferred**: compute `scope_lock` and `freshness` in the request handler (after `buildAskVivFacts` succeeds and before `generateFactBasedAnswer` is called), then merge them into the response object after the call:
  ```ts
  const response = generateFactBasedAnswer(...);
  return jsonRaw({ ...response, scope_lock, freshness });
  ```
  This keeps `generateFactBasedAnswer` pure and avoids changing its signature.

This option is what we'll use.

## 2. Frontend: `src/components/ask-viv/AskVivPanel.tsx`

### 2a. `sendComplianceMessage` return (~line 345)
Add the two fields back to the returned object:
```ts
return {
  content: result.answer_markdown,
  records_accessed: result.records_accessed,
  confidence: result.confidence,
  gaps: result.gaps,
  reasoning_tiers: result.reasoning_tiers,
  governance: result.governance,
  validation: result.validation,
  scope_lock: result.scope_lock ?? undefined,
  freshness: result.freshness ?? undefined,
};
```

### 2b. `assistantResponse` construction in `sendMessage` (~line 508)
Add the two fields back to the compliance branch:
```ts
assistantResponse = {
  id: "compliance-" + Date.now(),
  role: "assistant",
  content: result.content,
  records_accessed: result.records_accessed,
  confidence: result.confidence,
  gaps: result.gaps,
  reasoning_tiers: result.reasoning_tiers,
  governance: result.governance,
  validation: result.validation,
  scope_lock: result.scope_lock,
  freshness: result.freshness,
  created_at: new Date().toISOString(),
};
```

No other frontend changes — the `Message` interface (line 65), the banner render block (line 765) and the freshness chip render block (line 776) already consume these fields.

## 3. Out of scope (explicitly not changing)

- `AskVivScopeBanner.tsx`, `AskVivFreshnessChip.tsx` — already correct.
- Knowledge / web modes — only compliance mode regressed.
- Fact-builder internals and `scope-lock.ts` helper — used as-is.
- Database schema, RLS, audit logging.

## 4. Verification

- After edits, deploy `compliance-assistant` and send a question with explicit `tenant_id` only (no client/package/phase) — `scope_lock` should return with `inferred: true` for any fields the fact-builder inferred, and `AskVivScopeBanner` should appear.
- Send a question for a tenant whose latest activity is >30 days old — `AskVivFreshnessChip` should render in `stale` style.
- Confirm no regression to existing fields (`reasoning_tiers`, `governance.caution_banners`, `validation.sanitized`).
