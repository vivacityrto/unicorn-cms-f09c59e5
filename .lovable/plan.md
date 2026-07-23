## Plan: Revoke anon EXECUTE on `user_staff_safe_fields_only_changed`

### Goal
Close the hygiene gap where `public.user_staff_safe_fields_only_changed(public.users)` is callable by the `anon` role via RPC, even though the RESTRICTIVE policy that uses it only applies to `authenticated`.

### Changes
1. Run a migration containing exactly:
   ```sql
   REVOKE ALL ON FUNCTION public.user_staff_safe_fields_only_changed(public.users) FROM anon;
   NOTIFY pgrst, 'reload schema';
   ```
2. Verify the grant is removed by querying `information_schema.routine_privileges` / `pg_proc` for `anon` on this function.

### Why
- Matches the pattern used elsewhere this session: SECURITY DEFINER functions should not be directly executable by `anon`.
- Low operational risk because the function is only invoked inside a `TO authenticated` RLS policy path.
- No application code changes are required.

### Verification
- Confirm migration applies without error.
- Confirm `anon` no longer holds `EXECUTE` (or any) privilege on the function.
