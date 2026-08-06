# Audit: 2026-05-11 — angela-sessions-may7-10-academy-support

**Trigger:** ad-hoc — retrospective audit of Angela's Lovable sessions 7–10 May 2026. 249 commits, 102 files changed, 14 new migrations (20260507034156 → 20260510042726).
**Author:** Carl Balita · **Reviewer:** Carl
**Scope:** Everything in `origin/HEAD` (codebase `1fb3ecc3`) that is ahead of local HEAD (`d51d50b5`) and NOT already documented in a separate main-branch audit entry. Separate sessions with their own audit docs (staff-directory-rpc-hardening — unmerged PR from `audit/2026-05-08-staff-directory-rpc-hardening`) are noted but not re-covered here. Supabase live DB state not independently inspected; findings are based on migration files and source diffs only.

**Note on prior audits:** Migrations `20260507034156` and `20260507051924` are fully documented in `audit-2026-05-07-day2-messaging-unread-badge`. Migrations `20260508005618`, `20260508012828`, `20260508015811`, and one `DROP INDEX` are covered in `audit-2026-05-08-dashboard-bugs-9-10-11-fix` and `audit-2026-05-08-rls-perf-client-package-dashboard`. Migration `20260508044515` (team directory RPCs) is documented in the unmerged `audit/2026-05-08-staff-directory-rpc-hardening` PR. These are excluded below to avoid duplication.

---

## Session overview

Angela ran four continuous Lovable sessions across 7–10 May 2026, each building on the last. The work fell into five coherent themes:

1. **Stage instances canonical RLS** — silent prerequisite for client package dashboard security
2. **Support tickets system** — new client-facing support channel with file attachments and CSC notification
3. **Security hardening batch** — privilege escalation fix, storage lockdown, security_invoker enforcement
4. **Academy impersonation backend** — staff-side enrol/complete-as-impersonator RPCs + full academy RLS rewrite
5. **Academy routes restructure** — new client-facing academy pages, access gate, and route architecture

Bookending it all: a research findings RLS fix (10 May) and a set of polish changes (Calibri font removal, AddEvent calendar embed, PostSignInRedirect page).

---

## Findings

### 1. Stage instances canonical RLS (migration `20260508000840`)

`stage_instances` and `client_task_instances` previously had bespoke RLS policies. This migration replaced them with canonical `app.user_can_access_tenant(tenant_id)` / `public.tenant_is_writeable()` helpers — consistent with how other tables are gated.

- **SELECT on `stage_instances`**: now requires `packageinstance_id` to belong to a package instance whose `tenant_id` passes `app.user_can_access_tenant()`.
- **UPDATE on `stage_instances`**: same SELECT gate, plus writability check or super-admin override.
- **SELECT on `client_task_instances`**: joins through `stage_instances → package_instances` to reach `tenant_id`.
- **UPDATE on `client_task_instances`**: same join path, plus writability check.
- Migration runs in a transaction with a 3s lock timeout and 15s statement timeout — safe for live production.
- This migration may be Phase 2A remediation from the client URL access audit; the timing and pattern are consistent. Not confirmed independently.

### 2. Support tickets system

**Migration `20260508023052`** is the backend foundation:

- Added `metadata jsonb` to `help_threads` and `user_notifications`. The `user_notifications.metadata` column is specifically needed to pass structured payload (`thread_id`, `tenant_id`, `user_id`) to the CSC notification.
- Created storage bucket `support-attachments` (5 MB limit, images only: JPEG, PNG, GIF, WebP, SVG, BMP, TIFF). Initially created as `public = true` — corrected in security hardening batch below.
- `fn_notify_csc_on_support_ticket` trigger function: on INSERT to `help_threads` where `channel = 'support'`, inserts a `user_notifications` row of type `support_ticket` for every active Vivacity staff member (role in `Super Admin`, `Team Leader`, `Team Member`; non-plus email; `@vivacity.com.au` domain; non-null `user_uuid`). Trigger: `AFTER INSERT ON help_threads FOR EACH ROW`.

**UI additions (multiple commits, 8–9 May):**

