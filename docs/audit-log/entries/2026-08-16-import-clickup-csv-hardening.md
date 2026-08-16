# Audit: 2026-08-16 — import-clickup-csv-hardening

**Trigger:** ad-hoc (security hardening of an unauthenticated service-role upsert)
**Scope:** `supabase/functions/import-clickup-csv` only. Did not retarget the
upsert onto `clickup_tasks_api` (the live replacement table), did not change
`sync-clickup-tasks` / `fetch-clickup-comments` / `sync-clickup-time`, and did
not add a new `permission_features` key.

## Findings

- Live `permission_features` has no clickup- or import-specific key
  (confirmed via `execute_sql` on project `yxkgdalkbrriasiyyrwk`). Closest
  admin keys are `admin.migration.unicorn1` (Unicorn 1 client import, not
  ClickUp) and `admin.system_config.manage`. Used the requested fallback
  `admin.team_users.manage` (active, Super Admin `full`) — same gate as the
  `/admin/clickup-import` `requireSuperAdmin` route.
- The function was `verify_jwt = false` with no in-function caller check and
  used the service-role client to upsert whatever columns the body spread
  in, including `tenant_id`. Gateway `verify_jwt` would not have been
  authorization anyway (the anon key is a valid JWT).
- `clickup_tasks` and `clickup_tasksdb` are **not** present in the live
  database (replaced by `clickup_tasks_api` / related tables). The function
  still names the old tables; this hardening does not retarget them.
- Stamping `users.tenant_id` from the verified importer onto every CSV row
  would attach client ClickUp tasks to the Vivacity staff tenant. After
  `requireCaller`, `tenant_id` is omitted from the allowlist and filled in
  by the existing `unicorn_url` resolver (`/clients/N`, `/stage/N`,
  package-instance paths) — never from the row payload.

## KB changes shipped

- no changes

## Code changes (this entry accompanies one)

- `import-clickup-csv/index.ts` — Version A `requireCaller(req,
  "admin.team_users.manage", "full")`; `corsHeadersFor` (APP_BASE_URL
  allowlist, never `*`); allowlisted upsert via `pickAllowedClickupColumns`.
- `import-clickup-csv/clickup-csv-allowlist.ts` — explicit column lists
  matching `src/utils/clickup-import-mappings.ts` minus `tenant_id` / `id`
  / stamp fields.

## Decisions

- Reuse `admin.team_users.manage` rather than seed a new
  `admin.clickup.import` key. Super Admin already always-passes
  `check_permission`; a new key would be taxonomy noise for a Super-Admin-
  only orphaned import path.
- Keep `verify_jwt = false` in `config.toml`. Authorization is
  `requireCaller` + `auth.getUser`; flipping `verify_jwt` on would still
  admit the public anon key.

## Open questions parked

- Whether this function should upsert `clickup_tasks_api` instead of the
  dropped `clickup_tasks` / `clickup_tasksdb` tables. The live ClickUp
  Import page (`ClickUpImport.tsx`) already calls `sync-clickup-tasks` /
  `fetch-clickup-comments` / `sync-clickup-time` and never invokes
  `import-clickup-csv`.
