# Audit: 2026-04-28 — ManageTenants Performance Investigation & React Query Migration

**Author:** Khian  
**Trigger:** ad-hoc — blank/white screen and stuck loading state reported on Clients tab navigation  
**Scope:** `ManageTenants.tsx` data-fetching architecture, Realtime subscriptions, routing/Suspense setup, two new migrations (`20260428032121`, `20260428033759`)  
**Codebase verified at:** `unicorn-cms-f09c59e5@940dac1b`  
**Session start (local HEAD):** `unicorn-cms-f09c59e5@cf8d131` — was behind `origin/main` at session start; pulled twice during session

---

## Context

Blank/white screen was reported when navigating to the Clients tab. Investigation was read-only first — diagnostic audit of `ManageTenants.tsx`, `App.tsx`, all data-fetching hooks, Realtime channel subscriptions, and recent migrations. Lovable then delivered two sequential fixes which were verified against a checklist after each pull.

---

## Finding 1 — 13 sequential Supabase queries in `fetchTenants()`, no pagination

### What was verified

`ManageTenants.tsx` (pre-fix, commit `cf8d131`) did not use React Query at all despite the app having a `QueryClient` configured in `App.tsx`. All data loading was driven by bare `useEffect` + `useState` calls. `fetchTenants()` executed 13 Supabase queries in sequence on every component mount:

| # | Table / view |
|---|---|
| 1 | `tenants` — `.select("*").order("name")` — all rows, no limit |
| 2 | `package_instances` (active) |
| 3 | `packages` (details) |
| 4 | member counts |
| 5 | `tenant_csc_assignments` |
| 6 | user data for CSCs |
| 7 | admin users + state mappings |
| 8 | primary contacts |
| 9 | primary contact users |
| 10 | `notes` + `client_notes` in parallel batches |
| 11 | package instance included minutes |
| 12 | `v_package_burndown` view |
| 13 | registration end dates |

Total estimated wall-clock: 10–30+ seconds per page visit. No caching, no deduplication, no retry. Query 1 fetched every tenant row with no `.limit()` or `.range()`.

### Root cause of stuck loading state

`setLoading(false)` was called only at the end of the happy path — no `finally` block. If any of the 13 queries timed out, was rate-limited, or threw, the loading state never cleared. The only user-visible feedback was a small toast notification; no error UI or retry path existed.

### Root cause of Realtime loop

The `csc-assignments-changes` Realtime channel called `fetchTenants()` (all 13 queries) on every `tenant_csc_assignments` change event, compounding the load on active tenants.

---

## Finding 2 — QueryClient configured but unused

`App.tsx` had a `QueryClient` with `staleTime: 2 * 60 * 1000`, `refetchOnWindowFocus: true`, `retry: 1`. None of this applied to `ManageTenants.tsx` because it never called `useQuery`.

---

## Finding 3 — Migration `20260423093423` checked (no mismatch found)

`fn_package_stream()` and `start_client_package()` were inspected. Signature and return type of `start_client_package()` (`RETURNS bigint`, three args) matched the TypeScript types at `src/integrations/supabase/types.ts:57492` and the `useClientPackageInstances.tsx` call site exactly. The new duplicate-type guard (DUPLICATE_PACKAGE_TYPE error) was already handled in `useClientPackageInstances.tsx:144-148`. Not a source of the blank-screen bug.

---

## Fix 1 — Loading bug fix (Lovable commit `5186d2f`)

Verified after pull. Changes confirmed:

- `finally` block added to `fetchTenants()` — `setLoading(false)` now fires unconditionally.
- `fetchError` state added — set on catch, renders an error card with a **Retry** button.
- `fetchCscAssignmentsOnly()` introduced as a lightweight 2-query replacement for the Realtime handler (only `tenant_csc_assignments` + `users`, merges into existing state without full re-render).
- Realtime handler updated to call `fetchCscAssignmentsOnly()` instead of `fetchTenants()`.
- Main tenants query updated to `.range(0, 99)` (`TENANT_PAGE_SIZE = 100`), with `loadMoreTenants()` for subsequent pages, each with its own `finally` block.

No files outside `ManageTenants.tsx` and `.lovable/plan.md` were modified.

---

## Fix 2 — React Query migration (Lovable commit `940dac1b`)

Verified after pull. Five new hook files created:

| Hook | queryKey | staleTime | Tables queried |
|---|---|---|---|
| `useTenantsBasic` | `["tenants", "basic", page, pageSize]` | 5 min | `tenants` — paginated |
| `useTenantPackages` | `["tenants", "packages", sortedIds]` | 3 min | `package_instances` → `packages` → `v_package_burndown` |
| `useTenantContacts` | `["tenants", "contacts", sortedIds]` | 5 min | `tenant_users` (×2) → `users` (×2) → `dd_states` |
| `useCscAssignments` | `["tenants", "csc-assignments", sortedIds]` | 2 min | `tenant_csc_assignments` → `users` |
| `useTenantNotes` | `["tenants", "notes", sortedIds]` | 5 min | `notes` + `client_notes` (batched, parallel) → `tga_rto_summary` |

