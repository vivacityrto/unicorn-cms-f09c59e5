# Audit: 2026-08-18 — consultant capacity RPC parameter mismatch

**Trigger:** drift-surfaced — found by the independent adversarial review of PR #366 while
verifying that function's real callers actually match its guarded signature.
**Scope:** `src/pages/admin/TeamReassignmentPage.tsx`, `src/components/client/BulkReassignCscDialog.tsx`.
No database change.

## Findings

- Both files call `supabase.rpc('compute_consultant_current_load', { p_consultant_id: toId })` and
  the equivalent for `compute_consultant_weekly_capacity`, but both Postgres functions declare
  their parameter as `p_user_uuid`, not `p_consultant_id` — confirmed via `pg_get_function_arguments`
  against the live schema.
- PostgREST resolves an RPC call by matching the JSON body's keys against the function's named
  parameters; a key that doesn't match any parameter name means the call fails (no matching
  function signature), independent of any actual permissions. This means the "load"/"capacity"
  figures shown when picking a destination consultant in Team Reassignment and Bulk Reassign CSC
  have likely been silently blank (`undefined` response, rendered as `null` capacity) in production
  since before this session — unrelated to the SECURITY DEFINER sweep in
  `2026-08-18-security-definer-full-sweep.md`, which touched these two functions' bodies but not
  their argument lists.

## Fix

- Renamed the JSON key in both call sites from `p_consultant_id` to `p_user_uuid` to match the
  actual function signature. No database change required.

## Decisions

- Fixed the frontend call sites rather than renaming the Postgres parameter, since the database
  functions are the source of truth and were already correctly named going into this session.

## Open questions parked

- None. This was a narrow, fully-understood fix.
