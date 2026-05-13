## Phase 2 — Off-peak indexes (3 of 12)

Apply the three held composite indexes via the migration tool (Option A, no CONCURRENTLY).

### Migration SQL

```sql
CREATE INDEX IF NOT EXISTS idx_audit_invites_tenant_created
  ON public.audit_invites (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_restricted_actions_tenant_created
  ON public.audit_restricted_actions (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_client_audit_log_tenant_created
  ON public.client_audit_log (tenant_id, created_at DESC);
```

### Verification

After apply, query `pg_index` joined with `pg_class` for the three index names; confirm `indisvalid = true` and `indisready = true` for each.

### Outcome

Phase 2 complete: all 12 `(tenant_id, <ts> DESC)` composite indexes feeding `v_workspace_audit_log` are in place.