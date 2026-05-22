# CSC-008 — Realtime invalidation for tenant "Last note" cache

Frontend-only fix to `src/hooks/useTenantNotes.ts`. Adds a Supabase realtime subscription on the `notes` and `client_notes` tables that invalidates the hook's React Query cache on INSERT/UPDATE, so the Manage Tenants "Last note" column refreshes immediately instead of waiting for the 5-minute `staleTime`. No DB changes, no RLS changes, no migration.

## File: `src/hooks/useTenantNotes.ts`

### Imports
Add:
```ts
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
```

### Inside `useTenantNotes`
After the existing `useQuery(...)` call, before `return`:

```ts
const queryClient = useQueryClient();

useEffect(() => {
  if (sortedIds.length === 0) return;

  const channel = supabase
    .channel(`tenant-notes-changes-${sortedIds.join("-")}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "notes" },
      () => {
        queryClient.invalidateQueries({ queryKey: ["tenants", "notes"] });
      },
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "notes" },
      () => {
        queryClient.invalidateQueries({ queryKey: ["tenants", "notes"] });
      },
    )
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "client_notes" },
      () => {
        queryClient.invalidateQueries({ queryKey: ["tenants", "notes"] });
      },
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "client_notes" },
      () => {
        queryClient.invalidateQueries({ queryKey: ["tenants", "notes"] });
      },
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}, [queryClient, sortedIds.join(",")]);
```

Refactor to capture both `query` and return it:
```ts
const query = useQuery({ ... });
// effect here
return query;
```

### Design notes
- **Two source tables.** The query reads from both `notes` and `client_notes`; the subscription must cover both, otherwise client-portal notes still go stale.
- **Invalidate by prefix.** `["tenants", "notes"]` matches every `["tenants", "notes", sortedIds]` cache entry — important because Manage Tenants passes a long id array, and other call sites may pass different arrays. Prefix invalidation guarantees they all refresh.
- **Unique channel name per id set.** Supabase rejects duplicate channel names. Manage Tenants mounts this hook once; other consumers (if any) get a different `sortedIds.join("-")` and thus a distinct channel. The cleanup `removeChannel` runs on unmount and on id-set change, preventing leaks.
- **Effect dependency uses `sortedIds.join(",")`.** Arrays are referentially unstable; the joined string keeps the effect stable when the same ids are passed.
- **No DELETE listener.** Spec says INSERT and UPDATE only. Deleting a note is rare and the stale row will fall out at the 5-minute boundary; leaving DELETE off keeps the channel quieter and matches the spec.
- **`staleTime` unchanged** (5 min) — realtime is the fast path, `staleTime` remains the fallback.
- **`enabled`/empty guard.** If `sortedIds` is empty the query is disabled and the effect early-returns, so no channel is opened.

### What is NOT touched
- `staleTime`, `queryKey`, `queryFn`, batch logic, `tga_rto_summary` lookup.
- `ManageTenants.tsx` `packages-changes` and `csc-assignments-changes` channels.
- RLS, schema, migrations, edge functions.

## Verification
1. Open Manage Tenants → "Last note" column populated.
2. Open a tenant, add a new note → return to Manage Tenants within seconds: snippet/date reflect the new note (no 5-minute wait).
3. Edit an existing note's title → Manage Tenants reflects the change.
4. DevTools → Network: no polling; one WebSocket frame per note change.
5. Navigate away from Manage Tenants → console shows no "channel already exists" warnings on return; no leaked subscriptions.
6. Other columns (CSC, packages, registration end date, etc.) unchanged.
7. `npm run build` / typecheck passes.

## Risk assessment
- **Low.** Hook-local change. Realtime invalidation is additive — worst case the subscription fails silently and behaviour reverts to the existing 5-minute `staleTime` fallback.
- **Realtime enablement:** `notes` and `client_notes` must be in the `supabase_realtime` publication. If either is not, that table's events simply won't fire — the other still works, and the fallback `staleTime` still covers it. No migration is in scope per the spec; if the user reports that updates still don't appear in real time, the follow-up is enabling realtime publication on those tables.
- **No RLS impact:** invalidation triggers a normal re-fetch under the calling user's session; existing policies continue to gate row visibility.
- **No audit impact:** read-only client-side cache behaviour.
- **No performance impact:** events only fire on actual writes; payload is discarded (we only call `invalidateQueries`).
