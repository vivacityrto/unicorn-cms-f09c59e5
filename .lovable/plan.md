## Add Sign-Off panel to Staff Engagement Detail

**File:** `src/pages/admin/StaffEngagementDetail.tsx` (only)

### 1. Hoist `criticalKeys` / `allCriticalDone` to component scope
- Add `criticalKeys = useMemo(...)` derived from `phases`.
- Add `allCriticalDone = criticalKeys.length > 0 && criticalKeys.every(k => completedKeys.has(k))`.
- In `toggleMutation.mutationFn`, replace the local `criticalKeys` declaration with the hoisted one. Keep the local `next` Set and its own `allCriticalDone` (it evaluates post-toggle state).

### 2. Extend `Engagement` type
Add `linked_unicorn_user_id: string | null` to the `Engagement` type so it can be referenced (column exists on `staff_engagements`).

### 3. Extend `userNamesQuery`
- `enabled`: `(completionsQuery.data?.length ?? 0) > 0 || (signoffsQuery.data?.length ?? 0) > 0`
- `queryKey` updated to include both UUID source arrays
- `queryFn` unions `completed_by` and `signed_by` UUIDs (filter falsy, dedupe), returns `[]` early if none, otherwise queries `users` as before.

### 4. Add `signoffMutation`
- Input: `{ signoffRole: string }`
- Gets authed user via `supabase.auth.getUser()`; throws if missing.
- Inserts into `engagement_signoffs`: `{ engagement_id, signoff_role, signed_by, signed_at }`.
- After insert, runs a `select id, { count: 'exact', head: true }` on `engagement_signoffs` filtered by `engagement_id`. If `count === 3`, updates `staff_engagements.status = 'completed'`.
- `onSuccess`: invalidate `['engagement_signoffs', id]`, `['staff_engagement', id]`, `['staff_engagements']`; success toast.
- `onError`: destructive toast with error message.

### 5. Derive sign-off state
- `signoffsByRole` memo: `Map<string, Signoff>` keyed by `signoff_role`.
- `mySignoffRole` memo:
  - `"staff_member"` if `profile.user_uuid === engagement.linked_unicorn_user_id` (both truthy)
  - else `"operations_manager"` if `role === "Integrator"`
  - else `"ceo"` if `role === "Super Admin"`
  - else `null`

### 6. Replace the `phase.key === "signoff"` placeholder render
- If `!allCriticalDone`: render an amber warning card: "Complete all required (⚠) items before signing off."
- Render a responsive grid (`grid-cols-1 md:grid-cols-3 gap-4`) with three cards in order: `staff_member` → "Staff Member", `operations_manager` → "Operations Manager", `ceo` → "CEO".
- Each card:
  - **Signed state** (`signoffsByRole.has(role)`): green "Signed" badge, signer name via `userNameMap.get(signed_by) ?? "Unknown user"`, formatted `signed_at` via `fmtDateTime`.
  - **Unsigned state**: muted "Awaiting sign-off" text + "Sign Off" button.
    - Button enabled when: `allCriticalDone` AND `mySignoffRole === thisRole` AND (for `staff_member` only) `!!engagement.linked_unicorn_user_id`.
    - For `staff_member`: if disabled solely because `linked_unicorn_user_id` is null, wrap button in a Tooltip with text "Link a Unicorn user first".
    - On click: `signoffMutation.mutate({ signoffRole: thisRole })`; disabled while `signoffMutation.isPending`.

### Out of scope (untouched)
All other checklist phases, cancel mutation, PhaseProgress, engagement query, completions query, all other tabs, all other files.