All hooks sort `tenantIds` before using as query keys to prevent spurious cache misses.

`ManageTenants.tsx` changes confirmed:
- `useState(true)` for `loading`, `useState<string | null>` for `fetchError`, `useState(false)` for `loadingMore` — all removed.
- `isLoading` and `isError` sourced from `basicQuery` (React Query).
- `loadingMore` derived as `page > 0 && basicQuery.isFetching` — no state needed.
- Realtime handlers now call `queryClient.invalidateQueries({ queryKey: ['tenants', 'packages'] })` and `queryClient.invalidateQueries({ queryKey: ['tenants', 'csc-assignments'] })` respectively — no direct Supabase calls in channel handlers.
- `onSuccess` callbacks for AddTenantDialog, Unicorn1ImportDialog, and CSCQuickAssignDialog all updated to `queryClient.invalidateQueries({ queryKey: ['tenants'] })`.

**One residual:** `fetchPackages()`, `fetchCSCOptions()`, `checkConnectedTenant()`, and `fetchCodeTables()` remain as bare `useEffect`/`useState` fetches (not React Query). These are not the Clients list data path but carry the same stuck-loading risk if they fail silently. Not blocking.

No files outside the five new hooks, `ManageTenants.tsx`, and `.lovable/plan.md` were modified.

---

## Migration `20260428032121` — FK CASCADE + `user_uuid_history`

This migration continues from the prior audit `2026-04-28-staff-uuid-relink-fix`. It is "Migration C" in that sequence.

**What it does:**

1. Creates `public.user_uuid_history` table — records old/new UUID, email, reason, and actor for every `user_uuid` relink event. RLS: SuperAdmin-only read/write.
2. Adds `email`, `status`, `error_message` columns to `staff_provisioning_runs` (required by the hardened trigger).
3. Converts **all foreign keys referencing `public.users(user_uuid)`** to `ON UPDATE CASCADE` — preserving original `ON DELETE` rules per constraint. Executed via a `DO` block that iterates `pg_constraint`, drops and re-adds each FK as `NOT VALID` (for speed). Built-in safety checks: (a) assert every FK is now `ON UPDATE CASCADE`; (b) assert the delete-rule distribution is unchanged.
4. Replaces `link_auth_user_to_profile()` trigger function with a hardened version: correct `WHERE` clause (was broken), collision detection (logs to `staff_provisioning_runs` instead of raising), successful relinks written to `user_uuid_history`. Never raises — auth insert must always succeed.

---

## Migration `20260428033759` — FK validation pass

"Migration D" in the staff UUID relink sequence.

**What it does:**

1. Creates `public.fk_validation_runs` audit table — records per-constraint validation result (success/error/skipped), duration, and error message. RLS: `is_vivacity()` read-only.
2. Creates `public.run_user_uuid_fk_validation()` — iterates all `NOT VALID` FKs referencing `public.users`, calls `VALIDATE CONSTRAINT` for each (takes only `SHARE UPDATE EXCLUSIVE` lock — non-blocking), logs result to `fk_validation_runs`. Restricted to SuperAdmin via `REVOKE ALL FROM PUBLIC`.
3. Creates `public.rollback_user_uuid_fk_validation(p_run_id uuid)` — stub rollback path; logs rollback intent but notes that actual reversal requires manual `DROP CONSTRAINT` + `ADD CONSTRAINT NOT VALID` per FK. Documented as a discovery aid.
4. Schedules a one-shot `pg_cron` job: `validate-user-uuid-fks-offpeak` at **12:30 UTC (22:30 AEST) tonight, 28 April 2026**. Job self-unschedules after running.

---

## KB changes shipped

No KB changes in this session.

---

## Codebase observations (read-only)

- `unicorn-cms-f09c59e5@940dac1b` — ManageTenants React Query migration complete; five dedicated hooks live in `src/hooks/`; two migrations adding FK cascade and validation infrastructure deployed today.

---

## Decisions

None drafted or resolved this session.

---

## Open questions parked

- `fetchPackages()`, `fetchCSCOptions()`, `checkConnectedTenant()`, `fetchCodeTables()` in `ManageTenants.tsx` remain as bare `useEffect` fetches — candidates for a follow-up React Query migration.
- `pg_cron` job `validate-user-uuid-fks-offpeak` scheduled for 22:30 AEST tonight — check `fk_validation_runs` tomorrow to confirm 108 FKs validated with no errors.
- `refetchOnWindowFocus: true` on the global `QueryClient` means switching back to the tab re-fetches all active queries — worth revisiting if users report unexpected loading states on tab focus.

---

## Tag

`audit-2026-04-28-manage-tenants-perf-optimisation`
