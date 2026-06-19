## Fix: Activity Log user name resolution in StaffEngagementDetail

**File:** `src/pages/admin/StaffEngagementDetail.tsx` (only)

**Problem:** The `activityQuery` uses a PostgREST embed `users:completed_by ( full_name )`, but `checklist_item_completions.completed_by` has no FK to `public.users`, so the embed never resolves and all activity rows show "Unknown user".

**Changes:**

1. **Simplify `activityQuery.queryFn`** — drop the embed and the `as any` cast, return a plain select of `item_key, completed_by, completed_at` ordered by `completed_at desc`.

2. **Add `userNamesQuery`** — new `useQuery` that:
   - Is enabled only when `completionsQuery.data` has ≥ 1 row
   - Derives the unique set of `completed_by` UUIDs from `completionsQuery.data`
   - Calls `supabase.from("users").select("user_uuid, full_name").in("user_uuid", uniqueUuids)`
   - Returns the rows

3. **Rewrite `userNameMap` memo** — build the `Map<uuid, full_name>` from `userNamesQuery.data` instead of `activityQuery.data`.

4. **Activity Log render** — replace `r.users?.full_name` with `userNameMap.get(r.completed_by) ?? "Unknown user"`.

**Out of scope (untouched):** checklist item rendering, toggle mutation, cancel mutation, PhaseProgress, signoffs query, engagement query, routing, all other files.
