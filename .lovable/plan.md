# Fix invitation role check + Vivacity routing in accept_invitation_v2

Apply both fixes as a single Supabase migration. No application code changes.

## Change 1 — Expand `user_invitations.unicorn_role` check constraint

Drop and recreate the check to permit the Vivacity internal roles (`CSC`, `Integrator`, `BGT`, `CET`) alongside existing values.

```sql
ALTER TABLE public.user_invitations
  DROP CONSTRAINT user_invitations_unicorn_role_check;

ALTER TABLE public.user_invitations
  ADD CONSTRAINT user_invitations_unicorn_role_check
  CHECK (unicorn_role = ANY (ARRAY[
    'Super Admin', 'Team Leader', 'Team Member',
    'Admin', 'User',
    'Integrator', 'BGT', 'CSC', 'CET'
  ]));
```

## Change 2 — Patch `public.accept_invitation_v2`

Re-create the function with two edits, leaving the rest of its body untouched:

1. In the `v_relationship_role` resolution block, add a branch so invitations to `tenant_id = 6372` (Vivacity internal tenant) resolve to `NULL` instead of `'user'`. This is what the frontend uses to route staff to the admin dashboard instead of the Academy portal.
2. Add an `ELSE NULL;` arm to the `CASE v_relationship_role` statement so the new `NULL` value does not raise a `CASE_NOT_FOUND`. Existing branches (`primary_contact`, `secondary_contact`, `user`, `academy_user`) stay byte-identical.

The function will keep `SECURITY DEFINER`, `search_path = ''`, and fully qualified object references per project rules.

## Technical notes

- Single migration file, executed atomically.
- Re-reading the current `accept_invitation_v2` source before the migration runs so the recreated body preserves every other line verbatim (signature, locals, audit logging, returns).
- No data backfill required: existing rows with `relationship_role = 'user'` for Vivacity staff are out of scope for this fix (handled separately if needed).
- No RLS, grant, trigger, or dependent-object changes.

## Out of scope

- `supabase/functions/invite-user/index.ts` and any other edge functions.
- Any TypeScript, React, or UI code.
- Other migrations or unrelated constraints.

## Risk

Low. Constraint widens (no existing row can violate it). Function change is additive — only the new `tenant_id = 6372` branch alters behaviour, and the `ELSE NULL` guard prevents regressions for the four existing role values.