- `SupportTicketsPage.tsx` — staff-side inbox view. Queries `help_threads` where `channel = 'support'`, joins user names and tenant names client-side, fetches last message preview. Supports reply composer with `help_messages` INSERT. Mobile-responsive with a `Sheet` panel. Mark-resolved functionality.
- `SupportTicketsWrapper.tsx` — route wrapper.
- `App.tsx`: new route `/support-tickets` (protected, no role gate — accessible to all authenticated staff; RBAC restriction not verified in this audit).
- `src/hooks/useSupportTicketsBadge.ts` — unread count hook for nav badge.
- Client side: client inbox updated to support initiating a support ticket. `ClientInboxPage.tsx` gains a support tab.

**Observations:**
- The `support-attachments` bucket was initially public. The security hardening batch (see below) immediately corrected this to tenant-scoped, which is the right model.
- No `dedupe_key` on the CSC support-ticket notification INSERT — each INSERT can fire multiple rows (one per Vivacity staff member). If the trigger fires twice (e.g., a retried INSERT), duplicate notifications will be created. This is a minor risk worth monitoring.
- The `@vivacity.com.au` domain filter hardcodes the company domain in a trigger — would need updating if the domain changes. Acceptable for now, but noted.

### 3. Security hardening batch (migration `20260508064257`)

Three distinct fixes in one migration:

**3a. Privilege escalation fix on `users_update_own` policy**

Previous policy: `FOR UPDATE USING (user_uuid = auth.uid())` with no `WITH CHECK` — any authenticated user could rewrite their own `unicorn_role`, `is_vivacity_internal`, `global_role`, `superadmin_level`, and `tenant_id` fields.

New policy adds `WITH CHECK` constraints that assert each of those five fields is `IS NOT DISTINCT FROM` its current DB value. A user can update their own profile (e.g., display name, avatar) but cannot elevate their role or change their tenant association. This is a genuine privilege escalation vulnerability that is now closed.

**3b. `support-attachments` storage lockdown**

Set `public = false` on the bucket (reverting the `023052` default). Dropped the broad authenticated-user SELECT and INSERT policies. Replaced with four tenant-scoped policies (SELECT, INSERT, UPDATE, DELETE) using `public.is_vivacity_team_safe()` OR `public.has_tenant_access_safe()` where the tenant ID is derived from `(storage.foldername(name))[1]`. This means files must be stored under a path prefixed with their numeric tenant ID — correct multi-tenant pattern.

**3c. `security_invoker = true` on two views**

`v_dashboard_tenant_portfolio` and `v_client_package_dashboard` switched to `security_invoker = true`. Both views call `app.user_can_access_tenant()` in their WHERE clauses, but as `security_definer` views they were evaluating those calls as the view owner rather than the calling user. Security invoker ensures RLS predicates run as the caller — closing the bypass.

### 4. Academy User role enum (migration `20260508070126`)

```sql
ALTER TYPE public.unicorn_role ADD VALUE IF NOT EXISTS 'Academy User';
```

Adds a new value to the `unicorn_role` enum. This is a non-reversible DDL change (PostgreSQL does not support removing enum values without a full table rebuild). The `IF NOT EXISTS` guard makes it safe to re-apply. Purpose: support a distinct role for users who access only the Academy surface — neither a full client nor Vivacity staff.

### 5. Smoke test for secondary contact RLS (migration `20260508073947`)

A self-contained DO block that:
1. Creates a synthetic `users` row and a `tenant_users` row with `role = 'child'`, `access_scope = 'full'`, `secondary_contact = true`.
2. Sets JWT claims to simulate an authenticated request as that user.
3. Calls `app.user_can_access_tenant()`.
4. Asserts the result is `true` — raises an exception if not, which would abort the migration and surface an RLS regression.
5. Cleans up both synthetic rows.

This is a migration-time regression test. If the canonical tenant-access helper ever breaks for secondary contacts with `full` access scope, this migration will block deployment. Good pattern.

### 6. Academy impersonation backend (migration `20260508092920`)

The largest single migration in this batch — `academy_impersonation_backend_v1`.

**6a. Backfill `is_vivacity_internal`**

A guarded DO block backfills `is_vivacity_internal = true` for any `global_role = 'SuperAdmin'` users where the flag is not already set. The guard asserts exactly 2 such rows exist before proceeding — if a different count is found, the migration aborts with a clear message. This prevents unintended mass-updates.

**6b. Academy RLS policy rewrite (10 tables)**

Every staff-facing academy policy was rewritten to use a consistent `USING` clause:

