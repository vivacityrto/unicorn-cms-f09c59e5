## Patch plan — `src/pages/ManageTenants.tsx` only

Scope is strictly limited to this one file. No React Query migration, no schema/RLS changes, no other files touched.

### Heads-up on Problem 1 (loading state)

The current `fetchTenants()` (lines 170–422) **already** has the exact `try/catch/finally` shape requested, with `setLoading(false)` in the `finally` block (line 419–421). The only quirk is a redundant `setLoading(false)` on the early-return branch at line 178 — which is harmless because `finally` runs on early return anyway.

Action: **remove** the redundant line 178 `setLoading(false)` so the finally is the single source of truth, and keep the existing toast in `catch`. No other change to the loading flow is needed.

If you want me to leave line 178 alone, say so and I'll skip that micro-cleanup.

### Problem 2 — Error UI with Retry

Add to the state block (near line 86):
- `const [fetchError, setFetchError] = useState<string | null>(null);`
- `const [tenantsOffset, setTenantsOffset] = useState(0);` (used by Problem 4)
- `const [hasMoreTenants, setHasMoreTenants] = useState(false);` (used by Problem 4)
- `const [loadingMore, setLoadingMore] = useState(false);` (used by Problem 4)

In `fetchTenants()`:
- At the very top of `try`: `setFetchError(null);`
- In `catch`: keep the existing toast and add `setFetchError("Failed to load clients. Please try again.");`

In the render, **immediately above** the existing `if (loading)` block (line 641):
```tsx
if (fetchError) {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-4">
      <p className="text-muted-foreground">{fetchError}</p>
      <Button variant="outline" onClick={fetchTenants}>Retry</Button>
    </div>
  );
}
```
`Button` is already imported in this file.

### Problem 3 — Scoped CSC realtime refresh

Extract a new function `fetchCscAssignmentsOnly()` that runs only the two CSC queries currently at lines 237–256:
1. `tenant_csc_assignments` filtered by current `tenants.map(t => t.id)` and `is_primary = true`.
2. `users` lookup for the resulting `csc_user_id` set (`user_uuid, first_name, last_name, avatar_url, archived`).

Then merge into existing state without re-running the other 11 queries:
```ts
setTenants(prev => prev.map(t => {
  const cscUserId = cscMap[t.id] ?? null;
  const u = cscUserId ? userDataMap[cscUserId] : null;
  return {
    ...t,
    csc_user_id: cscUserId,
    csc_name: u?.name ?? null,
    csc_avatar: u?.avatar ?? null,
    csc_archived: u?.archived ?? false,
  };
}));
```
No-op early return if `tenants.length === 0`. Wrap in `try/catch` that logs but does not toast (it's a background refresh).

Update the realtime channel handler at line 473 to call `fetchCscAssignmentsOnly()` instead of `fetchTenants()`. Add `fetchCscAssignmentsOnly` and `tenants` to that `useEffect`'s dependency array (currently `[]`) — using a ref or recreating the channel on tenants change is overkill; simplest is to read `tenants` via a ref to avoid resubscribing. I'll use a `tenantsRef = useRef<Tenant[]>([])` updated in a small `useEffect`, and the realtime handler reads `tenantsRef.current` so the channel subscription itself stays mounted with `[]` deps.

### Problem 4 — Real pagination with Load more

In the tenants query at line 173, change:
```ts
.from("tenants").select("*").order("name")
```
to:
```ts
.from("tenants").select("*").order("name").range(0, 99)
```

After the successful first-page fetch, set:
- `setTenantsOffset(100);`
- `setHasMoreTenants((tenantsData?.length ?? 0) === 100);`

Add a new function `loadMoreTenants()`:
- Set `loadingMore = true`.
- `supabase.from("tenants").select("*").order("name").range(tenantsOffset, tenantsOffset + 99)`.
- For the returned page, run the same enrichment pipeline used in `fetchTenants` **scoped to the new tenant IDs only** (package_instances, packages, member counts, csc assignments, users, admin/state, primary contact, notes/structured notes, package burndown, registration end date — same 11 follow-up queries but `.in("tenant_id", newIds)`).
- `setTenants(prev => [...prev, ...newEnriched]);`
- `setTenantsOffset(o => o + 100);`
- `setHasMoreTenants((data?.length ?? 0) === 100);`
- Recompute `stats` from `[...prev, ...newEnriched]`.
- Errors → toast only, do not blank the page.

To avoid duplicating the enrichment block, I'll extract a small internal helper `enrichTenants(tenantsData)` returning `{ enriched, totals }` and call it from both `fetchTenants` and `loadMoreTenants`. This stays inside the same file and does not restructure the component.

In the render, below the tenant list (after the existing pagination/grid block, before the dialogs around line 1254), add:
```tsx
{hasMoreTenants && (
  <div className="flex justify-center pt-4">
    <Button variant="outline" onClick={loadMoreTenants} disabled={loadingMore}>
      {loadingMore ? "Loading…" : "Load more"}
    </Button>
  </div>
)}
```

Note: the existing client-side pagination (`currentPage`) and filters operate on the loaded `tenants` array, so they continue to work — they now just operate over the loaded pages. Filters/sort/search will only see loaded rows; this matches the "Load more" model and is consistent with the user's brief.

### Files changed

- `src/pages/ManageTenants.tsx` (only)

### Out of scope (will not touch)

- React Query migration
- Any other component, page, hook, or edge function
- Database schema, RLS, or new columns
