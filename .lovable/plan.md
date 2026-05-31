## Objective
Update the `v_auth_user_state` view so that users whose `tenant_id` is null in `public.users` (e.g. ghost users created via the invite flow) still resolve a `tenant_id` by looking up `public.tenant_users`.

## Change
Replace the `tenant_id` column in the view from:

```
u.tenant_id
```

To:

```sql
COALESCE(
  u.tenant_id,
  (
    SELECT tu.tenant_id
    FROM public.tenant_users tu
    WHERE tu.user_id = u.user_uuid
    ORDER BY
      CASE tu.relationship_role
        WHEN 'primary_contact'   THEN 1
        WHEN 'secondary_contact' THEN 2
        WHEN 'user'              THEN 3
        ELSE 4
      END,
      tu.created_at DESC
    LIMIT 1
  )
) AS tenant_id
```

## Guarantees
- The subquery is `LIMIT 1`, so exactly one row per user is preserved.
- Users with `tenant_id` already set on `public.users` are completely unaffected.
- All other view columns remain unchanged.
- No RLS or grant changes needed — existing permissions stay correct.

## SQL
A `CREATE OR REPLACE VIEW` statement with the above column change.