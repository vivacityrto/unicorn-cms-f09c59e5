## Bug

`ClientPreviewContext` persists the preview session only in `sessionStorage`, which is per-tab. The Academy link in `ClientSidebar.tsx` opens `/academy` with `target="_blank"`, so the new tab starts with empty `sessionStorage`, no preview state restores, `isPreviewMode=false`, and `useAcademyActingUserId` returns the real staff `user.id`. Result: Academy greets the staff member ("Good morning, khian") instead of staying in preview.

BUG-024 fixed in-tab fallback (no ghost users, no staff fallback inside preview), but only when the context already says `isPreviewMode=true`. The new tab never gets there.

## Fix (frontend only — no DB / RLS / migration / RPC changes)

Single source of truth stays `ClientPreviewContext`. Add a cross-tab mirror so a tab opened from a preview tab restores the same preview cleanly, and add a guard so the mirror is never restored for the wrong auth user or after an explicit end.

### 1. `src/contexts/ClientPreviewContext.tsx` — mirror to localStorage, scoped to staff

- Extend `StoredPreviewSession` with `ownerUserId: string` (the staff `auth.users.id` that started the preview). Keep existing `startedAt`.
- Introduce a second key, e.g. `PREVIEW_HANDOFF_KEY = "client_preview_handoff"`, written to `localStorage`. Keep `PREVIEW_SESSION_KEY` in `sessionStorage` as the per-tab primary (unchanged semantics for the originating tab).
- Helper `writePreviewState(s)` writes to both `sessionStorage[PREVIEW_SESSION_KEY]` and `localStorage[PREVIEW_HANDOFF_KEY]`.
- Helper `clearPreviewState()` removes both keys.
- Use these helpers in:
  - `startPreview` (replace `persistSession`)
  - `setActingUserId` (so the picker change propagates to other tabs)
  - `endPreview` cleanup
- Restore effect:
  1. Read `sessionStorage[PREVIEW_SESSION_KEY]` first (current behavior, originating tab).
  2. If absent, read `localStorage[PREVIEW_HANDOFF_KEY]`.
  3. Validate before restoring:
     - `canUsePreview` is true (existing).
     - `s.ownerUserId === session.user.id` — refuse otherwise (covers logout/login/other-user-on-same-browser).
     - Optional age cap: `Date.now() - Date.parse(s.startedAt) < 12h` — refuse and clear handoff if older. Prevents stale restore after browser restart.
  4. Apply current BUG-024 acting-user validation (clear `actingUserId` if not in `actingUserOptions`), then `writePreviewState` so the new tab's `sessionStorage` is also seeded and stays the per-tab primary.
- Add a `storage` event listener: when another tab clears `PREVIEW_HANDOFF_KEY` (i.e. ended preview), this tab also runs the local cleanup (no audit write, no RPC) so all preview tabs end together. When `actingUserId` changes in the handoff record, sync the local state so the picker stays consistent across tabs.
- Wait for `session?.user?.id` before running the restore effect so the `ownerUserId` check is meaningful. Add `session?.user?.id` to the effect deps.

### 2. `src/components/client/ClientSidebar.tsx` — keep new-tab Academy launch

- No behavioral change required. The Academy `<a href="/academy" target="_blank">` continues to open in a new tab; the new tab now hydrates from `localStorage[PREVIEW_HANDOFF_KEY]`.
- Optional defensive nicety: only render the link with `target="_blank"` when not in preview, and as a same-tab `<Link to="/academy">` when `isPreviewMode` is true. Skip this unless we see flakiness; the storage handoff alone satisfies the spec.

### 3. `src/hooks/academy/useAcademyActingUserId.ts` — unchanged

- Still returns `actingUserId` (or `null`) in preview, never falls back to staff. Once the new tab restores `isPreviewMode=true`, behavior is correct automatically.

### 4. Consumer surfaces — unchanged

- `AcademyDashboardPage`, `AcademyLessonViewerPage`, `ClientTopbar`, `ImpersonationBanner`, `ClientHomePage` already read from the context. No edits needed; they will see `isPreviewMode=true` after restore.

### 5. No DB / RPC / RLS / migration changes

- `list_acting_user_options`, `audit_client_impersonation`, `tenants`, `tenant_users`, `tenant_members` untouched.
- `/manage-tenants` counts and dashboard cards unaffected (no shared code touched).

## Verification

1. Tenant 5 (no activated acting user): Start preview → click Vivacity Academy → new tab opens, restores from localStorage handoff, `isPreviewMode=true`, `actingUserId=null`, Academy shows neutral empty state. Never "Good morning, khian".
2. Tenant with valid acting user: New Academy tab shows the same acting user across topbar, banner, dashboard, lesson pages, hooks.
3. Reload Academy tab while preview active: sessionStorage now seeded by the restore in step 1; reload restores from sessionStorage normally; if acting user is stale it is cleared per BUG-024 logic; never falls back to staff.
4. Exit preview in either tab: `storage` event fires in sibling tabs, all preview tabs cleanup; subsequent navigations behave as real staff.
5. Different staff user logs in on the same browser: handoff `ownerUserId` mismatch → restore refused, handoff cleared.
6. Browser restart 12h+ later: age check refuses stale handoff.
7. `/manage-tenants` totals, active/suspended/client counts, dashboard cards: unchanged (untouched).
8. Non-preview Academy navigation by a real client user: unchanged (no preview record exists).

## Risk Assessment

- **Low risk**: scope is one context file plus a small `storage` listener; no schema, no RLS, no RPC, no audit-flow changes.
- **Backward compatible**: originating-tab behavior unchanged (sessionStorage still primary). New behavior only activates when sessionStorage is empty and a valid handoff exists for the current staff user.
- **BUG-024 preserved**: acting-user validation against `actingUserOptions` runs on every restore path; `useAcademyActingUserId` and `useClientActingUser` unchanged; ghost-user resolution remains deleted.
- **Audit trail intact**: only `startPreview`/`endPreview` write `audit_client_impersonation`; cross-tab cleanup via `storage` event does not insert/update audit rows (the originating end already wrote `ended_at`).
- **Multi-staff browser safety**: `ownerUserId` check prevents another staff member on the same machine from inheriting a preview.
- **Stale-restore safety**: 12h age cap + explicit clear on `endPreview` keep handoff bounded.

## Files touched

- `src/contexts/ClientPreviewContext.tsx` (handoff mirror, owner/age guard, storage listener)
- No other files require changes for the fix to satisfy all acceptance criteria.
