## Bug Fix: Allow `relationship_role = 'user'` + `access_scope = 'full'` to access Client Portal

### Problem
`src/contexts/ClientTenantContext.tsx` line 215 gates `canAccessClientPortal` on `fullScope && isContact`. Since `isContact` only matches `primary_contact`/`secondary_contact`, the `'user'` role is locked out even with full access scope. 10 live users across 9 tenants are currently affected.

### Fix (1 line of production code + 1 test update)

**`src/contexts/ClientTenantContext.tsx`** — line 215 only:
```ts
canAccessClientPortal: fullScope && (isContact || tenantUser.relationship_role === 'user'),
```
Line 216 (`canManagePortalUsers`) and line 217 (`isAcademyOnly`) remain untouched.

**`src/contexts/__tests__/ClientTenantContext.test.tsx`** — update the `"user + full scope"` test:
- `canAccessClientPortal` → `true` (was `false`)
- `canManagePortalUsers` → `false` (unchanged)
- `isAcademyOnly` → `false` (unchanged)

All 7 other tests stay identical and must keep passing.

### Deep-dive verification

**Gating semantics after fix:**

| relationship_role | access_scope   | portal | manage users | academy-only |
|-------------------|----------------|--------|--------------|--------------|
| primary_contact   | full           | ✅     | ✅           | ❌           |
| secondary_contact | full           | ✅     | ✅           | ❌           |
| user              | full           | ✅ (new) | ❌         | ❌           |
| academy_user      | academy_only   | ❌     | ❌           | ✅           |
| null              | full           | ❌     | ❌           | ❌           |
| any               | (other/null)   | ❌     | ❌           | ❌           |

**Downstream consumers of `canAccessClientPortal` / `canManagePortalUsers`:**
- `ClientRouteGuard.tsx` — uses `canAccessClientPortal` to gate non-academy `/client/*` routes, and `canManagePortalUsers` to gate `/client/users`. After fix: `'user'`-role caller reaches `/client/home`, but `/client/users` still redirects them away. ✅
- `ClientUsersPage.tsx` — invite/manage buttons gated on `canManagePortalUsers`. Unchanged. ✅
- `ClientSidebar.tsx`, `ClientTasksPage.tsx`, `StaffPdpsPage.tsx`, `useClientNotifications.tsx`, `useClientCommunications.ts`, academy routing — none consume these flags in a way that grants management rights. ✅
- `useUserAccess.ts` — independent path; only looks at `access_scope`, not `relationship_role`. Unaffected. ✅
- `AcademyOnlyFallback` — only triggered when `isAcademyOnly` true or no portal access on non-academy path. `'user'+full` no longer hits fallback. ✅

**Database / RLS:** No schema change. RLS policies key off `tenant_users` membership and `has_role()`, not off `relationship_role`. A `'user'+full` member already passes RLS for tenant data reads — the bug was purely a client-side UI gate hiding data they were entitled to see.

**Audit trail:** No writes added, no audit-logged action changed. Login/access events continue to flow through existing auth telemetry. No backfill needed.

**Backward compatibility:** Strictly additive — no caller loses access, no role gains management rights. Primary/secondary contact UX unchanged.

**Edge cases checked:**
- Staff impersonation (`isPreview`) bypasses this gate entirely in `ClientRouteGuard` → unaffected.
- `tenantUser === null` (loading / no membership) → still returns all false.
- `relationship_role = null` defensive case → still false (matches existing test).
- `access_scope = 'academy_only'` with `role = 'user'` → `fullScope` false, still blocked from portal, `isAcademyOnly` still false (only `academy_user`+`academy_only` flips academy fallback). Matches current behaviour.
- Multi-tenant membership: gate is per active tenant, so a user can be `'user'+full` in tenant A and `academy_user` in tenant B with correct per-tenant behaviour.

### Test plan
1. `bunx vitest run src/contexts/__tests__/ClientTenantContext.test.tsx` — 8 tests, all green.
2. Manual smoke (post-deploy): one of the 10 affected accounts loads `/client/home` successfully and does NOT see Users management entry.
3. Confirm a `primary_contact` account still sees and can use `/client/users`.

### Risk assessment
- **Severity:** Low. Single-line conditional widening on a client-side gate.
- **Blast radius:** Only `canAccessClientPortal`. Management/invite/academy/RLS paths untouched.
- **Rollback:** Revert the one-line change; no migration to undo.
- **Security:** No privilege escalation — `'user'+full` was always entitled to portal data per RLS; this restores intended access without granting any admin capability.

### Summary
- **Changes:** 1 line in `ClientTenantContext.tsx`, 1 assertion in its test file.
- **Benefits:** Unblocks 10 live users; aligns UI gate with `access_scope` semantics and `RELATIONSHIP_ROLE_OPTIONS` (where `'user'` is documented as "Standard team member. Full access to their organisation.").
- **Risk:** Very low; no schema, RLS, audit, or management-rights impact.