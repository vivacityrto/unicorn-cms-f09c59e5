## Change 1 — `supabase/functions/invite-user/index.ts` (line 144-151)

Update the VIVACITY-invite gate so Integrators are also allowed:

```ts
if (
  payload.invite_as === 'VIVACITY' &&
  !canManageVivacityUsers &&
  callerProfile.unicorn_role !== 'Integrator'
) {
  return jsonResponse(403, { ok: false, code: "FORBIDDEN",
    detail: "Only Super Admin or Integrator can invite Vivacity team members" });
}
```

No other edits to this file.

## Change 2 — `src/components/DashboardLayout.tsx`

The Administration section is rendered at line 518 gated by `(isSuperAdmin || isTeamLeader)`. Add `isIntegrator`:

```tsx
{(isSuperAdmin || isTeamLeader || isIntegrator) &&
  renderSection("administration", "Administration", filteredAdminItems, "administration")}
```

`isIntegrator` is already used elsewhere in the file (e.g. line 527), so no new imports needed. `filteredAdminItems` already strips `superAdminOnly` items for non-SA, so Integrator will only see the non-SA-only entries — matching the request to add visibility without altering other tab permissions.

## Change 3 — `src/components/ProtectedRoute.tsx`

The `profile` object loaded by `useAuth` does not currently include the `disabled` column. To keep the change isolated to `ProtectedRoute.tsx` (per "do not touch any other files"), fetch `disabled` locally inside `ProtectedRoute`:

1. Add a `useEffect` that, when `user?.id` is set, runs `supabase.from('users').select('disabled').eq('user_uuid', user.id).maybeSingle()` and stores `{ disabled, loaded }` in component state.
2. Loading gate: while `loading`, `!profile`, or the disabled-check has not loaded, render the existing "Loading..." screen — never flash the disabled screen.
3. Once loaded, if `disabled === true`, render a full-screen centred card using existing shadcn primitives (`Card`, `CardHeader`, `CardTitle`, `CardContent`, `Button`) with:
   - Heading: **Account Disabled**
   - Body: *Your account has been disabled. You are no longer part of the Vivacity internal team. Please contact your administrator.*
   - Single **Sign Out** button → `await supabase.auth.signOut()` then `navigate('/login', { replace: true })`.
4. This block is placed immediately after the existing `!profile` loading gate and before any routing/role checks, so disabled users never reach Academy, EOS, admin, or client routes.

Imports added to this file only: `useEffect`, `useState`, `supabase` client, `useNavigate`, shadcn `Card`/`Button` components.

No other files touched.
