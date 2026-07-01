## Bug Fix Plan — Two Issues

### Fix 1: Support ticket tenant routing (useSubmitSupportTicket.ts)
**Problem:** CSC, Integrator, and BGT staff cannot submit support tickets because the `isVivacityStaff` check only matches `Super Admin`, `Team Leader`, and `Team Member` roles. These roles have `tenant_id = null`, so they fall through to the client path and fail.

**Fix:** Replace the role-based ternary with the authoritative `profile.is_vivacity_internal` flag already fetched by `useAuth`.

- File: `src/components/support-tickets/useSubmitSupportTicket.ts`
- Change line 42-45 from a 3-role `unicorn_role` check to:
  ```ts
  const isVivacityStaff = profile?.is_vivacity_internal === true;
  ```
- No other changes needed. The `tenantId` derivation on line 46 stays identical.

### Fix 2: EosRocks individual tabs race condition (EosRocks.tsx)
**Problem:** `effectiveUserFilter` is computed inline as `profile?.user_uuid || 'all'`, so the `<Select value>` is briefly set to the user's UUID before `vivacityUsers` has loaded. This causes a controlled-select mismatch that can freeze tab interaction.

**Fix:** Move initialization into a `useEffect` that waits until both `profile` and `vivacityUsers` are loaded, then sets the filter only if the user's UUID exists in the options list.

- File: `src/pages/EosRocks.tsx`
- Change initial state on line 60 from `useState<string | null>(null)` to `useState<string>('all')`.
- Remove the inline `effectiveUserFilter` ternary on line 87; replace with a direct read of `userFilter`.
- Add a `useEffect` after the state declarations:
  ```ts
  useEffect(() => {
    if (userFilter === 'all' && profile?.user_uuid && vivacityUsers?.length) {
      const isMember = vivacityUsers.some(u => u.user_uuid === profile.user_uuid);
      if (isMember) setUserFilter(profile.user_uuid);
    }
  }, [profile?.user_uuid, vivacityUsers]);
  ```
- Import `useEffect` at the top of the file (line 1 currently imports only `useState, useMemo`).

### Verification
- Build passes (`vite build` or `tsc --noEmit`).
- No functional changes beyond the two targeted fixes.