

## Root cause
The Training Products multi-select shows "No scope records found" even though tenant 7532 has 2 qualifications + 4 skill sets. Console logs reveal the real failure:

```
PGRST203 — Could not choose the best candidate function between:
  public.get_tenant_scope_items(p_tenant_id => bigint, p_scope_type => text)
  public.get_tenant_scope_items(p_tenant_id => integer, p_scope_type => text)
```

Two overloads of `get_tenant_scope_items` exist in the database. PostgREST can't decide which one to call when the JS client sends a numeric arg, so the RPC returns an error, `useTenantRtoScope` returns `[]`, and `ScopeMultiSelect` falls through to the empty-state text input.

This is also breaking every other surface that calls this RPC (Audits dashboard, RTO Profile scope tab, etc).

## Fix

**Single migration**: drop the legacy `integer` overload, keeping the canonical `bigint` version (per `tenant-id-standard` — `tenant_id bigint` is canonical, integer overloads are legacy).

```sql
DROP FUNCTION IF EXISTS public.get_tenant_scope_items(integer, text);
```

That's it. No frontend changes needed — `ScopeMultiSelect`, `useTenantRtoScope`, and `NewAuditModal` are all wired correctly. Once the ambiguous overload is removed, PostgREST resolves to the bigint version, the hook returns the 6 scope items for tenant 7532, and the modal renders the grouped multi-select as designed.

## Verification after fix
- Open New Audit on `/tenant/7532` → Step 2
- Training Products field should show the searchable combobox
- Dropdown should list: Qualifications (2) and Skill Sets (4)
- Empty-state text input should NOT appear

## Files changed
- New migration: drop legacy `get_tenant_scope_items(integer, text)` overload

