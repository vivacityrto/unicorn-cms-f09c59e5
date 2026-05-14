# CONTRIBUTING.md Refresh — Diff Preview

Scope: **CONTRIBUTING.md only**. No other files. No DB changes.

Six surgical edits. Below is a per-site BEFORE → AFTER. Approve and I will apply with `code--line_replace`.

---

## Edit 1 — Site 6: "Audit Event Logging" (lines 333–343)

This sits inside Edge Function Development. Reframe it so contributors stop misrouting compliance writes to `audit_events`.

**BEFORE (333–343):**
```
### Audit Event Logging

```typescript
await supabase.from('audit_events').insert({
  entity: 'document',
  action: 'created',
  entity_id: documentId,
  user_id: user.id,
  details: { title: document.title },
});
```
```

**AFTER:**
```
### Application instrumentation

`audit_events` is for application telemetry only — error boundaries, edge-function failures, soft diagnostics. **Do not write compliance / business events here.** For domain audit writes, insert into the table that feeds `v_workspace_audit_log` (e.g. `client_audit_log`, `document_activity_log`, `audit_user_events`).

```typescript
// Application instrumentation only (telemetry / error capture)
await supabase.from('audit_events').insert({
  entity: 'document',
  action: 'render_failed',
  entity_id: documentId,
  user_id: user.id,
  details: { error: err.message },
});
```
```

---

## Edit 2 — Site 1: Naming Conventions table (lines 349–356)

**BEFORE:**
```
### Naming Conventions

| Element | Convention | Example |
|---------|------------|---------|
| Tables | snake_case, singular | `document_instance` |
| Columns | snake_case | `created_at`, `tenant_id` |
| Foreign Keys | `{table}_id` | `user_id`, `tenant_id` |
| Indexes | `idx_{table}_{columns}` | `idx_documents_tenant_id` |
```

**AFTER:**
```
### Naming Conventions

| Element | Convention | Example |
|---------|------------|---------|
| Tables | snake_case, **plural** | `document_instances`, `tenants`, `package_instances` |
| Columns | snake_case | `created_at`, `tenant_id` |
| Foreign Keys | `{table_singular}_id` | `tenant_id`, `package_instance_id` |
| Indexes | `idx_{table}_{columns}` | `idx_documents_tenant_id` |

> Singular table names exist only in archived `sql-setup/` bootstrap files and must not be reintroduced. The live schema is plural throughout.
```

---

## Edit 3 — Site 5 (NEW subsection, inserted after Naming Conventions, before ID Strategy)

**INSERT between current line 356 and 358:**
```
### Canonical tables (orientation)

Quick crib for the most-confused names. There is **no** `clients`, `staff`, `client_assignments`, `doc_templates`, `generated_docs`, or `audit_log` table — those are archived bootstrap-doc names.

| Concept | Live table(s) |
|---------|---------------|
| Client organisations | `tenants` (PK `bigint`; legacy uuid in `id_uuid`) |
| Staff / internal users | `profiles` + `auth.users` (linked via `auth_user_id`) |
| Client portal members | `tenant_users` (canonical) + `tenant_members` |
| Client–consultant link | `tenant_csc_assignments` |
| Package catalog | `packages` |
| Package instances (per-tenant) | `package_instances` |
| Document templates | `documents` + `document_versions` + `document_template_mappings` |
| Generated documents | `document_instances` (operational, ~105k rows) |
| Audit ledger (read) | `v_workspace_audit_log` (federated, service_role only) |
| Consultation hours | `consult_logs` (other `consult_*` tables are empty / deprecated) |
```

---

## Edit 4 — Site 2: ID Strategy (lines 358–362)

**BEFORE:**
```
### ID Strategy

- **Primary keys**: UUID via `gen_random_uuid()`
- **Never use**: Incremental IDs
- **Foreign keys**: Always explicit references
```

**AFTER:**
```
### ID Strategy

- **Primary keys (new tenanted tables)**: `bigint generated always as identity`. This matches the canonical `tenants.tenant_id` and every modern operational table (`package_instances`, `document_instances`, `tenant_users`, etc.).
- **`tenant_id` is always `bigint`.** Never `uuid`. The legacy `tenants.id_uuid` column exists for backward linkage to old rows but is **not** the canonical key — do not introduce new FKs to it.
- **Use `uuid` only when**: (a) the column links to `auth.users` — name it `user_uuid uuid references auth.users(id)`; or (b) it stores an external integration ID that is natively a UUID (e.g. M365 Graph object IDs).
- **Foreign keys**: always explicit, with `ON DELETE` behaviour stated (`CASCADE` for child rows that cannot exist without the parent, `SET NULL` for soft links, `RESTRICT` for protected references).
- **Do not create PostgreSQL `enum` types.** Use `dd_{fieldname}` lookup tables with stable string `value` keys (see project memory: database-lookup-standards).
```

