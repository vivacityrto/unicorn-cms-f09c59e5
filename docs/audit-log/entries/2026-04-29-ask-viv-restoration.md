# Audit: 2026-04-29 — Ask Viv full restoration (V4 compliance-assistant)

**Author:** Carl  
**Trigger:** ad-hoc — Ask Viv showing "Something went wrong" (ErrorBoundary) on every dashboard page  
**Scope:** `AskVivPanel.tsx`, `AskVivCapabilitiesBanner.tsx`, `_shared/ask-viv-prompts/index.ts`, `supabase/functions/compliance-assistant/index.ts`; no DB schema changes  
**Codebase verified at:** `unicorn-cms-f09c59e5@60e3c3fb` (commit: "Added interaction log id to logs")  
**Session start (local HEAD):** same — codebase was current at session start

---

## Findings

- **Bug A — `AskVivCapabilitiesBanner` page-load crash.** `useAskViv` Zustand store persists `selectedMode` to localStorage. A prior session had saved `selectedMode: 'web'`. On reload, `modeConfig['web']` was `undefined` (the `web` key was missing from the config object), causing `config.icon` to throw `TypeError: Cannot read properties of undefined (reading 'icon')`. This crashed `DashboardLayout` via the root `ErrorBoundary` on every page.

- **Bug B — `ReferenceError: GLOBAL_SYSTEM_PROMPT is not defined` in edge function.** `_shared/ask-viv-prompts/index.ts` used re-export syntax (`export { X } from './x.ts'`) for all five prompt constants. Re-exports do not create local bindings in Deno; `buildPromptPack()` used those names as local variables and threw `ReferenceError` at runtime. Confirmed by `ai_interaction_logs` having zero compliance entries — the V4 edge function had never completed a request since it was deployed.

- **Bug C — "Tenant Required" toast for Super Admin in compliance mode.** `loadTenantContext()` in `AskVivPanel.tsx` queries `tenant_members` to resolve tenant context. Super Admins have no `tenant_members` rows, so the query returned nothing and the panel displayed a fuchsia "Tenant Required" banner rather than resolving the tenant. Fix added URL-based fallback: if `tenant_members` returns no rows, parse `/tenant/:id` from `location.pathname` and query the `tenants` table directly.

- **V4 response contract mismatch.** `sendComplianceMessage()` still destructured V3 fields (`explain`, `scope_lock`, `freshness`, `micro_explain`, `ai_interaction_log_id`) that V4 does not return. While render guards (`message.scope_lock &&`) should have made these safely falsy, an upstream exception was triggering the ErrorBoundary before guards could execute.

- **All five restoration prompts verified live:** compliance mode sends and receives responses; scope-lock banner shows inferred scope; freshness chip appears for aging/stale data; explain sources panel renders when toggle is on; flag-for-review button appears on scoped responses.

---

## KB changes shipped

- `unicorn-kb @ 571a407` — `handoffs/ask-viv-fix-procedure.md` created (28 Apr) and updated with session outcome (29 Apr). Documents three pre-prompt bugs and confirms all five prompts executed and verified. PR #19 open for review.

---

## Codebase observations (read-only)

- `unicorn-cms-f09c59e5 @ 60e3c3fb` — All fixes applied via Lovable across this session. Key files changed by Lovable: `AskVivCapabilitiesBanner.tsx` (web mode config), `_shared/ask-viv-prompts/index.ts` (re-export → import+export), `AskVivPanel.tsx` (V4 contract, Super Admin tenant fallback, scope_lock/freshness/explain/ai_interaction_log_id wiring), `compliance-assistant/index.ts` (scope_lock, freshness, explain, ai_interaction_log_id returned in response).

- No DB migrations were created or required. The Lovable production DB change procedure does not apply.

- `ai_interaction_logs` was already being written by `logInteraction()` in the edge function; V4 simply wasn't returning the row ID. Prompt 5 fixed this by making `logInteraction()` return `Promise<string | null>` and chaining `.select("id").single()`.

---

## Decisions

- n/a — no ADRs drafted or resolved this session.

---

## Open questions parked

- `micro_explain` remains unimplemented in V4. The V3 `AskVivMicroExplain` component still exists and is conditionally rendered (`message.micro_explain &&`), but V4 never populates it. No user request to restore it during this session — park until there's demand.
- Freshness thresholds: the inline V4 implementation uses 14/30-day thresholds; the `_shared/ask-viv-fact-builder/freshness.ts` helper uses 7/14. These are now inconsistent. Low priority but worth aligning in a future Lovable prompt.
- `ai_interaction_logs` RLS: the service client bypasses RLS for the insert. This is intentional (Super Admins have no `tenant_members` rows). Acceptable for a Vivacity-internal feature, but worth a comment in the edge function for the next person who reads it.

---

## Tag

`audit-2026-04-29-ask-viv-restoration`
