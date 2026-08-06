# Audit: 2026-05-19 — Academy notification leak fix

**Trigger:** Lovable production DB change session — user reported that an Academy-only user could see a `suggestion_submitted` notification in the Academy notification bell. Root-cause investigation found a four-layer defect: unfiltered bell rendering, edge-function authz gap, dangerously permissive `user_notifications` INSERT RLS, and one stale row in production.
**Author:** Carl
**Scope:** `supabase/functions/notify-suggestion-submitted`, two new edge functions (`notify-merge-fields-updated`, `notify-action-shared`), `src/components/layout/AcademyTopBar.tsx`, `src/hooks/useMissingMergeFields.tsx`, `src/components/client/ClientActionItemsTab.tsx`, RLS policy `user_notifications_authenticated_insert`, one-row data purge. Out of scope: other edge functions writing to `user_notifications` not in the current fix path (e.g. `generate-notifications`); `tenant_csc_assignments` coverage gap (327/407 tenants unassigned).

---

## Background

User reported that Academy-only user `khianbsismundo@gmail.com` (`user_uuid = d695317e-ed0c-4450-83c5-b3b25808edc2`, tenant 7517, `tenant_users.access_scope = 'academy_only'`) was seeing a `suggestion_submitted` notification (`Suggestion received — Your suggestion has been submitted to the Vivacity team`) in the Academy notification bell. Academy-only users should not have access to the client-portal suggestion feature; the notification should never have been generated or rendered.

Pre-audit (via Supabase MCP + codebase grep) found:

