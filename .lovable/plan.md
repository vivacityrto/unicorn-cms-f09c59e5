## Revoke anon EXECUTE on `fn_tm_on_message_insert()`

### Context
Function `public.fn_tm_on_message_insert()` is `SECURITY DEFINER` and is **only** ever invoked by the AFTER INSERT trigger `trg_tm_on_message_insert` on `tenant_messages`. It is never exposed as an RPC or called directly from client code. The pre-existing `anon` EXECUTE grant is therefore unnecessary and should be removed for defense-in-depth.

### Migration
Single statement:

```sql
REVOKE EXECUTE ON FUNCTION public.fn_tm_on_message_insert() FROM anon;
```

### Confirmation checklist
- **No direct code path**: Confirmed — only the trigger calls this function.
- **Lock impact**: Negligible catalog-only change (same as prior grant migration). No off-peak window required.
- **Rollback**: `GRANT EXECUTE ON FUNCTION public.fn_tm_on_message_insert() TO anon;`

### Post-deploy verification
Verify the grant no longer exists:

```sql
SELECT grantee, privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND routine_name = 'fn_tm_on_message_insert'
  AND grantee = 'anon';
```
Expected result: zero rows.