---

## Edit 5 — Site 3: RLS Policy Patterns (lines 364–388)

**BEFORE:** the three SQL examples currently shown (own-data, tenant isolation via raw `tenant_users` subquery with wrong column `user_id`, super-admin EXISTS subquery).

**AFTER:**
```
### RLS Policy Patterns

Always prefer the canonical security-definer helpers over hand-rolled subqueries. They are audited, indexed, and avoid the recursive-policy traps that have bitten this codebase before.

**Canonical helpers (use these):**

| Helper | Purpose |
|--------|---------|
| `public.is_super_admin()` / `public.is_super_admin(uuid)` | Vivacity Super Admin bypass |
| `public.is_vivacity_team_user(uuid)` | Any internal Vivacity team member |
| `public.is_staff()` | Staff-role check (edge-function authorization) |
| `public.has_tenant_access(_tenant_id bigint)` | Caller has membership in this tenant |
| `public.get_current_user_tenant()` | Caller's primary tenant_id |
| `public.has_any_eos_role(uuid, bigint)` | EOS module: any role in tenant |
| `public.is_eos_admin(uuid, bigint)` | EOS module: admin role |

**Rules:**

1. Always wrap `auth.uid()` as `(select auth.uid())` inside policy `USING` / `WITH CHECK` clauses. Bare `auth.uid()` re-evaluates per row (initplan bug); the wrapped form is evaluated once. 1,143 policies were just retrofitted for this — do not regress.
2. The membership column on `tenant_users` is `user_uuid`, **not** `user_id`. If you must hand-roll a subquery, use the right column.
3. **One permissive policy per (table, command).** Never stack 3–4 SELECT policies. OR the access paths inside a single policy body.

```sql
-- Tenant isolation (preferred — uses canonical helper)
CREATE POLICY "tenant_isolation" ON some_table
  FOR ALL TO authenticated
  USING ( public.has_tenant_access(tenant_id) );

-- Super Admin (canonical helper)
CREATE POLICY "super_admin_access" ON some_table
  FOR ALL TO authenticated
  USING ( public.is_super_admin() );

-- Combined: one policy per (table, cmd), OR'd internally
CREATE POLICY "select_policy" ON some_table
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.is_vivacity_team_user( (select auth.uid()) )
    OR public.has_tenant_access(tenant_id)
  );
```
```

---

## Edit 6 — Site 4 (NEW subsection, inserted after RLS, before the trailing `---` on line 390)

**INSERT:**
```
### Function and View Hardening

1. **Functions.** Every new or replaced function MUST `SET search_path = ''` (empty string) and fully schema-qualify every reference (`public.tenants`, `auth.users`, never bare `tenants`). Follow with `REVOKE ALL ON FUNCTION ... FROM PUBLIC` and explicit `GRANT EXECUTE` to `authenticated` and/or `service_role`. This neutralises search-path injection and matches the live security baseline.

2. **Views.** Every new or replaced view MUST be created with `WITH (security_invoker = true)`. `SECURITY DEFINER` views bypass RLS and are prohibited outside the federated audit ledger (`v_workspace_audit_log`), which is service_role-only by design.

3. **One permissive policy per (table, command).** If multiple access paths apply (super-admin OR Vivacity team OR tenant member), OR them inside a single policy body — do not create three parallel SELECT policies. The planner cannot collapse them and RLS performance degrades.
```

---

## Files to change

1. `CONTRIBUTING.md` — 6 edits (4 in-place replacements, 2 new subsections inserted into Database Conventions).

## Risk

Documentation only. No runtime, no DB, no migration. Rollback = `git revert <commit>`.

## Out of scope (untouched)

`/docs/**`, `/sql-setup/**`, `README.md`, `SUPABASE_SETUP.md`, `MAILGUN_SETUP.md`, `.lovable/**`, all migrations, all DB objects.

---

**Approve to apply.**
