## Deep-dive verification result

The earlier plan (lightweight status-roll-up hook for KPIs/CSC chips) is **necessary but not sufficient**. The root cause of the user's "18 of 64 active" complaint is in the row list itself, not just the KPI cards. Here is the full verified picture.

## Confirmed root cause (with database proof)

`tenants` table, current counts:

| status | rows |
|---|---:|
| inactive | 325 |
| **active** | **64** |
| cancelled | 10 |
| disabled | 3 |
| terminated | 1 |
| In Arears | 1 |
| archived | 1 |
| **total** | **405** |

`useTenantsBasic` (`src/hooks/useTenantsBasic.ts`) loads `.order("name").range(0, 99)` — 100 rows alphabetically, **no server-side status filter**. The status filter (`statusFilter` defaulting to `"active"`) is applied client-side at line 329 of `ManageTenants.tsx`.

Verified directly against the database:

```sql
SELECT COUNT(*) FILTER (WHERE status='active')
FROM (SELECT status FROM tenants ORDER BY name LIMIT 100) s;
-- result: 18
```

So on initial load the user sees **exactly 18** active tenants — matching their screenshot perfectly. The remaining 46 active clients are scattered across the next ~3 pages of mostly-inactive results. There is a "Load more" button (line 1059) but it is below the in-page pagination and easy to miss; even when used it would require 3+ clicks to surface every active client.

The same paginated slice feeds every aggregation on the page:

| Consumer | Line | Bug today |
|---|---:|---|
| `stats.total / active / suspended / closed` | 178 | Counts only loaded slice → "Total 100, Active 18" |
| CSC Load chips | 602 | Per-CSC counts massively undercounted |
| CSC dropdown counts | 671, 675 | Same |
| `Unassigned (count)` in CSC dropdown | 669 | Same |
| `handleConnectToAll` source list | 445 | Would only connect to actives within the loaded slice |

## Likely cause of the regression

The page used to fetch all tenants in one go. When `useTenantsBasic` was introduced (React Query migration, 100-row `.range()` paging) the **client-side status filter was left in place**. Pagination at the server + filtering on the client = undercounting whenever the dataset exceeds one page. This is a classic "filter on top of paginated subset" bug.

## Verification that the fix is safe

Searched the codebase — `useTenantsBasic` is consumed only by `src/pages/ManageTenants.tsx`. Adding an optional parameter is a non-breaking change.

The four dependent hooks (`useTenantPackages`, `useCscAssignments`, `useTenantContacts`, `useTenantNotes`) all take `tenantIds` via `.in(...)`. When server-side filtering reduces the slice from 100 to ~64, each hook simply queries fewer rows — no schema or behaviour change. None of them have hidden 1000-row caps that could be tripped because they were already scoped by tenant id.

Realtime invalidations (lines 299–317) use the `["tenants", ...]` key prefix, which auto-invalidates both the new server-filtered query key and the new full-population roll-up.

## Fix

Two complementary, contained changes.

### 1. Push the status filter to the server (fixes the table)

Extend `useTenantsBasic` with an optional `statuses` array and apply it server-side. The default of "all statuses" preserves today's behaviour for any future caller.

`src/hooks/useTenantsBasic.ts`:

```ts
interface UseTenantsBasicParams {
  page?: number;
  pageSize?: number;
  statuses?: string[];          // empty/undefined = no filter
}

queryKey: ["tenants", "basic", page, pageSize, statuses ?? []],
queryFn: async () => {
  let q = supabase.from("tenants").select("*").order("name")
                  .range(page * pageSize, page * pageSize + pageSize - 1);
  if (statuses && statuses.length) q = q.in("status", statuses);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as TenantBasic[];
},
```

In `ManageTenants.tsx`:

- Map the UI `statusFilter` to the array of underlying status values:
  - `"all"` → `undefined` (no server filter)
  - `"active"` → `["active"]`
  - `"suspended"` → `["inactive", "on_hold", "disabled", "In Arears"]`
  - `"closed"` → `["terminated", "cancelled", "archived"]`
  - any explicit dd_status value → `[value]`
