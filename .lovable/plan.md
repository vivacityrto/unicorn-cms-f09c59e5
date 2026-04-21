

## Plan: SuperAdmin — Enrolments Manager (refresh)

The page at `/superadmin/academy/enrollments` already exists (`AcademyEnrolmentsPage.tsx` + `useAcademyEnrollments.ts` + `EnrolmentProgressDrawer.tsx`). It covers ~50% of the spec (table, filters, status tabs, basic drawer, revoke/reactivate/extend, CSV). This refresh closes the gaps — bulk enrol modal, missing stat tiles, source chips, expiry warnings, lesson-by-lesson drawer with admin overrides, certificate/assessment blocks, real-time, URL-state filters, and 6 admin RPCs.

### Migrations (one file)
Add `SECURITY DEFINER` admin RPCs guarded by `is_vivacity()`:
- `fn_academy_enrollment_stats()` → returns 6-tile counts in one round trip (total / active / completed / expired / revoked / auto_lifetime).
- `fn_academy_enrollment_lesson_detail(p_enrollment_id bigint)` → returns lessons joined with `academy_lesson_progress` and `training_videos.duration_seconds`, ordered by module + lesson sort.
- `fn_academy_admin_revoke_enrollment(p_enrollment_id bigint, p_reason text)` → sets status='revoked', revoked_at/by/reason.
- `fn_academy_admin_reactivate_enrollment(p_enrollment_id bigint)` → clears revoke fields, status='active'.
- `fn_academy_admin_extend_expiry(p_enrollment_id bigint, p_new_expiry timestamptz)`.
- `fn_academy_admin_mark_lesson_complete(p_enrollment_id bigint, p_lesson_id bigint)` → idempotent upsert into `academy_lesson_progress` with `is_completed=true, completion_percentage=100`. Lets the existing `trg_academy_complete_enrollment_on_progress` chain to course completion + certificate.
- `fn_academy_admin_reset_lesson(p_enrollment_id bigint, p_lesson_id bigint)` → deletes the progress row.
- `fn_academy_admin_issue_certificate(p_enrollment_id bigint)` → inserts into `academy_certificates` if absent (uses existing `fn_generate_certificate_number`).
- `fn_academy_admin_revoke_certificate(p_certificate_id bigint, p_reason text)`.

All return `jsonb` or affected count; all `RAISE EXCEPTION` if not staff.

### Files edited
**`src/pages/superadmin/AcademyEnrolmentsPage.tsx`** — refactor:
- Replace 4 stat tiles with **6 tiles** (Total / Active / Completed / Expired / Revoked / Auto-enrolled lifetime), sourced from `fn_academy_enrollment_stats`.
- Compute live `expired` = `status='active' AND expires_at <= now()` (treat as separate filter from raw `status` column).
- **URL-state filters**: persist `search`, `course`, `tenant`, `status`, `source`, `from`, `to` to query string via `useSearchParams`.
- **Source filter**: change to multi-select chips with values `manual | auto_package | auto_package_backfill` (matches DB).
- **Date range** (enrolled between).
- **Status tabs** show live counts per tab.
- Row visuals:
  - Source chip with distinct colour per source.
  - Tenant badge for `tenant_type` (RTO / CRICOS / dual).
  - Expires red when `< 14 days`, dash when null.
  - Expired rows: red left-border accent. Revoked rows: strikethrough + opacity-60.
  - Course thumbnail next to title.
- **Bulk action bar**: add "Extend expiry for selected" (date picker → applies to all) and "Export selected to CSV"; keep "Revoke selected" but route through new RPC (collect partial-success counts → toast).
- Wire revoke/reactivate/extend mutations to the new RPCs (replace direct UPDATEs).
- Empty state with "Clear filters" / "Seed Package → Course rules" deep-link.
- **Real-time**: subscribe to `academy_enrollments` and `academy_lesson_progress` → invalidate queries.

**`src/components/academy/admin/EnrolmentProgressDrawer.tsx`** — expand:
- Width to `~720px` (`sm:max-w-[720px]`).
- Header: avatar, learner, tenant + type badge, source chip, status chip.
- Summary block: thumbnail, estimated minutes, enrolled / expires / completed / revoked dates + reason, big % bar from `v_academy_course_progress`, "Last activity" from `last_activity_at`.
- **Lessons via `fn_academy_enrollment_lesson_detail`**: grouped by module (sticky module headers), each lesson shows status chip, `completion_percentage` bar, `mm:ss` watch_seconds vs total duration, "Resumes at hh:mm" from `last_position_seconds`, `completed_at`.
- Per-lesson admin actions behind a "Troubleshoot" disclosure: **Mark complete** + **Reset** (call `fn_academy_admin_mark_lesson_complete` / `fn_academy_admin_reset_lesson`).
- Assessment block (only when course has assessments): list `academy_assessments` with attempts table + "Reset attempts" admin action.
- Certificate block: cert number / issued / issuer; download via signed URL from `pdf_storage_path`; "Revoke certificate" action; if absent → "Issue certificate" (manual) action calling `fn_academy_admin_issue_certificate`.

**`src/hooks/academy/useAcademyEnrollments.ts`** — extend:
- `useEnrollmentStats()` → wraps `fn_academy_enrollment_stats`.
- `useBulkEnroll()` → bulk INSERT with `ON CONFLICT (course_id, user_id) DO NOTHING`, returns created count for toast.
- Switch `useRevokeEnrollment`, `useReactivateEnrollment`, `useExtendEnrollment` to call the new admin RPCs.
- `useLessonDetail(enrollmentId)` → wraps `fn_academy_enrollment_lesson_detail`.
- `useEnrollmentRealtime()` → channel `admin-enrollments` on both tables.
- Admin-action hooks: `useMarkLessonComplete`, `useResetLesson`, `useIssueCertificate`, `useRevokeCertificate`, `useResetAssessmentAttempts`.

### Files created
**`src/components/academy/admin/NewEnrolmentModal.tsx`** — bulk-enrol:
- Searchable multi-select learners across `tenant_users` joined with `users` (label = name + email + tenant).
- Searchable multi-select courses (published).
- Optional expiry date picker.
- Notes textarea.
- Submit → bulk INSERT with `ON CONFLICT (course_id, user_id) DO NOTHING`, toast `Enrolled N learners across M courses (X skipped — already enrolled).`

### Out of scope (per spec)
- Email notifications (separate Academy email templates module).
- Tenant-level rollups (covered by AcademyTenantAccessPage).
- The optional `v_academy_enrollments_admin` view — current batched-fetch hydration in `useAdminEnrollments` performs fine and stays.

### Acceptance verification (post-build)
- Insert one new `academy_enrollments` row in the DB → confirm it appears in the table within 2 seconds via real-time.
- Toggle status tabs and confirm counts match the underlying queries.
- Open the drawer → click "Mark complete" on the last outstanding lesson → confirm the enrolment flips to `completed` (validates `trg_academy_complete_enrollment_on_progress` chain via admin RPC) and a `academy_certificates` row appears.
- Bulk-revoke 3 enrolments → confirm 3 update calls succeed and live UI updates.
- Hit `/superadmin/academy/enrollments` as a non-staff user → redirected by existing `ProtectedRoute requireSuperAdmin` guard.

