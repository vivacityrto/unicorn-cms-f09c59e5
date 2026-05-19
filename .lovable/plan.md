# Restrict client-portal invites to Academy (+ Secondary)

Lock down the per-tenant invite flow so primary/secondary contacts can only invite Academy users, plus a single Secondary contact if one isn't already in place. Mirror the rule on the edge function. Vivacity-staff invite flows are untouched.

## Files

### 1. `src/components/client/users/InviteUserDialog.tsx`
- Remove the `"full"` entry from `ACCESS_OPTIONS`.
- Build the options list dynamically inside the component from `rows`:
  - Always include `academy` ("Academy only").
  - Include `secondary` only when **no** row has `relationship_role === 'secondary_contact'` in either `row_type === 'active'` or `'invited'` (compute once with `useMemo`).
- Change initial `accessLevel` state from `"full"` to `"academy"`, and the reset-on-close value to `"academy"`.
- Keep the existing submit-time `hasSecondary` guard as defence in depth (now unreachable from UI).
- Render `RadioGroup` from the dynamically built list.

### 2. `src/components/client/users/useInviteMutations.ts`
- Narrow the union: `export type InviteAccessLevel = "academy" | "secondary";`
- Remove the `full` entry from `ROLE_MAP`. No other changes.

### 3. `supabase/functions/invite-user/index.ts`
Immediately after the `isTenantAdmin` membership check (after line ~151, before the existing `CLIENT_ROLES` check at line 154), add:

```ts
if (isTenantAdmin && payload.invite_as === 'CLIENT') {
  const allowed = ['academy_user', 'secondary_contact'];
  if (!payload.relationship_role || !allowed.includes(payload.relationship_role)) {
    return jsonResponse(403, {
      ok: false,
      code: "RELATIONSHIP_ROLE_NOT_ALLOWED",
      detail: "Primary/secondary contacts can only invite Academy users or a Secondary contact.",
    });
  }
}
```

- Leave the existing `CLIENT_ROLES` check, the secondary-contact uniqueness check (lines 257-293), and all Vivacity-staff branches untouched.

## Out of scope
- No DB migrations, RLS, or triggers.
- No changes to `src/components/AdminInviteUserDialog.tsx`, `src/components/InviteUserDialog.tsx` (top-level Vivacity-staff variants), `TenantInviteDialog.tsx`, or bulk invite — they post different `relationship_role` values from Vivacity-staff sessions, which the new guard does not affect (guard is gated on `isTenantAdmin`).

## Verification
- Open client-portal invite dialog on a tenant with no secondary contact → "Academy only" (default) + "Secondary contact".
- Same dialog on a tenant with an active or pending secondary → only "Academy only".
- `supabase.functions.invoke('invite-user', { body: { ..., relationship_role: 'user' } })` as a tenant Admin → HTTP 403 `RELATIONSHIP_ROLE_NOT_ALLOWED`.
- Vivacity-staff invite flows unchanged.
