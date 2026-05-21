# Fix: Impersonation enrol error handling + exclude archived users

## Scope
Two surgical changes per the spec — no other behaviour touched.

## Change 1 — `src/hooks/academy/useEnrolCourse.ts`

Inside the existing `onError`, immediately before the final `friendlyDbError` fallback, add:

```ts
const code = (e as any)?.code;
if (
  msg.includes("invalid_target_user") ||
  msg.includes("violates foreign key constraint") ||
  code === "23503"
) {
  toast.error("This user's account is no longer active — please exit the preview and select a different user.");
  return;
}
```

Matches the existing `tenant_context_required` / `target_user_not_in_tenant` / `existing_enrolment_different_tenant` branch pattern. `msg` already concatenates `e.message` + serialized error, so PostgREST-style messages and raised exception names both match. The `code === "23503"` guard catches FK violations whose message may be localised.

## Change 2 — Migration: `public.list_acting_user_options(bigint)`

`CREATE OR REPLACE` the function with one added predicate in the WHERE clause:

```
AND u.archived IS NOT TRUE
```

Everything else preserved exactly:
- Return shape: `(user_uuid, full_name, email, relationship_role, is_default)`
- `LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'`
- Joins, COALESCE expressions, `is_default` calculation
- Existing auth filters (`email_confirmed_at`, `deleted_at`, `banned_until`)
- `ORDER BY is_default DESC, full_name ASC`
- Existing `GRANT EXECUTE ... TO authenticated` and `REVOKE ... FROM PUBLIC` remain in force (CREATE OR REPLACE does not drop grants)

Verified against live DB:
- `public.users.archived` column exists → predicate is valid
- `IS NOT TRUE` correctly treats `NULL` and `false` as "not archived" (backward-compatible for legacy rows where `archived` was never set)

## Deep-dive verification

**Backward compatibility**
- Frontend consumers of `list_acting_user_options` (`ClientPreviewContext.fetchActingUserOptions`, `ViewAsClientButton`) read only the documented columns — unchanged shape means zero frontend churn.
- `useAcademyActingUserId` resolves acting user from preview context; if a stale localStorage UUID points at a now-archived user, `startPreview` re-fetches options and falls back to the primary contact (existing behaviour). No code change needed.
- `useCompleteEnrollment` is untouched.

**Audit / RLS / data rules**
- No RLS policies modified.
- No schema changes to `academy_enrollments`, `tenant_users`, `users`, or `auth.users`.
- `SECURITY DEFINER` and `search_path` preserved → no privilege drift.
- `enrol_as_impersonator` RPC unchanged — the `invalid_target_user` exception it already raises is now surfaced with an actionable toast instead of a generic one.

**Edge cases**
- All-archived tenant → empty list → existing "No users on this tenant yet" empty state renders.
- Archived user with valid auth row → now correctly filtered out of picker.
- Archived user already mid-impersonation (stale session) → next picker fetch excludes them; if staff attempts enrol, server raises `invalid_target_user` and the new toast guides recovery.
- FK violation from a deleted `auth.users` row → caught by `code === "23503"` even if message text varies.

**Test matrix**
- Buggy data: tenant with 1 archived + 1 active user → picker shows only active.
- Clean data: tenant with no archived users → picker unchanged.
- Impersonation with valid target → enrol succeeds.
- Impersonation with target missing from `public.users` → toast: "This user's account is no longer active…"
- Impersonation with FK violation against `auth.users` → same toast.

## Risk assessment
- **Risk: Low.** Two additive changes; no schema/RLS/grant changes; output contract preserved.
- **Rollback:** revert the TS hook diff; `CREATE OR REPLACE` the function back to the prior definition (captured above).
- **Blast radius:** picker contents (now excludes archived) and one error-toast branch (now more specific). No other call site affected.

## Summary
- Adds a precise, actionable error toast for inactive/missing target users in academy impersonation enrol flow.
- Hides archived users from the impersonation picker at the source.
- Zero impact on RLS, audit, schema, return shape, ordering, or other error branches.
