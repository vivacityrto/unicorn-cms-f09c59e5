## Targeted edits to Staff Engagement Checklists

Scope: two files only. No schema, RLS, edge function, or other UI changes.

---

### File 1 — `src/pages/admin/staffEngagementChecklists.ts`

1. **Remove SIGN-OFF phase** from `ONBOARDING_PHASES` (delete trailing `{ key: "signoff", label: "SIGN-OFF", sections: [] }`).
2. **Remove SIGN-OFF phase** from `OFFBOARDING_PHASES` (same trailing element).
3. **Add Exit Interview section** inside the `notice_period` phase of `OFFBOARDING_PHASES`, immediately after the `knowledge` section:
   - key `exit_interview`, label `Exit Interview`
   - one item `exit_interview.completed` — "Exit interview completed and submitted by staff member", owner `Nova / Staff Member`, `critical: false`.
4. **Reorder `access_revoke` items** in the `last_day` phase of `OFFBOARDING_PHASES`. Move the `unicorn` item to the end. New order: `google_workspace, complyhub, xero, m365, teams, zoom, password_manager, email_aliases, unicorn`. Item content unchanged.

---

### File 2 — `src/pages/admin/StaffEngagementDetail.tsx`

1. **Strip Notes + Activity Log tabs**
   - Remove the Notes `TabsTrigger` and `TabsContent`.
   - Remove the Activity Log `TabsTrigger` and `TabsContent`.
   - Remove `activityQuery`.
   - With only the Checklist tab left, unwrap `Tabs`/`TabsList` and render checklist content directly (cleaner than a single-tab shell).

2. **Strip all signoff code**
   - Delete: `signoffsQuery`, `signoffMutation`, `signoffs` const, `signoffsByRole` memo, `mySignoffRole` memo, `Signoff` type.
   - In `userNamesQuery`: drop `signoffUuids` + any `signoffsByRole` references, keep only `completionUuids`.
   - `PhaseProgress`: remove the `signoffCount` prop from both the signature and the call site; remove the `if (phase.key === "signoff") return signoffCount >= 3;` branch so every phase uses the standard `allItems.every(...)` logic.
   - In the `phases.map(...)` render block, delete the entire `if (phase.key === "signoff") { ... }` branch.

3. **Drop pending_signoff auto-transition** inside `toggleMutation.mutationFn`
   - Remove the `if (allCriticalDoneNext && engagement?.status === "in_progress") { ... } else if (!allCriticalDoneNext && engagement?.status === "pending_signoff") { ... }` block.
   - Remove the now-unused `allCriticalDoneNext` local.

4. **Add "Mark as Complete" action**
   - New `completeMutation`:
     - `await supabase.from("staff_engagements").update({ status: "completed" }).eq("id", id!)`
     - onSuccess: toast `"Engagement completed"`, invalidate `["staff_engagement", id]` and `["staff_engagements"]`.
   - Render a `<Button variant="default">` labeled "Mark as Complete" in the header, placed immediately to the left of the existing Manage dropdown.
   - Visibility gate: `(engagement.status === "in_progress" || engagement.status === "pending_signoff") && allCriticalDone === true`.
   - While `completeMutation.isPending`: label becomes "Completing…", button disabled.

---

### Explicitly untouched
`StaffEngagements.tsx`, `StatusBadge` (keeps `pending_signoff` mapping for historical records), invite/revoke/link/unlink/delete dialogs and their mutations, all DB objects, all other files.
