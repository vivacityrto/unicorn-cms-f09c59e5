# Audit: 2026-06-23 — kpi-module

**Trigger:** Lovable production DB change session — new feature build
**Scope:** Full KPI Module implementation across 7 phases. Covers all new database objects, edge function, UI, role assignments, and manual data seeding. Lovable final verification prompt is pending (to be appended when received).

---

## Findings

- Phase 1: 10 `dd_kpi_*` lookup tables created and seeded (9 planned + `dd_kpi_email_type` added during implementation). `users.kpi_role TEXT NULL` added with validated FK. `tenants.churned_at TIMESTAMPTZ NULL` added. `fn_audit_users()` extended to capture `kpi_role` changes. `is_kpi_reviewer_safe(uuid)` helper created (SECURITY DEFINER, `SET search_path = ''`, queries `user_roles.user_uuid` with `expires_at` honoured).
- Phase 1 surfaced that `user_roles.role` has a FK to `dd_unicorn_roles` — `kpi_reviewer` had to be seeded into `dd_unicorn_roles` before Nova's reviewer row could be inserted. Lovable-generated SQL used `user_id` column but actual column is `user_uuid` — caught and corrected before execution.
- Phase 2: 7 core KPI tables created with RLS, GRANTs, FK constraints, and `updated_at` triggers: `kpi_email_log`, `kpi_tasks`, `kpi_tickets` (with auto-generated `ticket_number`), `kpi_ticket_comms`, `kpi_dev_milestones`, `kpi_reviews`, `kpi_review_signoffs`. RLS pattern on every table: `is_super_admin_safe OR is_kpi_reviewer_safe OR (is_vivacity_team_safe AND owner_user_id = auth.uid())`. No client/tenant access by design.
- Phase 3: `OutlookInboxBrowser.tsx` extended with optional `folder` prop (defaults `'inbox'` — existing Linked Emails feature requires zero changes). New `kpi-email-log-sync` edge function (JWT-validated, staff-only, reuses caller's own `oauth_tokens`). New `useKpiEmailLog` hook. On-demand read strategy — Sent Items queried only when KPI dashboard opens, not background-synced. Email type classification (`client_message` vs `general_email`) by sender/recipient domain.
- Phase 4: Three SECURITY INVOKER views created (`v_kpi_csc_summary`, `v_kpi_cst_summary`, `v_kpi_dev_summary`). Routes `/my/kpi` (staff) and `/admin/kpi-review` (reviewer/SuperAdmin). Shared `KpiDashboard` component + `KpiStaffSelector` for reviewer navigation. `useKpiAccess` hook exposes `isReviewer / isSuperAdmin / canViewAnyStaff`. Stage Health query corrected to use `DISTINCT ON (tenant_id)` with `snapshot_date <= period_end` to handle missed snapshots.
- Phase 5: `compute_kpi_overall_status()` function (SECURITY DEFINER) aggregates views and returns one of `exceeds / on_track / at_risk / off_track`. `upsert_kpi_review()` always computes status server-side — never accepts from caller. Three-party sign-off: `self`, `reviewer`, `superadmin`. Lock guard trigger prevents edits to KPI rows after `kpi_reviews.locked_at` is set. Every sign-off writes to `audit_events`. Self sign-off surfaced via `MyKpiSignOffSection` on `/my/kpi`.
- Phase 6: Reviewer overview board at `/admin/kpi-overview` — all staff KPI statuses, review state, sign-off count, deep-link into reviewer page.
- Phase 7: Seeds, docs (`docs/eos/kpi-module.md`), role assignment SQL generated. Executed manually via Supabase MCP (not migration) after correcting `user_id` → `user_uuid` column name and seeding `kpi_reviewer` into `dd_unicorn_roles`.
- Role assignment confirmed (11 users): Angela, Kelly, Nova+csc, Samantha, Sharwari, Tanya → `csc_consultant`; AJ Delostrico, Ezel Olores → `cst_assistant`; Carl, Khian, Rhald → `developer`. Nova Canto (nova@vivacity.com.au) → `user_roles` row with `role = 'kpi_reviewer'`. Angela excluded from `kpi_reviewer` row (covered by `is_super_admin_safe`).
- No existing RLS policies, FK semantics, OAuth scopes, Linked Emails feature, or ClickUp integration were modified across any phase.
- 1,016 linter warnings present at completion — all pre-existing project-wide issues (legacy SECURITY DEFINER views and tables without RLS). None introduced by this implementation.

---

## KB changes shipped

- unicorn-kb @ c059370: `codebase-state/kpi-module.md` — KPI module implementation plan (created at session start, status updated at session end)

---

## Codebase observations

- unicorn @ f0669ed9: HEAD at time of implementation. Lovable authored all codebase commits across Phases 1–7 via plan-mode prompts. This audit covers the full session.

---

## Decisions

Nine design decisions locked during audit gate (pre-Phase 1):

| # | Decision | Choice |
|---|---|---|
| 1 | Sent Items strategy | On-demand read; cache into `kpi_email_log` |
| 2 | Review cadence | Configurable per role via `dd_kpi_period_type` |
| 3 | Churn representation | New `churned_at TIMESTAMPTZ NULL` on `public.tenants` |
| 4 | Cross-staff KPI access | `user_roles` row with `role = 'kpi_reviewer'` |
| 5 | Sign-off model | Generic `{reviewer_user_id, signoff_type}` rows (self / reviewer / superadmin) |
| 6 | Email SLA definition | First message in same Outlook `conversationId` from staff to original sender |
| 7 | CSC retention anchor | Active at `period_start` AND not churned by `period_end` |
| 8 | Developer tickets | `kpi_tickets` primary table (in-Unicorn). ClickUp untouched. |
| 9 | Stage Health KPI | Point-in-time at `period_end`. `healthy→green`, `monitoring→amber`, `at_risk+critical→red` |

Five corrections applied after Lovable's initial plan review:
1. `kpi_email_log.email_type` added (enables CST SLA 1 vs SLA 2 split)
2. `kpi_tasks.assigned_by` added
3. Stage Health query corrected to latest snapshot ≤ period_end
4. Angela excluded from `kpi_reviewer` row
5. `kpi_dev_milestones` moved into Phase 2

---

## Post-verification corrections (applied via Supabase MCP after Lovable sign-off)

Lovable's implementation used `user_roles` to grant Nova reviewer access, requiring `kpi_reviewer` to be added to `dd_unicorn_roles`. This was incorrect — all KPI role checks should go through `dd_kpi_role` and `users.kpi_role`. Three corrections applied:

1. `is_kpi_reviewer_safe()` rewritten via `apply_migration` to check `users.kpi_role = 'reviewer'` instead of `user_roles`. Migration: `fix_is_kpi_reviewer_safe_use_kpi_role`.
2. `reviewer` seeded into `dd_kpi_role` (was missing from Phase 1 seed).
3. Nova's `users.kpi_role` set to `'reviewer'`. Nova's `user_roles` row deleted. `kpi_reviewer` removed from `dd_unicorn_roles`.

Lovable also added three undocumented nullable columns to `public.users`: `kpi_role_started_at`, `kpi_pod`, `kpi_notes`. All nullable, no blast radius.

`docs/eos/kpi-role-assignments.sql` is now superseded — all role assignments were applied via Supabase MCP this session, including the corrected Nova reviewer approach. The file should not be run.

---

## Lovable Final Verification Summary (received 23 June 2026)

**Total DB surface added:** 10 lookups + 7 entity tables + 3 views + 2 RPCs + 1 helper + 5 column additions. Zero existing tables had columns dropped, retyped, or had their RLS policies modified.

**DB objects per phase:**
- Phase 1 (20260623055418): 10 `dd_kpi_*` lookup tables, 4 nullable columns on `public.users` (`kpi_role`, `kpi_role_started_at`, `kpi_pod`, `kpi_notes`), `churned_at` on `public.tenants`, `fn_audit_users()` extended, `is_kpi_reviewer_safe()` created.
- Phase 2 (20260623055900): `kpi_email_log`, `kpi_tasks`, `kpi_tickets`, `kpi_ticket_comms`, `kpi_reviews`, `kpi_review_signoffs`, `kpi_dev_milestones`.
- Phase 3 (20260623062826): `v_kpi_csc_summary`, `v_kpi_cst_summary`, `v_kpi_dev_summary` — all `security_invoker = true`.
- Phase 5 (20260623063841): `compute_kpi_overall_status()` and `upsert_kpi_review()` RPCs.
- Phase 6: No DB changes (read-only board).
- Phase 7: Role assignments applied manually via Supabase MCP (not via migration).

**Explicitly left untouched:** Linked Emails subsystem, ClickUp integration, `capture-outlook-email` edge function, all existing RLS policies, all existing FKs, `auth.*`, `storage.*`, `realtime.*`.

**Self-contained:** No cron jobs, no pg_cron schedules, no edge-function timers added. No external secrets required. No background sync.

---

## Open questions parked

- History view of past reviews deferred — data is in `kpi_reviews`, surfaceable as a quick follow-up.
- Email digest automation (weekly KPI summary to staff + reviewers) deferred as a separate feature.
- `docs/eos/kpi-role-assignments.sql` should be deleted or marked obsolete in a follow-up Lovable prompt — it references the superseded `user_roles` approach.

---

## Tag

audit-2026-06-23-kpi-module
