# Audit: 2026-08-14 — Academy parked follow-ups resolved: package-instance entitlement gap, seat-cap enforcement, New Course removal, timeline type drift

**Trigger:** ad-hoc — Carl asked to resolve everything left parked from the
same day's earlier auto-enrol/segment-consolidation work.
**Scope:** four independent items. Did not touch the sibling gaps found along
the way (self-enrol RPCs, see below) or any course-content review.

## Findings

- `fn_academy_autoenrol_on_package_instance` (fires `AFTER INSERT` on
  `package_instances`) had the identical gap the retired all-clients trigger
  did: zero check against `tenants.academy_access_enabled` or
  `academy_subscription_expires_at`. Checked real impact before fixing: 0 of
  its 448 `auto_package` enrolments sit on a disentitled tenant today (only 3
  distinct tenants use this source, all already entitled) — a latent hole,
  not an active incident, but the same class of bug.
- Neither auto-enrol trigger enforced `tenants.academy_max_users`. That
  column already has a live, working consumer — `AcademyTenantAccessPage.tsx`
  displays it side-by-side with a computed `enrolled_count` (active
  `academy_enrollments` row count per tenant) as if the second is capped by
  the first — but nothing in the database ever enforced that. Checked: no
  tenant currently has `academy_max_users` set among entitled tenants, so
  this also hasn't caused a real overshoot yet.
- Found and deliberately did **not** fix a related, arguably more exposed
  gap: neither self-enrol path (`enrol_in_academy_course`,
  `enrol_as_impersonator`) checks `academy_access_enabled`,
  subscription expiry, or `academy_max_users` — a real user clicking "Enrol"
  today bypasses all three checks the auto-enrol triggers now respect. Out of
  scope for "the parked items," which were specifically about the two
  auto-enrol triggers; flagging here rather than silently expanding scope
  onto a path affecting live user-facing enrolment clicks.
- `academy_max_users` is a dual-purpose column: `useSeatLimits.ts` reads it
  as a whole-tenant platform-invite cap (gates `tenant_members` invites via
  `checkSeatAvailability`, live in `TenantInviteDialog.tsx`), while
  `useTenantAcademyAccess.ts`/`AcademyTenantAccessPage.tsx` reads the *same*
  column as an Academy-enrolment cap shown against `enrolled_count`. Chose to
  enforce against the metric the Academy admin page already displays (active
  enrolment row count, not distinct users), since that's the comparison
  already presented to admins.
- "New Course" (`AcademyBuilderLibrary.tsx`) created a bare title-only draft
  course with no video, module, or lesson — a second, uncontrolled path to
  course creation alongside Quick Add Recording, per Carl's earlier
  instruction to make Quick Add the sole canonical path.
- `src/types/timeline.ts`'s `TIMELINE_EVENT_TYPES` was missing 4 values the
  live DB `timeline_valid_event_type` CHECK constraint already allowed
  (flagged as an open question in the 2026-08-14
  `academy-course-published-timeline-event` entry). Checked which are
  actually live: `action_item_comment` (trigger `log_action_item_comment_timeline`
  is live, 0 rows yet — imminent, not hypothetical) and `package_status_changed`
  (trigger `fn_package_instance_timeline_trigger` is live, 2 real rows already
  exist and were rendering with the generic fallback icon/color). The other
  two, `audit_created`/`audit_completed`, are allowed by the constraint but
  **nothing writes them** — no function in `pg_proc` inserts either literal
  value. Added all 4 anyway, since the file's own header says it mirrors the
  DB constraint and the goal was reconciling drift, not just wiring up what's
  currently used — but flagged the two dead ones distinctly in the source
  comment.

## Code changes (this entry accompanies these)

- Migration `academy_autoenrol_entitlement_and_seat_cap` (applied via
  `apply_migration`): `fn_academy_autoenrol_on_package_instance` gains the
  same `academy_access_enabled`/subscription-expiry check as the mandatory-
  publish trigger. Both auto-enrol trigger functions now cap new rows per
  tenant via a `row_number() over (partition by tenant_id ...)` window against
  `academy_max_users - current_active_count`, falling through unmodified when
  `academy_max_users` is null.
