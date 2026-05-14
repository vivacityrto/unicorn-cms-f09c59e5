## Revoke client-side access to `v_workspace_audit_log`

### What
Remove `SELECT` privilege on `public.v_workspace_audit_log` from the `authenticated` role and grant it exclusively to `service_role`.

### Why
The unified audit view should only be queried server-side (edge functions, SQL editor, MCP). Frontend PostgREST access is blocked.

### Migration SQL
```sql
REVOKE SELECT ON public.v_workspace_audit_log FROM authenticated;
GRANT SELECT ON public.v_workspace_audit_log TO service_role;
```

### Verification SQL
```sql
SELECT
  has_table_privilege('authenticated', 'public.v_workspace_audit_log', 'SELECT') AS auth_select,
  has_table_privilege('service_role', 'public.v_workspace_audit_log', 'SELECT') AS service_select,
  has_table_privilege('anon', 'public.v_workspace_audit_log', 'SELECT') AS anon_select;
```

Expected results:
- `auth_select`: `false`
- `service_select`: `true`
- `anon_select`: `false`