## Goal

Enable `security_invoker` on the two Staff PDP views so RLS on the underlying tables is enforced against the calling user.

## Migration

```sql
ALTER VIEW public.v_pdp_cycle_summary SET (security_invoker = true);
ALTER VIEW public.v_pdp_user_currency SET (security_invoker = true);
```

## Verification

After apply, run:

```sql
SELECT c.relname, c.reloptions
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('v_pdp_cycle_summary', 'v_pdp_user_currency');
```

Expect `reloptions` to include `security_invoker=true` for both views.

## Risk

- DDL only, instant, no data change, no lock contention.
- If underlying table RLS denies rows the calling user previously saw via the view, those rows will disappear from view results — which is the intended security fix.
