# Audit: 2026-05-11 — pdp-views-security-invoker-fix

**Trigger:** ad-hoc — security gap discovered during routine scan of newly shipped Staff PDPs feature
**Author:** Khian (Brian)
**Scope:** `v_pdp_user_currency` and `v_pdp_cycle_summary` views in the public schema. No code changes; migration only.

---

## Findings

- **Security gap confirmed:** `v_pdp_user_currency` and `v_pdp_cycle_summary` were created without `security_invoker = true`. Both views ran as the database owner, bypassing RLS on all four underlying tables (`pdp_cycles`, `pdp_evidence_items`, `pdp_goals`, `pdp_reflections`). Any authenticated user querying `v_pdp_user_currency` would receive PDP data across all tenants, not just their own.
- **Client-side filter was the only protection:** `StaffPdpsPage.tsx` filtered results by `activeTenantId` after fetching, but this is bypassable by anyone querying the database directly or inspecting network traffic.
- **Underlying table RLS verified as correct and complete** for the two primary audiences (Vivacity staff and tenant admins/owners). All four tables have `relrowsecurity = true` with consistent policies. Fix was therefore safe to apply immediately.
- **Manager policy gap noted (not fixed here):** `pdp_evidence_items`, `pdp_goals`, and `pdp_reflections` have no SELECT policy for managers. Managers can see `pdp_cycles` assigned to them but would see zero hours/evidence/goals in the summary view. Does not affect the Staff PDPs page (which gates on `canManagePortalUsers`, not manager role). Flagged to Angela for awareness — relevant if a manager-facing PDP dashboard is built in future.
- **Migration applied:** `security_invoker = true` set on both views via migration `20260511070000_e0757285-3611-4a01-8a30-eba3219f03ab`. Verified in DB post-apply — both views confirmed `reloptions: security_invoker=true`.

## KB changes shipped

- No KB changes this session.

## Codebase observations (read-only)

- Migration landed in `unicorn-cms-f09c59e5` at commit `2ac73d59` — "Enabled security invoker on both"
- Migration file: `supabase/migrations/20260511070000_e0757285-3611-4a01-8a30-eba3219f03ab.sql`

## Decisions

- No ADRs drafted. `security_invoker = true` is the established pattern in this codebase (see `v_dashboard_tenant_portfolio` and `v_client_package_dashboard` — same fix applied in Angela's security hardening batch, 8 May 2026, migration `20260508064257`).
- Manager policy gap parked pending Angela confirmation on whether a manager-facing PDP view is planned.

## Tag

`audit-2026-05-11-pdp-views-security-invoker-fix`