- Pass it: `useTenantsBasic({ page, pageSize: TENANT_PAGE_SIZE, statuses: serverStatuses })`
- Reset paging when the filter changes — otherwise leftover accumulator rows from the previous filter pollute the view:
  ```ts
  useEffect(() => {
    setPage(0);
    setAccumulated([]);
  }, [statusFilter]);
  ```

With `statusFilter = "active"` the server returns all 64 actives in one page (≤100), no "Load more" needed, and `applyFiltersAndSort`'s existing client-side status check becomes a harmless no-op.

### 2. Add a full-population status/CSC roll-up (fixes KPIs and CSC chips)

`src/hooks/useTenantStatusCounts.ts` — single lightweight query returning `{ id, status, csc_user_id, csc_name }[]` for every tenant. With 405 rows it is well under the 1000-row PostgREST cap; we'll still implement a cursor loop for safety per the project memory.

```ts
export function useTenantStatusCounts() {
  return useQuery({
    queryKey: ["tenants", "status-counts"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      // tenants
      const { data: tenantRows } = await supabase
        .from("tenants").select("id, status").order("id");
      // primary CSC assignments
      const { data: cscRows } = await supabase
        .from("tenant_csc_assignments")
        .select("tenant_id, csc_user_id")
        .eq("is_primary", true);
      // resolve CSC names
      const uuids = [...new Set((cscRows ?? []).map(r => r.csc_user_id).filter(Boolean))];
      const { data: users } = uuids.length
        ? await supabase.from("users").select("user_uuid, first_name, last_name").in("user_uuid", uuids)
        : { data: [] };
      // join in JS, return flat array
    },
  });
}
```

Replace these consumers in `ManageTenants.tsx` with this hook's data:

- `stats` (line 178) — totals across the full population
- CSC Load chips (line 602) — count by `status === 'active'` across the full population
- CSC dropdown counts (lines 671, 675, 669) — same
- `handleConnectToAll` (line 445) — read the active list from the roll-up, not from the paginated `tenants` array

The existing in-row filter UI (search, package, CSC, renewal, regEnd) keeps operating on the loaded `tenants` accumulator, which now contains the full set for the chosen status.

## Side-effect / regression matrix

| Reader | After change | Risk |
|---|---|---|
| `applyFiltersAndSort` line 320 | Server already filtered; client filter is a no-op | None |
| Search by name/slug | Operates on loaded accumulator (now correctly sized) | None |
| Package / CSC / Renewal / Reg-End filters | Same | None |
| `_hasKickStart` derivation | Per-row | None |
| `tenant_packages/contacts/csc/notes` hooks | Receive smaller `tenantIds` array | Smaller, faster — fine |
| Realtime invalidations | Prefix `["tenants", ...]` covers new keys | None |
| Other consumers of `useTenantsBasic` | None exist (verified by `rg`) | None |
| KPI cards / CSC Load / Connect-to-all | Now backed by full-population roll-up | None |
| "Show Archived" toggle (line 747) | Only shows when `statusFilter==="all"` → no server filter applied → behaviour unchanged | None |

## Out of scope

- No RLS, schema, or RPC changes
- No restructure of the table or "Load more" UX
- No edits to `AddTenantDialog`, `Unicorn1ImportDialog`, `CSCQuickAssignDialog` — their existing `invalidateQueries({ queryKey: ['tenants'] })` calls already invalidate the new keys via prefix match
- No changes to `NewAuditModal.tsx` (covered by the previously-shipped fix)

## Files to change

1. `src/hooks/useTenantsBasic.ts` — add optional `statuses?: string[]` server-side filter.
2. `src/hooks/useTenantStatusCounts.ts` — new full-population roll-up hook.
3. `src/pages/ManageTenants.tsx` — pass `statuses` derived from `statusFilter`; reset paging on filter change; replace `stats`, CSC chips, CSC dropdown counts, and `handleConnectToAll` source with roll-up data.

## Expected result

- Default Active view loads all **64** active clients in a single page; no "Load more" required.
- KPI cards show real totals: Total **405**, Active **64**, Suspended **329**, Closed/Archived **12**.
- CSC Load chips and dropdown counts reflect the full portfolio.
- All other behaviour identical to today.
