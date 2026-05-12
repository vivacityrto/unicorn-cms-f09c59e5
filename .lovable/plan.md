## Revised Migration Plan (v4)

Single migration. All PL/pgSQL uses `v_`-prefixed locals. No writes to `tenant_users.updated_at` (column does not exist). Enum cast uses `public.tenant_user_role` (the live type — `relationship_role_enum` does not exist).

### Confirmed live schema
- `tenant_users.user_id uuid`; columns include `role`, `primary_contact`, `access_scope`, `relationship_role public.tenant_user_role`.
- `tenant_members.user_id uuid`; columns include `role`, `status`, `updated_at`.
- `users.user_uuid uuid` (PK); columns include `unicorn_role` (enum, includes `Academy User`), `user_type` (`user_type_enum`), `updated_at`.

### Authoritative mapping

| relationship_role | tu.role | tu.primary_contact | tu.access_scope | u.unicorn_role | u.user_type | tm.role | tm.status |
|---|---|---|---|---|---|---|---|
| primary_contact | parent | true | full | Admin | Client Parent | Admin | active |
| secondary_contact | parent | false | full | Admin | Client Parent | Admin | active |
| user | child | false | full | User | Client Child | General User | active |
| academy_user | child | false | academy_only | Academy User | Client Child | General User | inactive |

### 1. RPC `set_relationship_role(p_tenant_id bigint, p_user_uuid uuid, p_relationship_role public.tenant_user_role, p_reason text default null)`

`SECURITY DEFINER`, `SET search_path = 'public', 'pg_temp'`.

Auth: SuperAdmin / Vivacity team OR caller is tenant admin on `p_tenant_id` (`tenant_users.user_id = auth.uid()` AND `relationship_role IN ('primary_contact','secondary_contact')` AND `access_scope = 'full'`).

Body — single transaction, all writes derived from `p_relationship_role`:
1. Capture `v_old_role` from `tenant_users` for audit.
2. `UPDATE tenant_users SET relationship_role = p_relationship_role, role = v_tu_role, primary_contact = v_tu_primary, access_scope = v_tu_access_scope WHERE tenant_id = p_tenant_id AND user_id = p_user_uuid;` (no `updated_at`).
3. `UPDATE users SET unicorn_role = v_u_unicorn_role, user_type = v_u_user_type, updated_at = now() WHERE user_uuid = p_user_uuid;`.
4. `INSERT INTO tenant_members (tenant_id, user_id, role, status) VALUES (p_tenant_id, p_user_uuid, v_tm_role, v_tm_status) ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = EXCLUDED.role, status = EXCLUDED.status, updated_at = now();`.
5. Insert `audit_eos_events` with before/after `relationship_role` and `p_reason`.

### 2. Rewrite `accept_invitation_v2`

Compute `v_relationship_role public.tenant_user_role` once (Vivacity-Team fallback preserved), then derive all dependent fields from the same value via the mapping table.

INSERT into `tenant_users` uses derived `relationship_role`, `role`, `primary_contact`, `access_scope`.

**ON CONFLICT (tenant_id, user_id) DO UPDATE** — derived together from the same final role:
```
SET relationship_role = EXCLUDED.relationship_role,
    role              = EXCLUDED.role,
    primary_contact   = EXCLUDED.primary_contact,
    access_scope      = EXCLUDED.access_scope
```
No `tenant_users.updated_at`. Never preserves an existing primary/secondary role while overwriting access_scope.

`tenant_members` upsert ON CONFLICT `(tenant_id, user_id)` mirrors `v_tm_role` / `v_tm_status` with `updated_at = now()`. `users` updated with `unicorn_role`, `user_type`, `updated_at = now()`.

### 3. Narrow drift cleanup (one-shot UPDATE via insert tool)

Single drifted row where `tu.access_scope = 'academy_only'` OR `tu.relationship_role = 'academy_user'`, AND (`tm.status = 'active'` OR `tm.role <> 'General User'`):
- `UPDATE tenant_members SET role = 'General User', status = 'inactive', updated_at = now()` joined on `(tenant_id, user_id)`.
- Insert one `audit_eos_events` row.

### Scope of this ticket

In scope (this migration):
- `set_relationship_role` RPC.
- `accept_invitation_v2` rewrite.
- Drift cleanup (1 row).

Out of scope — explicit follow-up risks tracked separately, NOT verified by this migration:
- `TenantUsersTab.applyRelationshipRole` switching to the new RPC.
- `invite-user` edge function `skip_email` branch deriving derived fields from `payload.relationship_role`.
- `useClientCommunications` academy guard.
- `has_tenant_access_safe`, bulk role downgrades, `tenant_members` deletes, support-ticket trigger changes — all unchanged.

### Verification after apply (this ticket only)
- Drift query returns 0 rows.
- Live academy_user row: `tm.role='General User'`, `tm.status='inactive'`, `tu.access_scope='academy_only'`, `u.unicorn_role='Academy User'`.
- `has_tenant_access_safe(7517, 'd695317e-…')` returns false.
- Direct RPC call to `set_relationship_role` for promotion and demotion produces consistent rows across `tenant_users`, `users`, `tenant_members`, and an `audit_eos_events` entry.
- Manual UI verification of `TenantUsersTab` dropdown / edit drawer and `invite-user skip_email` direct-add are deferred to the follow-up code ticket.
