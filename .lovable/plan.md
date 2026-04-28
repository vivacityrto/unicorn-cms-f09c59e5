# Migrate ManageTenants to React Query

Replace the monolithic `fetchTenants()` waterfall in `src/pages/ManageTenants.tsx` with five dedicated `useQuery` hooks. The QueryClient already exists in `src/App.tsx` and stays untouched. Phase 1 manual patterns (`fetchError`, `fetchCscAssignmentsOnly`, `loadingMore`, manual `setLoading`) are deleted in favour of React Query equivalents.

## New hook files

All hooks use the singleton `supabase` client from `@/integrations/supabase/client` and the `[domain, subentity, ...args]` query-key convention.

### 1. `src/hooks/useTenantsBasic.ts`

- Param: `{ page: number; pageSize?: number }` (default pageSize 100).
- Query key: `['tenants', 'basic', page, pageSize]`.
- Fetches `tenants.select('*').order('name').range(from, to)`.
- Returns `{ data, isLoading, isError, error, refetch }` plus a derived `hasMore` (true when returned rows === pageSize).
- `staleTime: 5 * 60 * 1000`, `placeholderData: keepPreviousData` so paging doesn't blank the list.

### 2. `src/hooks/useTenantPackages.ts`

- Param: `tenantIds: number[]`.
- Query key: `['tenants', 'packages', tenantIds]`.
- `enabled: tenantIds.length > 0`.
- Internally runs the existing 3-call sequence: `package_instances` (open) → `packages` lookup → `v_package_burndown` for active instances. Returns a normalised map keyed by `tenant_id` containing: `all_packages`, `next_renewal_date`, `hours_used_minutes`, `hours_included_minutes`.
- `staleTime: 3 * 60 * 1000`.

### 3. `src/hooks/useTenantContacts.ts`

- Param: `tenantIds: number[]`.
- Query key: `['tenants', 'contacts', tenantIds]`.
- `enabled: tenantIds.length > 0`.
- Runs `tenant_users` (`primary_contact = true`) → `users` for those uuids and also `tenant_users` raw count for `member_count` plus the admin `users` + `dd_states` lookup (currently in `enrichTenants`). Returns a per-tenant map: `{ primary_contact_name, member_count, state }`.
- `staleTime: 5 * 60 * 1000`.

### 4. `src/hooks/useCscAssignments.ts`

- Param: `tenantIds: number[]`.
- Query key: `['tenants', 'csc-assignments', tenantIds]`.
- `enabled: tenantIds.length > 0`.
- Runs `tenant_csc_assignments` (`is_primary = true`) → `users` for `csc_user_id`s. Returns a map: `tenant_id → { csc_user_id, csc_name, csc_avatar, csc_archived }`.
- `staleTime: 2 * 60 * 1000`. Replaces `fetchCscAssignmentsOnly()`.

### 5. `src/hooks/useTenantNotes.ts`

- Param: `tenantIds: number[]`.
- Query key: `['tenants', 'notes', tenantIds]`.
- `enabled: tenantIds.length > 0`.
- Runs the existing 50-row batched loop against `notes` and `client_notes`, plus `tga_rto_summary` for `registration_end_date`. Returns a map: `tenant_id → { last_note_date, last_note_snippet, registration_end_date }`. (Reg-end is grouped here because it's a small per-tenant lookup that fits the "notes / activity" cadence.)
- `staleTime: 5 * 60 * 1000`.

> Note: the original `enrichTenants` had 11 follow-up queries. We group them into 4 logical hooks (packages, contacts, csc, notes) per the spec — the `tga_rto_summary` lookup needs a home and notes/activity is the closest cadence. If the user prefers a 6th hook for it, easy to split later.

## ManageTenants.tsx changes

- Delete state: `loading`, `fetchError`, `loadingMore`, `tenantsOffset`, `hasMoreTenants`, `tenantsRef`, the `tenants` and `stats` `useState`, and the two `useEffect`s that maintain them.
- Delete functions: `fetchTenants`, `loadMoreTenants`, `fetchCscAssignmentsOnly`, `enrichTenants`, `computeStats` (replaced by `useMemo`).
- Add `const [page, setPage] = useState(0)` and `const queryClient = useQueryClient()`.
- Call the 5 hooks. `useTenantsBasic({ page })` drives loading/error UI. The other 4 hooks receive `tenantIds = basic?.map(t => t.id) ?? []`.
- Build the merged `tenants` array with `useMemo` from the 5 hook results, mapping each base tenant through the four lookup maps to produce the existing `Tenant` shape (preserves all downstream filter/sort code unchanged).
- Build `stats` with `useMemo` from the merged tenants.
- Loading skeleton: `if (basicQuery.isLoading) ...`.
- Error card + Retry: `if (basicQuery.isError) ... <Button onClick={() => basicQuery.refetch()}>Retry</Button>`.
- Load more: clicking the existing button calls `setPage(p => p + 1)`. To preserve the "append" behaviour across pages, accumulate basic pages with a `useState<Tenant[]>` cache keyed off seen ids, OR (cleaner) keep a `pages` state that tracks loaded page numbers and run `useTenantsBasic` for each. Simplest approach: keep an accumulating `loadedTenants` in a `useRef`/`useState` that appends each new `basicQuery.data` when it arrives. The lookup hooks then receive the full accumulated id list.

## Realtime handler

Replace the `tenant_csc_assignments` realtime subscription body with:

```ts
queryClient.invalidateQueries({ queryKey: ['tenants', 'csc-assignments'] });
```

The `packages` realtime channel similarly invalidates `['tenants', 'packages']`. No direct fetch calls.

## Mutation/refresh callers

`AddTenantDialog`, `Unicorn1ImportDialog`, and `CSCQuickAssignDialog` currently receive `onSuccess={fetchTenants}`. Replace with:

```ts
onSuccess={() => queryClient.invalidateQueries({ queryKey: ['tenants'] })}
```

This invalidates all 5 hook caches in one call (prefix match).

## Out of scope

- No changes to `src/App.tsx` or QueryClient config.
- No DB/RLS/schema changes.
- No edits outside `ManageTenants.tsx` and the 5 new hook files.
- No AI/LLM calls in hooks or components.

## Files touched

- Created: `src/hooks/useTenantsBasic.ts`
- Created: `src/hooks/useTenantPackages.ts`
- Created: `src/hooks/useTenantContacts.ts`
- Created: `src/hooks/useCscAssignments.ts`
- Created: `src/hooks/useTenantNotes.ts`
- Edited: `src/pages/ManageTenants.tsx`

Approve to proceed.