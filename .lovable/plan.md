**Scope:** `src/pages/admin/BulkMembershipCertificatesPage.tsx` only.

**Problem:** The redirect guard fires before the auth profile has finished loading, causing CSC users to be incorrectly redirected.

**Root cause:** The `useEffect` guard uses `loading` (tenant data fetch state) instead of the auth loading state.

**Fix:**
1. Destructure `loading: authLoading` from `useAuth()`.
2. Swap `!loading` for `!authLoading` in the redirect `useEffect` condition and dependency array.
3. Leave the tenant-fetch `loading` variable unchanged.

No other files touched.