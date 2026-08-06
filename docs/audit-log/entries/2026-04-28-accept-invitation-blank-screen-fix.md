# Audit: 2026-04-28 — AcceptInvitation Blank Screen Fix

**Author:** Brian  
**Trigger:** ad-hoc — platform-wide performance anti-pattern audit surfaced a blank-screen bug in `AcceptInvitation.tsx`; Lovable patched it in the same session  
**Scope:** all files in `src/pages/` (anti-pattern sweep), deep diagnosis of `AcceptInvitation.tsx`, verification of Lovable patch `c08d8cd2`  
**Codebase at session start:** `unicorn-cms-f09c59e5@940dac1b`  
**Codebase after pull:** `unicorn-cms-f09c59e5@c08d8cd2`

---

## Context

Following the ManageTenants React Query migration (see `2026-04-28-manage-tenants-perf-optimisation`), a platform-wide sweep was run against all remaining files in `src/pages/` to surface the same class of anti-patterns. `ManageTenants.tsx` was excluded — already clean. The sweep flagged `AcceptInvitation.tsx` as CRITICAL. A full diagnostic read confirmed a user-visible blank screen on any validation failure. Lovable was prompted to fix it; patch verified before closing the session.

---

## Finding 1 — Platform-wide anti-pattern sweep

### What was verified

Every `.tsx` file in `src/pages/` was checked against five anti-patterns:

| Code | Pattern | Severity |
|---|---|---|
| AP1 | Bare `useEffect` Supabase fetches (bypasses React Query) | CRITICAL |
| AP2 | Stuck loading state — `setLoading(false)` not in `finally` | CRITICAL |
| AP3 | No pagination — `.select(*)` with no `.limit()` or `.range()` | HIGH |
| AP4 | Realtime channel triggers full re-fetch | MEDIUM |
| AP5 | Mixed `useEffect` + `useQuery` for same data | MEDIUM |

### Results

| Page file | Anti-patterns | Supabase calls in useEffect | Severity |
|---|---|---|---|
| `AcceptInvitation.tsx` | AP1 | 2 | CRITICAL* |
| `AdminAssistant.tsx` | AP1, AP2 | 3 | CRITICAL |
| `AdminAiFeatureFlags.tsx` | AP1, AP3 | 3 | HIGH |
| `AdminCompliancePacks.tsx` | AP1, AP3 | 3 | HIGH |
| `AdminDocumentAIReview.tsx` | AP1, AP3 | 2 | HIGH |
| `AdminEOSProcesses.tsx` | AP1 | 1 | HIGH |
| `AdminKnowledgeLibrary.tsx` | AP1 | 1 | HIGH |
| `AdminManagePackages.tsx` | AP1, AP3 | 3 | HIGH |
| `ClientDetail.tsx` | AP1 | 1 | HIGH |
| `ManageDocuments.tsx` | AP1, AP3 | 2 | HIGH |
| `TenantDetail.tsx` | AP1 | 2 | HIGH |
| `Dashboard.tsx` | — | 0 | CLEAN |
| `ManageTenants.tsx` | — | 0 | CLEAN |

*The initial sweep flagged `AcceptInvitation.tsx` as AP1 + AP2 (CRITICAL). The deep diagnostic below found AP2 was a false positive — both loading flags are correctly in `finally` blocks. The file was still CRITICAL due to a different bug: silent blank screen on any validation error.

### Residual backlog

Nine files remain with AP1 or AP3 and no fix in this session. `AdminAssistant.tsx` retains a genuine AP2 (stuck loading on error) and is the next highest-priority candidate. All others are HIGH — AP1 without loading-state risk, or AP3 (unbounded fetches). No fixes were made to these files this session.

---

## Finding 2 — AcceptInvitation.tsx deep diagnosis

### State and data-fetching architecture

The file has no React Query. Entirely bare `useEffect` + `useState`.

