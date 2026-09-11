# Verification of the 5 monitoring findings

I re-checked every finding against the code as it stands today. Three are real, two have already been fixed since they were raised.

## Confirmed real (3)

### 1. App flashes "Loading..." and loses typed work when the login session renews — high
Evidence: in `src/auth/session.ts` the auth listener clears the profile, profile error and memberships on **every** auth event (including a silent token refresh), before re-fetching. `src/components/ProtectedRoute.tsx` renders a full-screen "Loading..." whenever the profile is empty, so the whole page unmounts and any half-filled form is lost. Confirmed by reading both files.

### 2. KPI reviews and sign-off missing from My KPI dashboard — medium
Evidence: `src/components/kpi/MyKpiSignOffSection.tsx` no longer exists (only 7 files remain in `src/components/kpi/`), and a project-wide search for `kpi_review` / `MyKpiSignOff` outside the generated database types returns nothing. There is no replacement screen, while the database tables and the save routine are still in place.

### 3. Edit Time: client contacts appear in the "Person" list — medium
Evidence: `EditTimeDialog.tsx` builds `teamMembers` as Vivacity staff **plus** the client's own portal users (`tenant_users` -> `users` lookup), and the "Person" selector at line 360 renders that combined list. The list is only meant to hold Vivacity staff, so billable hours can be attributed to a client user.

## Already fixed — not actionable (2)

### 4. Client portal admins can remove their own login
`ClientUsersPage.tsx` line 618 now guards the action with `row.user_id !== profile?.user_uuid`, matching the staff-side screen. Stale.

### 5. Past meeting summaries no longer show cascade messages
`MeetingSummaryCard.tsx` lines 40 and 315 keep the legacy cascade card and render it when a summary has no One Phrase Close. Stale.

## Proposed fixes

1. **Session refresh:** only clear the profile and memberships when the signed-in user actually changes or there is no session; on a token refresh keep the existing profile and refresh it in the background. Keep the "Loading..." gate for genuinely first-time loads.
2. **Edit Time person list:** restore a staff-only list for the "Person" selector, and keep the combined staff + client list for the notification-recipient selector only.
3. **KPI sign-off:** confirm with you whether its removal was deliberate. If it was, I mark the finding as expected; if not, restoring the panel is a separate piece of work and I would scope it on its own.

## Notes

No database, security policy or permission changes are involved in items 1 and 2 — they are frontend-only.
