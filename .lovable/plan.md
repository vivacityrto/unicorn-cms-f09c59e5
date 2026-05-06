# Fix infinite recursion in `conversation_participants` RLS

## Root cause confirmed
Live policy inspection (pg_policy) confirms:
- `cp_select_member` on `conversation_participants` self-references the same table inside an `EXISTS` subquery, which re-enters the policy under RLS.
- `tm_select_participant` and `tm_insert_tenant` on `tenant_messages` both run `EXISTS … FROM conversation_participants` under RLS, which triggers `cp_select_member`, completing the recursion loop. Postgres aborts with "infinite recursion detected in policy for relation conversation_participants" → HTTP 500 on every read/write.

## Helper functions
- `is_super_admin`, `is_vivacity_team_safe`, `has_tenant_access_safe`, `is_tenant_admin` already exist in `public`. Confirmed via `pg_proc`.
- `is_conversation_participant_safe` does **not** exist — needs to be created.

## Migration (single file)

```sql
-- 1. SECURITY DEFINER helper bypasses RLS, breaking the recursion chain
CREATE OR REPLACE FUNCTION public.is_conversation_participant_safe(
  p_conversation_id uuid,
  p_user_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_participants
    WHERE conversation_id = p_conversation_id
      AND user_id = p_user_id
  );
$$;

REVOKE ALL ON FUNCTION public.is_conversation_participant_safe(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.is_conversation_participant_safe(uuid, uuid)
  TO authenticated, service_role;

-- 2. Recreate cp_select_member without self-reference
DROP POLICY IF EXISTS cp_select_member ON public.conversation_participants;
CREATE POLICY cp_select_member ON public.conversation_participants
FOR SELECT
USING (
  is_super_admin()
  OR is_vivacity_team_safe(auth.uid())
  OR user_id = auth.uid()
  OR public.is_conversation_participant_safe(conversation_id, auth.uid())
);

-- 3. Recreate tm_select_participant
DROP POLICY IF EXISTS tm_select_participant ON public.tenant_messages;
CREATE POLICY tm_select_participant ON public.tenant_messages
FOR SELECT
USING (
  is_vivacity_team_safe(auth.uid())
  OR public.is_conversation_participant_safe(conversation_id, auth.uid())
);

-- 4. Recreate tm_insert_tenant — PRESERVE existing sender_user_uuid guard
DROP POLICY IF EXISTS tm_insert_tenant ON public.tenant_messages;
CREATE POLICY tm_insert_tenant ON public.tenant_messages
FOR INSERT
WITH CHECK (
  sender_user_uuid = auth.uid()
  AND has_tenant_access_safe(tenant_id, auth.uid())
  AND public.is_conversation_participant_safe(conversation_id, auth.uid())
);
```

## Deviations from the request — flagged for confirmation

The request omitted the existing `sender_user_uuid = auth.uid()` check from `tm_insert_tenant`. The current production policy enforces it (verified in `pg_policy.polwithcheck`). Removing it would let an authenticated tenant user insert a message attributed to **another user** in the same conversation — a spoofing/audit-integrity regression that violates project rule "every material action records who performed it".

**Recommendation: keep `sender_user_uuid = auth.uid()`** (as written above). This is the only safe interpretation; the recursion fix does not require dropping it. If the user explicitly wants it removed, call it out and we revisit.

## Verification queries (post-migration)

1. `SELECT pg_get_expr(polqual, polrelid) FROM pg_policy WHERE polname IN ('cp_select_member','tm_select_participant','tm_insert_tenant');` — confirm no `conversation_participants` self-reference remains.
2. `SELECT 1 FROM public.tenant_messages LIMIT 1;` as an authenticated participant — must not error.
3. `SELECT 1 FROM public.conversation_participants LIMIT 1;` — must not error.

## Risk assessment

| Area | Impact | Notes |
|---|---|---|
| Recursion / 500s | Resolved | Helper is `SECURITY DEFINER`, does not re-enter RLS. |
| Other policies (`tm_select_staff`, `tm_insert_staff`, `tm_delete_staff`, `tm_update_participant`, `cp_insert_auth`, `cp_update_own`, `cp_delete_admin`) | Untouched | Verified via pg_policy dump. None reference the recreated policies. |
| `cp_delete_admin` | Still queries `tenant_conversations` (not `conversation_participants`) — no recursion path. | OK |
| `cp_insert_auth` | Same — references `tenant_conversations`/`tenant_users`, no loop. | OK |
| Visibility semantics | Equivalent. The new `cp_select_member` returns the same row set as the broken policy (a participant can see all participants of conversations they're in), just without recursing. | OK |
| Sender spoofing | Prevented by retaining `sender_user_uuid = auth.uid()` in `tm_insert_tenant`. | OK |
| FK constraints | Untouched. | OK |
| Function security | `SECURITY DEFINER` + fixed `search_path = public` + explicit `GRANT EXECUTE` to `authenticated`/`service_role` only. Safe pattern, matches existing `*_safe` helpers. | OK |
| Audit logging | No write paths altered; existing audit triggers/inserts unaffected. | OK |
| Backward compatibility | Function additive; policy names and semantics preserved. No client code changes required. | OK |

## Summary of changes
1. **New function**: `public.is_conversation_participant_safe(uuid, uuid)` — `SECURITY DEFINER` helper.
2. **Recreated policies** (3): `cp_select_member`, `tm_select_participant`, `tm_insert_tenant` — now call the helper instead of inlining a recursive `EXISTS`.
3. **No** other policy, table, function, FK, or app code changes.

## Benefits
- Eliminates production 500s on tenant messaging.
- Removes a latent recursion class for any future policy that joins `conversation_participants`.
- Preserves audit integrity by keeping the sender identity guard.