```sql
EXISTS (
  SELECT 1 FROM public.users u
  WHERE u.user_uuid = auth.uid()
    AND (lower(u.global_role) IN ('superadmin','admin')
         OR u.is_vivacity_internal = true)
)
```

Tables affected: `academy_assessment_attempts`, `academy_assessment_questions` (two policies — ALL for staff, SELECT for enrolled learners), `academy_assessments`, `academy_certificates`, `academy_courses`, `academy_enrollments`, `academy_lesson_progress`, `academy_lessons`, `academy_modules`, `academy_package_course_rules`.

Key change: `lower(u.global_role)` makes the check case-insensitive, removing an edge case where mixed-case role values would fail. The `is_vivacity_internal` OR-branch allows internal staff who might not carry a `SuperAdmin`/`Admin` global_role to still manage academy content.

**6c. `enrol_as_impersonator(p_course_id, p_target_user_id)`** (SECURITY DEFINER)

Allows Vivacity staff to enrol a client user in a published course on their behalf. Behaviour:
- Validates caller is staff (`lower(global_role) IN ('superadmin','admin')` OR `is_vivacity_internal = true`).
- Validates target user exists and has at least one `tenant_users` row.
- Validates course is published.
- Idempotent: if enrollment exists and is `revoked`, reactivates it; if active/completed, returns existing row.
- Sets `source = 'staff_impersonation'`, `enrolled_by = auth.uid()`.
- Resolves tenant ID from target's earliest `tenant_users` row.

**6d. `complete_enrollment_as_impersonator(p_enrollment_id, p_target_user_id)`** (SECURITY DEFINER)

Allows staff to mark a target user's enrollment as completed. Behaviour:
- Same staff-caller validation as above.
- Verifies enrollment belongs to `p_target_user_id` (mismatch check prevents cross-user access).
- Idempotent: returns existing row if already completed.
- Validates all published lessons in the course have a `completed` progress record for the target user — will not mark complete if lessons remain.
- Updates enrollment to `status = 'completed'`, `completed_at = now()`.

**Observations:**
- Both RPCs are `SECURITY DEFINER` with `SET search_path = ''` — correct.
- The `enrol_as_impersonator` `source` value is a convention, not a CHECK constraint. Future queries filtering on `source` should use `IN ('self_enrol', 'staff_impersonation')` pattern to be robust.
- `complete_enrollment_as_impersonator` does not insert `academy_lesson_progress` records — it only marks the enrollment complete if all lessons are already logged. This means staff cannot skip a learner past incomplete lessons; they must exist in the progress table. Correct safety boundary.
- The `p_target_user_id` parameter on `complete_enrollment_as_impersonator` is a double-check against the enrollment row — a caller who knows a valid `enrollment_id` for a different user cannot hijack it.

### 7. Research findings RLS (migration `20260510042726`)

Dropped existing `read_research_findings_via_job` policy and recreated it:

```sql
CREATE POLICY read_research_findings_via_job
ON public.research_findings FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.research_jobs j
    WHERE j.id = research_findings.job_id
      AND (
        public.is_vivacity_team_safe(auth.uid())
        OR public.has_tenant_access_safe(j.tenant_id, auth.uid())
      )
  )
);
```

Previous policy (not shown — inferred from the DROP) allowed broader access. New policy gates access to research findings via the parent research job's tenant ID, using the canonical helper pair. Vivacity staff can read all findings; clients can only read findings for their tenant's jobs.

### 8. Academy routes restructure (source changes, 7–9 May)

Significant refactoring of the academy routing architecture:

