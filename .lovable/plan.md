
# BUG-005 — Restrict impersonator RPCs to authenticated users only

## Verified current grant state (live DB)

Queried `pg_proc.proacl` for both functions:

- `public.complete_enrollment_as_impersonator(bigint, uuid)`
  - `proacl`: `{=X/postgres, postgres=X/postgres, anon=X/postgres, authenticated=X/postgres, service_role=X/postgres}`
  - `=X` = **PUBLIC has EXECUTE** + explicit **anon** grant. Bug confirmed.
- `public.enrol_as_impersonator(bigint, uuid, bigint)`
  - `proacl`: `{postgres=X/postgres, anon=X/postgres, authenticated=X/postgres, service_role=X/postgres}`
  - PUBLIC already revoked; **anon** still present. Bug confirmed.

Both functions are `SECURITY DEFINER` (verified earlier in chat history) and enforce staff/impersonation checks internally — but defence-in-depth requires removing the unauthenticated/anon EXECUTE so a misconfigured client or stolen anon key cannot even invoke them.

## The migration (exactly 3 statements, nothing else)

```sql
-- BUG-005: restrict impersonator RPCs to authenticated users only
REVOKE EXECUTE ON FUNCTION public.complete_enrollment_as_impersonator(bigint, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.complete_enrollment_as_impersonator(bigint, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.enrol_as_impersonator(bigint, uuid, bigint) FROM anon;
```

No GRANTs. No function-body changes. No RLS or trigger changes. No frontend changes.

## Post-state (expected `proacl` after migration)

- `complete_enrollment_as_impersonator`: `{postgres=X, authenticated=X, service_role=X}`
- `enrol_as_impersonator`: `{postgres=X, authenticated=X, service_role=X}`

Both end up identical and aligned with the project's intended impersonator-RPC access model.

## Impact analysis

### Callers
- `src/hooks/academy/useCompleteEnrollment.ts` — calls via `supabase.rpc(...)` from the browser, which uses the **authenticated** role once a user is signed in. Unaffected.
- `src/hooks/academy/useEnrolCourse.ts` — same. Unaffected.
- No edge function calls these RPCs (would use `service_role`, still granted).
- No SQL/DB code internally calls these RPCs.

### Not touched (per instructions, and verified unrelated)
- Function bodies of both RPCs.
- RLS policies on `academy_enrollments`.
- Triggers `pdp_auto_evidence_after_complete`, `set_academy_enrollments_updated_at`, `trg_issue_academy_certificate`.
- Any other function, table, grant, or policy.

### Backward compatibility
- Signed-in users (authenticated role): no change — still can call.
- Service role / edge functions: no change.
- Anonymous / signed-out callers: were previously able to reach the function and fail inside the body's authorization checks; now blocked at the EXECUTE layer with `permission denied for function ...`. This is the intended hardening and not a regression — the app never invokes these RPCs without an authenticated session.

### Audit trail
- Migration file itself is the audit record (timestamped, in `supabase/migrations/`).
- No `audit_events` rows are written by grant changes — consistent with how Phase 5Z and earlier grant-hardening migrations were handled.

## Risk assessment

| Risk | Likelihood | Mitigation |
|---|---|---|
| Breaks a legitimate caller | Very low | Only callers are the two React hooks, both run as `authenticated`. |
| Future migration re-adds PUBLIC grant | Low | Pattern matches prior hardening migrations; consider a follow-up lint, but out of scope here. |
| Types regeneration needed | None | Grant changes don't affect `Database` types. |
| Rollback complexity | Trivial | `GRANT EXECUTE ... TO anon, PUBLIC` if ever needed (not recommended). |

## Test plan (post-apply verification)

1. Re-run the `pg_proc.proacl` query — confirm PUBLIC and anon are gone on both functions, `authenticated`/`postgres`/`service_role` retained.
2. Authenticated browser session: trigger "Enrol" and "Complete enrollment" in the Academy UI (both staff-as-impersonator and normal flows still route through `enrol_in_academy_course` / `complete_academy_enrollment` for non-impersonating users, so explicitly test the impersonation path while "viewing as client").
3. Confirm no new Supabase linter findings attributable to this migration (existing 961 pre-existing warnings remain unchanged).

## Deliverable

One new migration file under `supabase/migrations/` containing only the comment + the 3 `REVOKE` statements above. No other files modified.