```
useState(false)  → isLoading      (form submit spinner)
useState(true)   → validating     (initial page-load spinner)
useState(null)   → invitationData (email, tenantId, userType, tenantName, firstName, lastName, unicornRole)
useState({…})   → formData       (password, confirmPassword, firstName, lastName, phone)
```

One `useEffect` — fires on `[token]` change; calls `validateToken()`.

### Supabase calls

**Call 1 — RPC** (pre-fix line 56):
```ts
supabase.rpc('validate_invitation_token', { p_token_hash: tokenHash })
```
Input: SHA-256 hex of the raw URL token. Returns: `status`, `expires_at`, `email`, `tenant_id`, `first_name`, `last_name`, `unicorn_role`, optional `error`.

**Call 2 — tenants fetch** (pre-fix line 87):
```ts
supabase.from('tenants').select('name').eq('id', data.tenant_id).maybeSingle()
```
Selects only `name` for the specific `tenant_id` returned by Call 1. Skipped if `tenant_id` is null. Sequential by necessity — Call 2 cannot run until Call 1's result is known.

### Token source

`useSearchParams` → `searchParams.get('token')` — raw token from query string. Hashed client-side with `crypto.subtle.digest('SHA-256')` before passing to the RPC.

### AP2 false positive — loading flags are safe

- `setValidating(false)` — in `finally` block ✅
- `setIsLoading(false)` — in `finally` block ✅

Neither flag can stick. The initial sweep over-called this.

### The real bug — silent blank screen

On any error in `validateToken()` (expired token, RPC failure, network hang, already-used invitation), the catch block fired a destructive toast then set `validating(false)` while `invitationData` stayed `null`. The render tree hit:

```ts
if (!invitationData) {
  return null;   // ← complete blank screen
}
```

The toast auto-dismissed after a few seconds. The user was left looking at an empty white page with no heading, no explanation, no retry button, and no way to proceed. No `error` state existed; no error branch in JSX.

---

## Fix — Lovable patch `c08d8cd2`

**Files changed:** `src/pages/AcceptInvitation.tsx` (+17 lines), `.lovable/plan.md` (plan update). No other files touched.

### Verification checklist (all passed)

1. **Error UI present** — `return null` replaced with a div containing heading "Invalid or expired invitation", a description paragraph ("This invitation link may have expired…"), and a `<Button variant="outline" onClick={validateToken}>Try again</Button>`.

2. **`!validating` guard added** — condition is now `if (!invitationData && !validating)`, preventing the error UI from flashing during the initial validation pass.

3. **Spinner branch unchanged** — `if (validating)` block with `Loader2` spinner and "Validating invitation…" text unmodified.

4. **`validateToken` call sites — exactly two** — `useEffect` (line 38) and the Try again `onClick` (line 290). No other callers.

5. **Diff scope clean** — `git diff HEAD~1 --stat` confirmed only `AcceptInvitation.tsx` and `.lovable/plan.md` changed.

---

## KB changes shipped

No KB changes this session.

---

## Codebase observations

- `unicorn-cms-f09c59e5@940dac1b` — platform state at session start; ManageTenants React Query migration already live.
- `unicorn-cms-f09c59e5@c08d8cd2` — AcceptInvitation blank screen fix live; nine pages still carry bare useEffect Supabase fetches.

---

## Decisions

None drafted or resolved this session.

---

## Open questions parked

- `AdminAssistant.tsx` — genuine AP1 + AP2 (stuck loading risk confirmed); 3 bare Supabase calls in `useEffect` with `setIsLoading(false)` not in a `finally` block. Highest-priority residual.
- `AdminDocumentAIReview.tsx` — `fetchStats()` fetches the entire documents table to count statuses in JavaScript. Should be a server-side `count()` grouped query.
- `AdminManagePackages.tsx` — `fetchPackages()` does `select('*')` on `packages` with no limit; will degrade as catalogue grows.
- Full React Query migration for remaining 9 pages not scheduled — no timeline set.

---

## Tag

`audit-2026-04-28-accept-invitation-blank-screen-fix`