- `src/pages/superadmin/AcademyBuilderLibrary.tsx`: removed the "New Course"
  button, its dialog, `newCourseOpen`/`newTitle` state, `handleCreateCourse`,
  and the now-fully-unused `generateSlug` helper; promoted "Quick Add
  Recording" to the primary (filled) CTA in its place.
- `src/hooks/academy/useAdminAcademyCourses.ts`: removed `useCreateCourse`
  (its only caller was the removed button).
- `src/types/timeline.ts`: added `action_item_comment`, `package_status_changed`,
  `audit_created`, `audit_completed` to `TIMELINE_EVENT_TYPES`.
- `src/components/client/TimelineEventCard.tsx`: added icon/color entries for
  all 4 to the exhaustive `EVENT_ICON_MAP`/`EVENT_COLOR_MAP` (TS-enforced —
  the build fails if any are missing), a module chip for `package_status_changed`
  ("Packages") and `audit_*` ("Audits"), and a shared "View package" deep link
  for `package_status_changed` alongside the existing `stage_status_changed`
  one.
- `src/hooks/useClientManagementData.tsx`: added `action_item_comment` to the
  existing `tasks` filter group; added new `packages` and `audits` filter
  groups.
- `src/components/client/ClientTimelineTab.tsx`: added "Packages" and
  "Audits" filter chip options (`staffOnly: true`, matching the other
  internal-only categories).

## Verification

- Rollback-wrapped (`BEGIN...ROLLBACK`) live test against real tenant data,
  single transaction:
  - Set a real entitled tenant's (id 7512, 22 active enrolments / 28
    `tenant_users`) `academy_max_users` to 25, then inserted a disposable
    test course with `auto_enrol_all_clients`/`available_to_all_clients`/
    `published` all true in one INSERT (fires the mandatory-publish trigger's
    `TG_OP = 'INSERT'` branch). Result: exactly 3 new enrolment rows for
    that tenant (25 − 22), total active enrolments landed at exactly 25 —
    the cap held precisely, not off-by-one.
  - Confirmed an uncapped tenant (id 6372, no `academy_max_users` set) still
    enrolled its normal eligible headcount from the same test course —
    the cap logic doesn't affect tenants with no limit set.
  - Inserted a disposable `package_instances` row for a real disentitled
    tenant (id 5, `academy_access_enabled = false`) against a package with
    live `academy_package_course_rules`. Result: 0 enrolment rows created —
    pre-fix this would have enrolled every user at that tenant.
  - Confirmed the rollback left zero residue: tenant 7512's `academy_max_users`
    back to null, disposable course and package_instance gone, only the tenant's
    one pre-existing real package_instance row remained.
- Live-verified in the browser (dev server): `/superadmin/academy/builder`
  no longer shows "New Course" in its button list (confirmed via DOM query,
  not a screenshot guess), console clean; "Quick Add Recording" now the
  primary CTA.
- Live-verified a real, pre-existing `package_status_changed` timeline row
  (tenant 7499, "M-AM: active -> complete") now renders with the correct
  `Package` icon and amber color classes instead of the generic
  `Activity`/`bg-muted` fallback it had before this fix.
- `npx tsc --noEmit` clean project-wide (not just the touched files) after
  all frontend changes.

## Decisions

- Enforced `academy_max_users` against active-enrolment-row count (matching
  what the Academy Tenant Access admin page already displays), not distinct
  enrolled users — the two metrics differ (one user enrolled in 5 courses
  counts as 5 rows), but changing the enforced metric to differ from the
  displayed one would be its own source of confusion.
- Added `audit_created`/`audit_completed` to the frontend type despite zero
  current writers, prioritizing "the type file matches the DB constraint" per
  its own stated purpose over "only add what's used today" — flagged
  distinctly in-source so a future reader doesn't assume they're live.
- Left self-enrol (`enrol_in_academy_course`/`enrol_as_impersonator`)
  untouched — a real gap, but expanding scope onto a path real users click
  today deserves its own explicit go-ahead, not a silent bundle into "resolve
  the parked items."

## Open questions parked

- Self-enrol RPCs bypass `academy_access_enabled`, subscription expiry, and
  `academy_max_users` entirely (see Findings) — not actioned.
- `audit_created`/`audit_completed` have no writer anywhere — worth deciding
  whether they're a planned-but-unbuilt feature (there's a whole
  `client_audits`/`audit_appointments` subsystem that could plausibly want
  them) or dead weight to drop from the CHECK constraint.