- **Removed**: `AcademyDashboard` page and its `/academy` route, `AcademyCourses` (old), `AcademyCertificates` (old). These were placeholder pages.
- **Added**: `AcademyCoursesListPage`, `AcademyCertificatesPage` — functionally equivalent replacements with new implementations.
- **Added**: `AcademyAccessGate.tsx` — a wrapper component that checks whether the current user has academy access before rendering academy content. Prevents direct URL access to academy content without a valid enrollment or access grant.
- **Added**: `AcademyPageWrapper.tsx` — layout wrapper for academy pages.
- **Added**: `src/pages/client/` — a full set of client-specific academy wrapper pages: `AcademyDashboardPage`, `AcademyCoursesListPage`, `AcademyCourseDetailPage`, `AcademyLessonViewerPage`, `AcademyAssessmentPlayerPage`, `AcademyAssessmentResultWrapper`, plus role-specific wrappers: `AcademyAdminAssistantWrapper`, `AcademyComplianceManagerWrapper`, `AcademyGovernancePersonWrapper`, `AcademyStudentSupportWrapper`, `AcademyTrainerWrapper`.
- **Removed**: `ClientPreviewAcademy.tsx` and its `/client-preview/academy` route — replaced by client portal routes.
- **Added**: `PostSignInRedirect.tsx` — new page at `/post-sign-in`. Routes the user to the correct landing page after authentication based on their role and access level.
- **Added**: `/client/academy` route to `CLIENT_ROUTES` — academy is now a first-class client portal destination.
- **Fixed** (`Fixed academy access gate flow`, `Fixed lesson/assessment flows`, `Fixed tenant context nesting`): Resolved several regressions during the restructure — tenant context was being double-nested in some wrapper chains, causing context override issues.

### 9. Supporting UI changes

- **Calibri font removed** (`Removed Calibri font references`, 9 May): References to `Calibri` in `src/index.css` and component styles removed. Brand typography is Anton/Binate/Calibri but Calibri is a Windows system font — embedding references caused fallback rendering issues on non-Windows devices. Removed without replacing (system sans-serif fallback now applies). Worth reviewing whether a web-safe alternative should be specified.
- **AddEvent calendar embedded** (`Embedded AddEvent calendar`, 8 May): `AcademyEvents.tsx` page now embeds an AddEvent calendar widget. This adds a third-party script dependency to the academy events surface.
- **`useVivacityTeamUsers` switched to RPC** (`Switched to staff RPC`): Client-side hook now calls `get_vivacity_team_directory()` (public, minimum-disclosure) and `get_vivacity_team_directory_staff()` (staff-gated, full PII) rather than querying the `users` table directly. Fully documented in the separate `audit-2026-05-08-staff-directory-rpc-hardening` entry (unmerged PR as at 11 May 2026).

---

## KB changes shipped

- No KB changes this session.

## Codebase observations (read-only)

- `unicorn-cms-f09c59e5` remote HEAD: `1fb3ecc3` (Fixed research findings RLS — 10 May 2026)
- Local HEAD at audit time: `d51d50b5` (Added realtime notifier)
- Remote is 249 commits ahead. User has not yet pulled.
- **Flag**: the staff-directory-rpc-hardening audit (`audit/2026-05-08-staff-directory-rpc-hardening`) has not been merged to main. Migration `20260508044515` (team directory RPCs) is shipped to production but not documented on main yet. Carl to review and merge that PR.

## Decisions

- No new ADRs drafted this session.
- `Academy User` unicorn_role enum value added without a corresponding ADR. This is a schema-level decision; worth a brief ADR if the role will carry distinct behaviour beyond the current RLS checks.

## Open questions parked

- **`support-attachments` dedupe risk**: The `fn_notify_csc_on_support_ticket` trigger has no `ON CONFLICT` guard. If `help_threads` INSERT is retried, duplicate CSC notifications will be created. Low probability in practice (Supabase transactional inserts), but worth adding a `dedupe_key` pattern consistent with `fn_tm_on_message_insert`.
- **Calibri replacement**: Removing Calibri leaves body text on system sans-serif fallback for non-Windows users. If brand consistency requires Calibri equivalence on macOS/Linux, consider adding Carlito (metrically compatible, open licence) as a web font.
- **AddEvent third-party script**: `AcademyEvents.tsx` now loads an external AddEvent widget. No CSP audit performed. If a Content Security Policy is added in future, this domain will need whitelisting.
- **`Academy User` role ADR**: The new enum value lacks a governing decision record. Currently used only in academy RLS context checks. If it expands to control other features, an ADR should be retroactively drafted.
- **Staff directory rpc-hardening PR**: Unmerged as at 11 May 2026. Carl to merge or close.
- **`/support-tickets` RBAC**: The route is gated by `ProtectedRoute` but has no role-level check in `useRBAC`. A client-role user who navigates directly to `/support-tickets` will see the staff inbox. Needs an admin-only guard added.

## Tag

`audit-2026-05-11-angela-sessions-may7-10-academy-support`
