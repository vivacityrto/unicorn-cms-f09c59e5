# Audit: 2026-04-30 — Ask Viv client mode — edge function + frontend build (Prompts 2–5)

**Author:** Carl
**Trigger:** Lovable build session — Prompts 2–5 of `build-ask-viv-client-mode-v1`, following the migration session documented in `2026-04-30-ask-viv-client-mode-migration.md`
**Scope:** Gate helper, client edge function, frontend panel, layout mount. No DB migrations. All changes are additive — no existing files broken.
**Codebase verified at:** `unicorn-cms-f09c59e5@e4d83507` (commit: "Added Ask Viv panel to layout")
**Session start (local HEAD):** `9cdc2a85` — codebase was current at session start

---

## What shipped (per prompt)

### Prompt 2 — Gate helper (`validateClientAskVivAccess`)
**File:** `supabase/functions/_shared/ask-viv-access.ts`

Added `validateClientAskVivAccess` and `clientAskVivDenialMessage` alongside the existing staff helper. `validateAskVivAccess` and `logDeniedAccess` untouched.

Key details:
- Returns `{ allowed: true; tenant_id: number }` on success — gate is the source of truth for tenant scope
- Checks `profile.state` (not `profile.status`) — fixes the latent bug that exists in the staff gate at line 53
- Queries `tenant_members.user_id` (not `user_uuid` — corrected from spec; confirmed via DB schema check)
- `membership_lookup_failed` added as a defensive reason code for query errors
- Hard role split: `Admin` / `User` allowed; all staff roles denied with `not_client_role`

### Prompt 3 — Edge function (`compliance-assistant-client`)
**Files:** `supabase/functions/compliance-assistant-client/index.ts`, `supabase/config.toml`

New sibling function. `compliance-assistant/index.ts` and all `_shared/` modules untouched.

Key details:
- Two supabase clients: user-auth (RLS-scoped reads) and service-role (writes only)
- Embedding model: `"openai/text-embedding-3-small"` — matches the gateway namespace fix already shipped by Angela
- `DENIED_SOURCES` Set filters facts before brain processing, before label building, before logging
- `buildClientResponse` is deterministic (no LLM call) — mirrors V4 compliance-assistant architecture
- `records_accessed` returns `{ label: string }[]` only — no IDs, no table names
- `ai_interaction_logs` inserted via service client with `request_context.surface = 'client'` — key differentiator for AI Insights dashboard
- `ai_client_query_usage` UPSERT via service client; cap SELECT via user-auth client
- Response: strict 6-field shape only — no `scope_lock`, `explain`, `reasoning_tiers`, `validation`, `governance`, `chunks_used`, `source_types_used`, `ai_interaction_log_id`

### Prompt 4 — Frontend panel (`ClientAskVivPanel.tsx`)
**File:** `src/components/ask-viv/ClientAskVivPanel.tsx`

New standalone component. `AskVivPanel.tsx` byte-identical (confirmed via git diff).

Key details:
- Local `useState` only — no `useAskViv()`, no Zustand, no localStorage
- Props: `isOpen: boolean; onClose: () => void`
- Imports only `AskVivFreshnessChip` from the staff ask-viv suite — all other staff subcomponents excluded
- Raw `fetch` (not supabase client) to read 429 `detail` and `retry_after_seconds` from body
- Markdown rendered as `whitespace-pre-wrap` — matches staff panel, no new dependency
- Amber handoff banner when `consultant_handoff_suggested === true`
- 429: rate-limit notice + Send button disabled
- 403: "This feature isn't available on your account" notice
- 5xx: "Something went wrong" + retry (removes orphaned user bubble first)

### Prompt 5 — Layout mount (`ClientLayout.tsx`)
**File:** `src/components/layout/ClientLayout.tsx`

Added floating Ask Viv launcher and panel mount inside `ClientLayoutInner`. `App.tsx`, `DashboardLayout.tsx`, `ClientTopbar.tsx` untouched.

Key details:
- Button at `fixed bottom-6 right-24 z-40` — offset from `right-6` to avoid collision with existing `ClientChatbotLauncher`
- Panel at `z-50` inside `ClientAskVivPanel` — sits above all launchers
- No `useAskViv()`, no `useRBAC()` — standalone `useState(false)` trigger
- `ClientAskVivPanel` and `AskVivPanel` confirmed on separate surfaces (verified via `rg`)

---

## Findings and corrections from codebase review

1. **`profile.status` bug in spec** — corrected in Prompt 2 to use `profile.state`. The existing `validateAskVivAccess` still has this bug at line 53 (always `undefined`); mitigated because `verifyAuth` already rejects inactive users before the gate. Out of scope to fix in this session.

2. **`tenant_members.user_uuid` → `user_id`** — spec said `user_uuid`; actual column is `user_id`. Corrected before Prompt 2 landed.

3. **`tenant_members` vs `tenant_users`** — Lovable's audit flagged `tenant_users` (785 rows) as canonical; however `tenant_members` (391 active rows) is the table used throughout the existing codebase for client membership. Retained `tenant_members` per spec and existing patterns.

4. **`profile.state` is an integer** — post-build discovery. `public.users.state` is an integer column (values 0–7), not a string. The `validateClientAskVivAccess` check `profile.state !== 'inactive'` always passes since no integer equals a string. The gate does not incorrectly block anyone, but the archived-user check is a no-op. Needs a follow-up fix to check the correct integer value for inactive/suspended state.

5. **Embedding model updated** — Angela shipped `"openai/text-embedding-3-small"` (gateway namespace fix) during this session. Prompt 3 incorporated this correctly.

6. **Client impersonation view** — Super Admin "Impersonating Client View" does not render `ClientLayout`, so the Ask Viv launcher does not appear in that mode. Expected behaviour: client mode is for actual client `Admin`/`User` logins, not staff impersonation. Smoke testing requires a real client account.

---

## Open questions / follow-ups

- **`profile.state` integer fix** — identify which integer value maps to inactive/suspended and update `validateClientAskVivAccess` to check the correct value. Low urgency (no incorrect access is granted; the check is just a no-op for now).
- **`validateAskVivAccess` line 53 `profile.status` bug** — also a no-op because `verifyAuth` blocks inactive users first. Low priority.
- **Smoke test pending** — end-to-end test with a real client `Admin`/`User` account not yet completed at time of this audit entry.
- **`ClientChatbotLauncher` visual proximity** — both launchers at bottom-right; `right-24` offset reduces overlap but not verified on all screen sizes. Follow-up UX nudge if needed.

---

## KB changes shipped

- `unicorn-kb @ 8d2d59c` — `handoffs/ask-viv-client-mode.md` (PR #25, pending merge)

---

## Codebase observations

- `unicorn-cms-f09c59e5 @ e4d83507` — all four prompts applied by Lovable across this session
- Angela's AI work ran concurrently: `draft-executive-summary` validation updates, corpus/vector pipeline changes (`embed-srto-corpus`, `retrieve-srto-context`, `vector-index-*`, `vector-search`), and the embedding model namespace fix. None of these conflicted with the client mode build.

---

## Decisions

- No ADRs drafted or resolved this session.
- Architecture decision (sibling function over mode parameter) was locked in the 30 Apr decision-tree session; this audit records its implementation.

---

## Tag

`audit-2026-04-30-ask-viv-client-mode-build`
