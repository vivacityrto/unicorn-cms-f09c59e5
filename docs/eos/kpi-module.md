# EOS KPI Module — Operator Guide

This document covers what the KPI module does, who can see what, and the
moving pieces a SuperAdmin needs to know about.

## Roles & access

| Role | Where it lives | Grants |
|---|---|---|
| **SuperAdmin** | `users.unicorn_role = 'Super Admin'` (covered by `is_super_admin_safe()`) | Full read/write on every KPI surface. Signs reviews as `signoff_type = 'superadmin'`. |
| **KPI reviewer** | A row in `public.user_roles` with `role = 'kpi_reviewer'` | Can open any staff member's `/admin/kpi-review` dashboard and sign as `'reviewer'`. Currently held by **Nova Canto** only. |
| **Staff (subject)** | `users.is_vivacity_internal = true` AND `users.kpi_role IS NOT NULL` | Sees their own dashboard at `/my/kpi`. Signs their own review as `'self'`. |
| Clients / tenants | — | Intentionally excluded. The RLS policy contains no `tenant_members` clause. |

The `kpi_role` column on `public.users` (values from `dd_kpi_role`:
`csc_consultant`, `cst_assistant`, `developer`) determines which dashboard
template renders for the subject.

## Routes

- `/my/kpi` — staff member's own dashboard + self sign-off panel.
- `/admin/kpi-review` — reviewer view of a single staff member.
  Accepts `?role=<csc|cst|dev>&subject=<user_uuid>` deep links.
- `/admin/kpi-overview` — reviewer board listing every staff KPI status for
  the selected period.

## Review lifecycle

1. Subject opens `/my/kpi`. A `kpi_reviews` row is upserted for the current
   `(owner_user_id, period_type, period_start)` and the **overall status is
   auto-computed** from the worst metric (`exceeds → on_track → at_risk →
   off_track`) — never entered by hand.
2. Subject signs as `'self'` from `/my/kpi`.
3. Reviewer (Nova) opens `/admin/kpi-review?subject=…`, reviews notes, signs
   as `'reviewer'`.
4. SuperAdmin (Angela) signs as `'superadmin'`.
5. When all three sign-offs are present, `kpi_reviews.locked_at` is stamped
   and the `kpi_review_lock_guard` trigger rejects further edits to the
   underlying `kpi_email_log` / `kpi_tasks` / `kpi_tickets` /
   `kpi_ticket_comms` / `kpi_dev_milestones` rows in that window.

## Initial user setup

The role assignments are NOT auto-applied — they live in
[`kpi-role-assignments.sql`](./kpi-role-assignments.sql) for manual review by
Carl before running in the Supabase SQL Editor.

After running that script:

```sql
-- Sanity check
SELECT kpi_role, COUNT(*) FROM public.users
 WHERE is_vivacity_internal = true GROUP BY kpi_role ORDER BY kpi_role;

SELECT u.email FROM public.user_roles ur
 JOIN public.users u ON u.user_uuid = ur.user_id
WHERE ur.role = 'kpi_reviewer';
```

Expected: at least one row per `kpi_role` value used; exactly one
`kpi_reviewer` (Nova).

## Manual smoke checklist (post-deploy)

Run after the role-assignment SQL is applied:

1. Sign in as a CSC (e.g. AJ) → `/my/kpi` renders the CSC dashboard, sign-off
   panel shows one row, status badge is colour-coded.
2. Click **Sign off** as that user → row updates to "Signed", page still loads.
3. Sign in as Nova → `/admin/kpi-overview` lists every staff member with a
   `kpi_role`, each linking through to `/admin/kpi-review`.
4. Open one staff member's review → status is computed (not editable), notes
   field saves, **Sign off as reviewer** records `signoff_type = 'reviewer'`.
5. Sign in as Angela → same review now offers **Sign off as SuperAdmin**.
   After signing, `kpi_reviews.locked_at` is populated and editing any of the
   period's underlying rows is rejected by the lock guard.
6. Sign in as a tenant user → `/my/kpi`, `/admin/kpi-review`, and
   `/admin/kpi-overview` all redirect or 404 (RLS denies the underlying read).

## Troubleshooting

- **Staff member sees an empty `/my/kpi`** — their `users.kpi_role` is NULL.
  Run the relevant `UPDATE` in `kpi-role-assignments.sql`.
- **Nova can't see other staff** — `user_roles` row missing. Re-run section 4
  of the SQL file.
- **Overall status looks wrong** — it's derived by `compute_kpi_overall_status`
  from the per-metric statuses in the period view. Inspect the underlying
  `v_kpi_<role>_summary` row directly.
- **Edits rejected with "review locked"** — the period is signed off. Use a
  SuperAdmin session and clear `kpi_reviews.locked_at` only if a correction
  is genuinely required, and add a `client_notes` entry explaining why.
