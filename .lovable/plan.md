## Summary
Two small UI-only fixes in client impersonation flow — no database changes.

## Fix 1 — `src/components/client/ImpersonationBanner.tsx`

- In `handleExit`, change fallback path from `"/dashboard"` to `"/manage-tenants"`.
- Add `{ replace: true }` to the `navigate(target)` call so client portal pages do not remain in the browser back stack.
- Non-staff exit path (`navigate("/")`) stays unchanged.

## Fix 2 — `src/components/client/ClientRouteGuard.tsx`

- Import `useUserAccess`.
- Derive `isVivacityStaff`.
- Insert, before the existing `!isPreview` access-scope block:
  ```
  if (!isPreview && isVivacityStaff) {
    navigate("/manage-tenants", { replace: true });
    return null;
  }
  ```
- All academy-only client logic and remaining route guards stay exactly as they are.

## Constraints
- Two files only.
- No database changes, no migrations.
- No other logic touched.