- The Academy `AcademyTopBar.tsx` renders the same `<NotificationDropdown />` used by the staff bar, backed by `useNotifications` which has no role/scope filter.
- `notify-suggestion-submitted` edge function (`supabase/functions/notify-suggestion-submitted/index.ts`) never checked the caller's `tenant_users.access_scope`. It allowed any caller who was `reported_by` themselves.
- RLS policy `user_notifications_authenticated_insert` had `WITH CHECK ((SELECT auth.uid()) IS NOT NULL)` — any authenticated user could insert any notification for any recipient (latent issue separate from the user-reported bug).
- Two client-caller `user_notifications.insert(...)` sites (`useMissingMergeFields.tsx`, `ClientActionItemsTab.tsx`) would 42501-break under any tightened RLS — both were swallowed by `.catch(_ => {})` and would silently no-op feature work.
- Exactly 1 row matched the cleanup predicate across the entire DB (Khian's `suggestion_submitted` from 2026-05-06, created 2 seconds after the `suggest_items` row, edge function fired normally).
- `ClientRouteGuard.tsx` `academy_only` block has been in place since the initial commit on 2026-02-10 — three months before Khian's submission. Either Khian's `access_scope` was different on 2026-05-06 and changed since, or there is a route bypass; manual UI test in Phase 0 confirmed the guard fires today, leaving the May-6 state unrecoverable.

---

## Findings

- `useNotifications` (`src/hooks/useNotifications.tsx:31-37`) selects every `user_notifications` row for the current `user_id` with no type or scope filter. The Academy top bar rendered every notification regardless of audience. By contrast, `useClientNotifications.tsx:55` correctly disables its query when `isAcademyOnly`.
- No `user_notifications.type` value in the live data is Academy-relevant. Distribution at planning time: `note_shared` (365), `meeting_upcoming` (363), `message` (87), `suggestion_submitted` (71), `support_ticket` (42), `note_added` (23), `qc_scheduled` (7), `task_due` (5), `qc_reminder` (4), `capacity_alert` (2), `follower` (1), `utilisation_warning` (1). Academy enrolments / certificates do not write to `user_notifications`. Hiding the bell entirely is therefore the simplest correct UI fix today.
- `notify-suggestion-submitted/index.ts` line ~94 (`if (!isStaff && item.reported_by !== callerId) return 403`) allowed self-submission for any non-staff caller including academy_only. Line ~161 wrote the submitter receipt unconditionally.
- RLS gap on `user_notifications` is broader than this bug. Six DB triggers (`fn_notify_csc_on_support_ticket`, `fn_notify_conversation_participants`, `fn_tm_on_message_insert`, `fn_check_consultant_overload_alert`, `fn_check_membership_usage_alerts`, `check_membership_utilisation_alerts`) plus two edge functions (`notify-suggestion-submitted`, `generate-notifications`) plus 8 client-side `.insert(` sites all write to the table — most via service-role, but 2 via client-caller. Bundled the RLS tighten in this session to close the door on client-side cross-user writes.
- `clients_legacy.manager` is dead data — coverage check found `0/407` tenants with that column populated. The pre-Phase-0.5 `useMissingMergeFields` hook was already a silent no-op for every tenant. `tenant_csc_assignments` is the authoritative tenant→CSC mapping (saved as project memory `tenant_csc_resolution.md`). Coverage there is `80/407` — partial, but the only live source.
- `ClientRouteGuard.tsx` blocks `/client/suggestions/new` for `isAcademyOnly` today (Phase 0 manual UI test). Khian's 2026-05-06 row predates the guard only in Lovable's "Changes" squash-commit history; `4567bced 2026-02-10` is the earliest commit containing the file, and `git log -S 'academy_only'` returned no incremental edits, suggesting the guard logic was present in that initial commit. Historical `access_scope` for Khian on 2026-05-06 is unrecoverable — `audit_user_events` has zero rows for the target user.

---

## DB changes shipped

Two migrations applied via Lovable to Supabase project `yxkgdalkbrriasiyyrwk`:

| # | File | Type | Effect |
|---|---|---|---|
| 1 | `supabase/migrations/<ts>_tighten_user_notifications_insert.sql` | RLS | Replaced `user_notifications_authenticated_insert` policy. New `WITH CHECK`: `user_id = (SELECT auth.uid()) OR public.is_super_admin_safe((SELECT auth.uid())) OR public.is_vivacity_team_safe((SELECT auth.uid()))`. Policy `TO authenticated` (tightened from `TO public`). |
| 2 | `supabase/migrations/<ts>_purge_academy_only_user_notifications.sql` | Data | `DELETE FROM public.user_notifications un USING public.tenant_users tu WHERE tu.user_id = un.user_id AND tu.access_scope = 'academy_only' RETURNING ...`. Dry-run matched exactly 1 row (Khian); DELETE returned 1; idempotent on re-run. |

`is_super_admin_safe` and `is_vivacity_team_safe` both already existed, both `SECURITY DEFINER` with `SET search_path = 'public'` and `SET row_security = 'off'`. No new SQL functions in this session.

Rollback SQL captured in the audit (Phase 3 rollback restores the wide-open INSERT policy; Phase 4 rollback is not meaningful — re-inserting a stale notification serves no purpose, PITR available if needed).

---

## Code changes shipped (via Lovable)

| Phase | File | Change |
|---|---|---|
| 1 | `src/components/layout/AcademyTopBar.tsx` | Wrap `<NotificationDropdown />` block in `{!isAcademyOnly && (...)}` using `useClientTenant()`. |
| 2 | `supabase/functions/notify-suggestion-submitted/index.ts` | Added Check A (caller-level academy_only pre-check) between `isStaff` resolution and `suggest_items` fetch, and Check B (per-tenant academy_only check using `item.tenant_id`) after `suggest_items` fetch. Both return 403 with `"Suggestions are not available on your plan."`. |
| 0.5 | `supabase/functions/notify-merge-fields-updated/index.ts` | New service-role edge function. Resolves CSC via `tenant_csc_assignments` (primary first, else first row by `assigned_since`). Returns `{ notified: 0 }` for tenants without an assignment. |
| 0.5 | `supabase/functions/notify-action-shared/index.ts` | New service-role edge function. Validates caller is tenant member; validates each `notify_user_id` is in same tenant or Vivacity staff (silent drop, returns `{ notified: n, dropped: d }`). |
| 0.5 | `src/hooks/useMissingMergeFields.tsx` | Replaced direct `user_notifications.insert(...)` with `supabase.functions.invoke("notify-merge-fields-updated", ...)`. |
| 0.5 | `src/components/client/ClientActionItemsTab.tsx` | Replaced direct `user_notifications.insert(...)` with `supabase.functions.invoke("notify-action-shared", ...)`. |

Phase ordering enforced: 1 → 2 → 0.5 → 3 → 4. Phase 0.5 had to land and verify before Phase 3 to avoid 42501-breaking the relocated flows.

Row shape preserved across the relocation: same `type`, `title` formula, `message` formula, `link`, `is_read`, `created_by`. New `dedupe_key` introduced (`merge_data_updated:${tenant}:${csc}:${uuid}` and `action_shared:${tenant}:${uid}:${uuid}`) — never collides so behaviour is equivalent to the old "always insert" path.

---

## Verification

| Phase | Verification |
|---|---|
| 1 | As Khian, `/academy` → bell not rendered. As `full`-scope client → bell visible. Staff `TopBar.tsx` unchanged. |
| 2 | curl as academy_only JWT → 403 with expected body. Multi-tenant + per-tenant academy_only case → 403 via Check B. Staff happy path → 200. Full-scope happy path → 200. |
| 0.5 | App smoke: merge-fields save → notification reaches CSC via new edge function (for tenants with `tenant_csc_assignments`); action share → recipients notified, unauthorised IDs silently dropped. Notification row shape identical pre/post except added `dedupe_key`. |
| 3 | `pg_policy` snapshot confirmed new `WITH CHECK` and `TO authenticated`. REST smoke: non-staff insert for other user → 42501. Non-staff insert for self → 201. App smoke: stage-note follower add, EOS QC session, tenant-note mentions, EOS QC scheduler all still produce rows (staff path via `is_vivacity_team_safe`); merge-fields + action-share still work via service-role edge functions. |
| 4 | Dry-run = 1 row (Khian). DELETE returned 1 row. Post-check `COUNT(*) FROM user_notifications JOIN tenant_users ON ... WHERE access_scope = 'academy_only'` = 0. Re-run of migration deletes 0, completes cleanly. |

End-to-end as Khian: `/academy` → no bell, `/client/suggestions/new` → `AcademyOnlyFallback` (existing guard), stale row gone, any future submission attempts rejected at the edge function (Phase 2) and at RLS (Phase 3) — defence in depth.

---

## KB changes shipped

None. `unicorn-kb/` `git log -1 origin/main` = `d43d7b0847f61cbe467481b4ea38ce6cdd8dbdcd` (unchanged this session).

Project memory `tenant_csc_resolution.md` saved to local Claude memory store — captures that `tenant_csc_assignments` is canonical and `clients_legacy.manager` is dead. Not a KB doc — it's a per-user memory for future Claude sessions; promote to KB if it turns out to be broadly relevant.

---

## Codebase observations (read-only at session start)

`unicorn-cms-f09c59e5 @ a01bbf73601d1f96e4376b7b102406342bea7a1d`: origin/main SHA at audit time. Lovable phases 1–4 applied during this session; sync state of those changes against this SHA pending Carl's PR review.

---

## Decisions

- **Hide the Academy bell vs filter by type vs add `target_audience` enum**: chose hide. No Academy-relevant types exist today; YAGNI on the enum. Revisit when Academy emits its own notifications (enrolment confirmations, certificates, lesson reminders).
- **Edge function: reject vs skip submitter receipt for academy_only**: chose reject (403). If the suggestion shouldn't exist, the `suggest_items` row shouldn't exist either. (b) leaves a real DB row owned by someone who can't use the feature.
- **`user_notifications` INSERT RLS bundled in same session**: yes — separate phase. Audit found the policy was wide open; closing it is defence in depth and prevents future leaks of the same class. Required inserting Phase 0.5 to relocate the two client-caller paths first.
- **No academy_only guard on the two new edge functions (`notify-merge-fields-updated`, `notify-action-shared`)**: skipped. UI routes are already gated by `ClientRouteGuard.tsx` `academy_only` block (verified Phase 0). Adding RLS-level rejection inside these functions would be belt-and-braces past what's needed for this bug; flagged as low-priority follow-up.
- **CSC source change for `merge_data_updated`** (from `clients_legacy.manager` to `tenant_csc_assignments`): accepted. Coverage check showed `clients_legacy.manager` was already 0/407 populated — the old code path was a silent no-op for every tenant. New path actually works for the 80/407 tenants with `tenant_csc_assignments`. Net improvement.
- **Phase 5 (final verification + summary) collapsed**: handled inline in Phase 4 closure. No separate Lovable prompt needed.

---

## Open questions parked

- **Khian's `access_scope` on 2026-05-06**: unrecoverable from current audit tables. `audit_user_events` has 0 rows for the target user. `ClientRouteGuard` blocks the path today (Phase 0 manual UI test confirmed). Whether the guard had a bypass that's since closed, or Khian's scope was different then and changed silently, cannot be determined. No action.
- **`tenant_csc_assignments` coverage gap**: 327/407 tenants have no row. `merge_data_updated` notifications silently no-op for those tenants. Predates this session; same observable behaviour as pre-fix. Worth a separate KB note ("which tenants have no CSC?") or a backfill exercise — not in scope here.
- **`generate-notifications` edge function**: not opened in depth this session. Could harbour the same access_scope-checking gap as `notify-suggestion-submitted` had. Worth a follow-up audit of every edge function writing to `user_notifications`.
- **`notify-merge-fields-updated` / `notify-action-shared` academy_only check**: deferred (see Decisions). Add if a future flow exposes either function to academy_only callers.
- **`ClientRouteGuard.tsx` route allow-list maintenance**: if new client-portal routes are added (e.g. a new `/client/...` page), they auto-block for academy_only by default. Good. But the inverse — a new Academy-relevant route added under `/academy/...` requiring portal data — would need a fresh think. No action this session.
- **Pre-existing client-side `user_notifications.insert(...)` sites under `is_vivacity_team_safe`**: 4 staff-caller insert sites (`StageNotesTab`, `EosQCSession`, `noteNotifications`, `QCScheduler`) continue to insert directly. Acceptable today because the staff path satisfies the new RLS. Long-term, relocating them to service-role edge functions matches the pattern from Phase 0.5 and removes the "staff-callers can insert anywhere" implicit trust. Not in scope.

---

## Tag

`audit-2026-05-19-academy-notification-leak-fix`
