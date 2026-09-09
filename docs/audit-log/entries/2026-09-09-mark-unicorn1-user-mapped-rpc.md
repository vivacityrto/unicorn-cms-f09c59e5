# Audit: 2026-09-09 — mark_unicorn1_user_mapped RPC + PUBLIC-grant leak fix (L10 #33)

**Trigger:** L10 #33 -- `InviteUserDialog.tsx`'s "Import from Unicorn 1" write
step called `supabase.schema('unicorn1').from('users').update(...)` directly
from the browser client. That always fails at the PostgREST layer ("The
schema must be one of the following: public, graphql_public") since this
project's PostgREST config never exposes the `unicorn1` schema, so the
legacy record's `mapped_user_uuid` was silently never set on import.

## Change

- New migration `20260909050000_mark_unicorn1_user_mapped_rpc.sql`: adds
  `public.mark_unicorn1_user_mapped(p_legacy_id bigint, p_mapped_user_uuid uuid)`,
  a `SECURITY DEFINER` function mirroring the existing `search_unicorn1_users`
  read-side workaround (a public-schema function that reaches into `unicorn1`
  internally, bypassing PostgREST's schema restriction entirely).
- New Edge Function `mark-unicorn1-user-mapped` (service-role client, gated
  on `FeatureKeys.adminUnicorn1` via `requireCaller` -- same gate as the
  existing `search-unicorn1-users` function) calls the RPC.
- `InviteUserDialog.tsx`'s `mapUnicorn1UserToUuid` now calls the Edge
  Function instead of the broken direct schema write. Removed the dead
  `Unicorn1SchemaClient`/`Unicorn1UsersUpdate` typing shim that existed only
  to narrow the `as unknown` cast around the now-deleted broken call.

## Security finding (self-caught, fixed same session)

The first migration's `REVOKE EXECUTE ... FROM authenticated, anon` was
ineffective: `CREATE FUNCTION` grants `EXECUTE` to `PUBLIC` by default, and
revoking named roles doesn't touch that grant. `pg_proc.proacl` showed
`{=X/postgres,postgres=X/postgres,service_role=X/postgres}` immediately
after the first migration -- the leading `=X` entry is the PUBLIC grant,
meaning any authenticated *or anonymous* caller could have invoked the RPC
directly via the PostgREST RPC endpoint and remapped any legacy Unicorn1
user's `mapped_user_uuid` to an arbitrary UUID (an identity-hijack
primitive). `search_unicorn1_users`, the function this was meant to mirror,
has no PUBLIC entry in its ACL, so its own identical-looking revoke line was
already effective -- the two functions were not actually equivalent despite
the near-identical `REVOKE` statement.

Follow-up migration `20260909054500_revoke_public_execute_mark_unicorn1_user_mapped.sql`
revokes `EXECUTE` from `PUBLIC` explicitly. Verified post-fix via
`pg_proc.proacl`: now `{postgres=X/postgres,service_role=X/postgres}`,
matching `search_unicorn1_users` exactly; `has_function_privilege` confirms
`authenticated`/`anon` cannot execute and `service_role` can.

**Exposure window:** both migrations were applied within the same working
session, and no Edge Function or frontend caller was wired up at any point
the leak existed, so no legitimate or illegitimate traffic had a reachable
path to exploit it in practice -- the grant itself was live and callable via
the Supabase REST RPC endpoint for that window regardless.

## Evidence

- `lint:ratchet`: 0 regressions (`InviteUserDialog.tsx` errors 0 -> 0).
- `typecheck`: 0 errors.
- `test:frontend`: 346 passed, 43 skipped, 0 failing.
- `test:edge`: 281 passed, 0 failing (includes the new
  `mark-unicorn1-user-mapped/auth-gate.test.mjs`).
- Direct RPC safety check: called `mark_unicorn1_user_mapped(999999999,
  <random uuid>)` against production -- `999999999` matches no real
  `unicorn1.users` row, so this exercised the function's full execution path
  with zero rows affected and nothing to clean up.
- Live authenticated Playwright (SuperAdmin persona, read-only): `/manage-users`
  -> "Add User" -> "From Unicorn 1" tab -> search field renders correctly,
  zero console/page errors. Confirms the dialog still renders after the code
  change; temporary spec removed after the run (`git diff --stat` on the
  touched spec file showed no changes once reverted).
- **Not verified live, disclosed as a gap:** completing an actual import and
  exercising the new Edge Function end-to-end. The `mark-unicorn1-user-mapped`
  function is not yet deployed to the hosted Supabase project (deploys happen
  on merge to `main` per this repo's documented, sometimes-unreliable
  auto-deploy path), so no pre-merge frontend call can reach it, and
  completing a real import would create an irreversible production auth
  user + tenant membership outside this task's scope. Follow-up: after
  merge, confirm via `list_edge_functions`/`get_edge_function` that the
  function deployed and matches source (per AGENTS.md's "Supabase deployment
  workflow" guardrail), then do one real import against a disposable test
  identity if further confidence is wanted.

## Disposition

Closes L10 #33. The Unicorn 1 import flow's write path now matches its read
path's security posture exactly. Remaining follow-up is the post-merge Edge
Function deployment check noted above.
