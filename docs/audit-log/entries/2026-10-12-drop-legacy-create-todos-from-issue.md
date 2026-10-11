# Audit: 2026-10-12 — drop-legacy-create-todos-from-issue

**Trigger:** drift-surfaced (found while verifying the EOS IDS to-do changes from #1404)
**Scope:** the two overloads of `public.create_todos_from_issue` in production
(`yxkgdalkbrriasiyyrwk`), and every caller of either. Did not change the 3-argument
function, `eos_todos`, or any RLS policy.

## Findings
- Production had two overloads:
  - `create_todos_from_issue(p_issue_id uuid, p_todos jsonb)` — the original. Reads the
    issue's tenant and meeting directly and raises `Issue not found` if the tenant is null.
  - `create_todos_from_issue(p_issue_id uuid, p_todos jsonb, p_meeting_id uuid DEFAULT NULL)`
    — adds an explicit meeting id and falls back to the Vivacity tenant (6372) for issues
    that predate the tenant backfill.
- The 3-argument version does everything the 2-argument one does. Both are `SECURITY
  DEFINER`, `search_path = public`, and granted to `authenticated` and `service_role` only.
- This is the "`CREATE OR REPLACE` with a changed parameter list creates a second overload"
  trap described in `AGENTS.md` (Schema / RLS / trigger changes). The second overload was
  added without dropping the first.
- Callers swept before dropping:
  - Frontend: one call site, `src/lib/eosIssueEdit.ts` (`createIssueTodos`), which passes
    `p_issue_id`, `p_todos` **and** `p_meeting_id`, so it always resolves to the 3-argument
    version. Covered by `src/lib/__tests__/eosIssueEdit.test.ts`.
  - Edge Functions, scripts, e2e and workflows: none.
  - Database: no other function body, trigger or view references the name
    (`pg_get_functiondef` / `pg_get_triggerdef` / `pg_views` search).
- Nothing was reachable only through the 2-argument form, so no behaviour changes.

## Code changes (if this entry accompanies one)
- `supabase/migrations/20261012010000_drop_legacy_create_todos_from_issue_2arg.sql`:
  `DROP FUNCTION IF EXISTS public.create_todos_from_issue(uuid, jsonb);`
- `src/integrations/supabase/types.ts`: the generated `create_todos_from_issue` entry
  collapses from a two-signature union to the single 3-argument signature
  (`p_meeting_id` optional).
- `supabase/migration-safety-allowlist.json`: removed three already-expired entries
  (`l10-31-…`, `l10-33-…`, `tenant-package-security-fixes-function-bodies`) that made
  `audit-migrations` fail on every migration PR. Same cleanup as #1411.

## Decisions
- Drop rather than keep as a compatibility shim: the only caller already uses the new
  signature, and keeping both leaves a future two-argument call open to an
  ambiguous-overload error.
- **Rollback:** recreate the 2-argument function from its definition in
  `supabase/migrations/20251011024608_f9147eba-ab7e-458d-9f02-adc23258907b.sql`
  (line 209). No data is affected either way.
- After the migration is applied, verify exactly one row:
  `select pg_get_function_identity_arguments(oid) from pg_proc where proname = 'create_todos_from_issue';`

## Open questions parked
- The 3-argument function's `COALESCE(tenant_id, 6372)` fallback silently assigns
  tenant-less issues to the Vivacity tenant. Fine while all issues belong to that tenant;
  worth revisiting if EOS is ever opened to client tenants.
