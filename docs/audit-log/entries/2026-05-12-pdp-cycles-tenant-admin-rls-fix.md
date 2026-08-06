# Audit: 2026-05-12 — pdp-cycles-tenant-admin-rls-fix

**Trigger:** drift-surfaced — discovered during browser verification of
`/client/staff-pdps` for tenant admin user `diamondhood14@gmail.com`. Page
rendered an infinite skeleton; console showed no errors.  
**Scope:** Single SELECT RLS policy on `public.pdp_cycles`. No other tables,
functions, triggers, or code changes.  
**Session owner:** Angela Connell-Richards  
**Lead dev:** Carl  
**Supabase project:** `yxkgdalkbrriasiyyrwk` — Unicorn 2.0-dev (ap-southeast-2)

---

## Findings

- `pdp_cycles: tenant admins view their tenant` policy USING clause checked
  `tu.role = ANY (ARRAY['admin','owner'])`. A live query of `tenant_users`
  confirmed zero rows carry either value. The only live values in
  `tenant_users.role` are `'parent'` (69 rows) and `'child'` (387 rows).
  The policy has **never fired for any user** since it was created.

- Broader schema investigation surfaced the platform's actual four-layer
  RBAC model (see Decisions section). The mismatch arose because the
  original policy was written assuming `tenant_users.role` would mirror
  `'admin'`/`'owner'` conventions from another layer (`public.users`
  `user_type`), but that mapping was never applied to `tenant_users`.

- 441 `tenant_users` rows have `access_scope = 'full'` AND
  (`primary_contact = true` OR `secondary_contact = true`). These are the
  users the frontend's `canManagePortalUsers` (from `ClientTenantContext.tsx`)
  already treats as tenant admins. The corrected policy aligns DB access
  with that frontend definition.

- No other `pdp_cycles` policies were affected. The five remaining policies
  (Vivacity staff ALL, manager SELECT, users SELECT own, INSERT, UPDATE)
  are correct and unmodified.

## RBAC schema map (established during investigation)

Four user-related tables resolved during this session:

| Table | Auth link | Role signal |
|-------|-----------|-------------|
| `auth.users` | — (root) | Session UUID (`auth.uid()`) |
| `public.users` | `user_uuid` (uuid) | `is_vivacity_internal`, `global_role`, `user_type`, `unicorn_role` |
| `public.tenant_users` | `user_id` (uuid) | `role` ('parent'/'child'), `access_scope`, `primary_contact`, `secondary_contact` |
| `public.profiles` | `user_id` (uuid) | Thin; `global_role` populated for 1 user only |

Vivacity staff are gated by `users.is_vivacity_internal = true` (not any
`profiles` or `tenant_users` column). Tenant admin access is gated by
`tenant_users.access_scope = 'full'` AND contact flag — not by
`tenant_users.role`.

## DB change shipped

Migration `fix_pdp_cycles_tenant_admin_rls` applied to `yxkgdalkbrriasiyyrwk`
on 12 May 2026 via Lovable. Single transaction; no data changes.

**Dropped:**
```sql
-- policy: "pdp_cycles: tenant admins view their tenant" (old USING)
tu.role = ANY (ARRAY['admin'::text, 'owner'::text])
```

**Created (replacement — same name, FOR SELECT, TO authenticated, permissive):**
```sql
CREATE POLICY "pdp_cycles: tenant admins view their tenant"
  ON public.pdp_cycles
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tenant_users tu
      WHERE tu.user_id = auth.uid()
        AND tu.tenant_id = pdp_cycles.tenant_id
        AND tu.access_scope = 'full'
        AND (tu.primary_contact = true OR tu.secondary_contact = true)
    )
  );
```

Policy count on `pdp_cycles`: unchanged at 6.

**Rollback:** drop new policy; recreate with `tu.role = ANY
(ARRAY['admin','owner'])`. Net-zero data impact; safe to run at any time.

**Post-deploy verification (all passed):**
- New USING expression matches spec ✅
- Total policy count on `pdp_cycles` = 6 ✅
- Other 5 policies unchanged ✅
- Old `role = ANY(ARRAY['admin','owner'])` expression absent ✅

## KB changes shipped

None — RBAC schema map above is the KB-worthy finding. Recommend adding to
`unicorn-kb/codebase-state/` in a follow-up KB session.

## Codebase observations (read-only)

- `ClientSidebar.tsx` — `Staff PDPs` nav item missing from
  `clientMenuItemsAfter`. Lovable prompt drafted this session to add it with
  `adminOnly: true` flag (uses existing `filterAdmin()` / `canManagePortalUsers`
  gate). Not yet applied — pending user confirmation.
- `StaffPdpsPage.tsx` / `StaffPdpsWrapper.tsx` — route registered in
  `App.tsx` and page components confirmed present. No code changes required.

## Decisions

- Corrected USING clause uses `canManagePortalUsers` logic
  (`access_scope = 'full'` AND `primary_contact` or `secondary_contact`)
  rather than simpler `role = 'parent'`, to stay aligned with the frontend
  definition and remain defensive against future `role` value changes.
  Accepted.
- `tenant_users.role` values (`'parent'`/`'child'`) not renamed or migrated
  in this session — out of scope. Documented as a naming inconsistency for
  future consideration.

## Open questions parked

- **`tenant_users.role` naming** — `'parent'`/`'child'` don't map intuitively
  to admin/member semantics. A rename migration (`'parent'` → `'admin'`,
  `'child'` → `'member'`) would improve readability of all future RLS
  policies. Low urgency; worth an ADR.
- **Other tables using `role IN ('admin','owner')`** — the same dead
  predicate may exist on other tables. A cross-table audit of RLS policies
  referencing `tenant_users.role` is recommended before the next PDP or
  multi-tenant feature.
- **ClientSidebar Staff PDPs nav item** — Lovable prompt drafted, not yet
  applied. Separate UI-only change; no migration required.

## Tag

`audit-2026-05-12-pdp-cycles-tenant-admin-rls-fix`
