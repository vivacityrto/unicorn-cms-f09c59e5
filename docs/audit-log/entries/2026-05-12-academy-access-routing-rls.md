# Audit: 2026-05-12 - academy access routing rls

**Trigger:** ad-hoc - session surfaced two Academy access bugs during SuperAdmin and Academy-only user QA
**Scope:** SuperAdmin Academy navigation visibility and Academy-only tenant read access. No enrolment logic, tenant toggle logic, or frontend gate behaviour changed.
**Session owner:** Khian (Brian)
**Supabase project:** `yxkgdalkbrriasiyyrwk` - Unicorn 2.0-dev

---

## Findings

- SuperAdmin Academy admin routes existed but were not exposed in the sidebar. `DashboardLayout` only linked Academy Builder and Package -> Course Rules, leaving Tenant Access, Enrolments, and Certificates discoverable only by direct URL.
- Academy-only users on enabled Academy tenants still saw the inactive Academy screen. Root cause: `ClientTenantContext` reads `public.tenants.academy_access_enabled`, but the existing tenants SELECT policy used `app.user_can_access_tenant(id)`, whose non-staff branch requires `tenant_users.access_scope = 'full'`.
- The Academy-only fix needed a narrow tenants SELECT policy, not a frontend workaround. Changing `app.user_can_access_tenant` was rejected because that helper is reused by other tenant-scoped policies.
- Live read-only diagnostic found 1 `academy_only` membership on an Academy-enabled tenant at investigation time, matching the user-visible failure mode.
- Pulling latest codebase also surfaced two unrelated migrations between the navigation commit and the Academy policy commit: `users_update_own` recreation and `audit_user_events` creation / `is_vivacity_team_safe` replacement. They were not part of this Academy bug audit.

## DB changes shipped

- `unicorn-cms-f09c59e5 @ 9621248c` added migration `20260512040732_ad041a67-7d11-45c7-8cd1-73f9c743aeb9.sql`.
- Migration drops/recreates `tenants_select_academy_only_users` on `public.tenants`.
- Policy is `FOR SELECT TO authenticated` only, guarded by:
  - `academy_access_enabled = true`
  - matching `public.tenant_users` row for `auth.uid()`
  - `tenant_users.access_scope = 'academy_only'`
- Live DB verification confirmed the policy exists as SELECT-only with no `WITH CHECK`.
- Live write-policy spot check confirmed `public.tenants` writes remain limited to SuperAdmin/Vivacity-team policies, and `public.tenant_users` writes remain controlled by tenant-parent/SuperAdmin policies.

## KB changes shipped

- No KB changes shipped.
- Session referenced `unicorn-kb @ 00b6fa8`.

## Codebase observations (read-only)

- `unicorn-cms-f09c59e5 @ e1b7d5a8` added SuperAdmin sidebar links for Tenant Access, Enrolments, and Certificates under the Academy section.
- `unicorn-cms-f09c59e5 @ 9621248c` added the Academy-only tenant SELECT policy migration.
- `DashboardLayout` still renders the Academy admin sidebar section only for SuperAdmins.
- Protected routes for `/superadmin/academy/tenant-access`, `/superadmin/academy/enrollments`, and `/superadmin/academy/certificates` already existed before the sidebar fix.

## Decisions

- Accepted a tenants-table SELECT-only RLS policy instead of changing `app.user_can_access_tenant`.
- Accepted that Academy-only users may read their own enabled tenant row only to let Academy confirm access.
- Explicitly preserved disabled-tenant behaviour: Academy-only users on disabled tenants should still see the inactive Academy screen.
- No edit permissions were granted to Academy-only users.

## Open questions parked

- Browser verification as the affected Academy-only user was not performed in this audit session; code and live policy verification passed.
- The unrelated `audit_user_events` and `users_update_own` migrations pulled in the same fast-forward were not audited here beyond noting their presence.
- KB may need a short note in a future codebase-state or guardrails doc: Academy access depends on both `tenants.academy_access_enabled` and a readable tenant row for Academy-only users.

## Tag

`audit-2026-05-12-academy-access-routing-rls`
