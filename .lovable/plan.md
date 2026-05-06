# Fix CSC card showing "Not yet assigned" via missing users RLS

## Findings (verified live)
- `public.users` has 3 SELECT policies: `users_select_own`, `users_select_same_tenant` (via `tenant_members`), `users_select_staff` (Vivacity staff). None grant a client user visibility of a Vivacity CSC's row, so the LEFT JOIN in `v_client_home_hero` returns NULL for name/email/avatar → UI falls back to "Not yet assigned".
- `app.user_can_access_tenant(bigint)` exists (confirmed in `pg_proc`). It is the canonical tenant-access gate used elsewhere.
- `tenant_csc_assignments.csc_user_id` references `users.user_uuid`. Policy predicate aligns.
- Existing CSC-related policies on `users` and `tenant_csc_assignments` are untouched. The new policy is additive (PERMISSIVE OR-merges with existing SELECT policies).

## Migration

```sql
CREATE POLICY users_select_assigned_csc
  ON public.users
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tenant_csc_assignments tca
      WHERE tca.csc_user_id = users.user_uuid
        AND app.user_can_access_tenant(tca.tenant_id)
    )
  );
```

## Risk assessment

| Area | Impact |
|---|---|
| Recursion | None. `tenant_csc_assignments` policies do not query `users`. `app.user_can_access_tenant` is SECURITY DEFINER and bypasses RLS. |
| Data exposure | Scoped: client sees only the `users` row of a CSC actually assigned to a tenant they can access. No general staff directory exposure. |
| Sensitive columns | `users` row is exposed in full to authorised clients. Acceptable for staff CSC identity (name/email/avatar are already shared via consultant interactions). No password hash or secret columns on `users`. |
| Existing policies | Unchanged. PERMISSIVE additive only. |
| FKs / writes / views | No change. |
| Backward compatibility | Strictly additive; no app code change. |

## Summary
- Adds one PERMISSIVE SELECT policy `users_select_assigned_csc`.
- Resolves "Not yet assigned" regression on client portal hero CSC card.
- No frontend, view, function, or schema changes.
