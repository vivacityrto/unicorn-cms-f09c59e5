# Audit: 2026-05-11 — cron-jwt-rotation-blocked

**Trigger:** ad-hoc — P0 remediation: replace hard-coded anon JWT in cron jobs 1 & 2 with vault-backed helper function.
**Author:** Carl
**Scope:** Unicorn 2.0-dev project `yxkgdalkbrriasiyyrwk`. Cron job infrastructure and command bodies only. No app code changes. No other DB objects touched.

---

## End state (as at close of session — P0 CLOSED 2026-05-12)

| Artefact | Status | Note |
|---|---|---|
| `vault.cron_function_jwt` secret | IN PLACE | Created Sunday 10 May; confirmed present |
| `private` schema | DEPLOYED | Created this session via Studio SQL Editor |
| `private.cron_function_jwt()` helper | DEPLOYED | Created this session via Studio SQL Editor |
| Job 8 `generate-notifications-meetings-v2` | ACTIVE | Created by Lovable migration; owned by `postgres`; uses vault helper |
| Job 9 `generate-notifications-daily-v2` | ACTIVE | Created by Lovable migration; owned by `postgres`; uses vault helper |
| Job 1 `generate-notifications-meetings` (legacy) | **REMOVED** | Supabase support transferred ownership to `postgres` (2026-05-12); removed via Lovable migration `remove_legacy_cron_jobs` |
| Job 2 `generate-notifications-daily` (legacy) | **REMOVED** | Same |
| ComplyHub accidental artefacts | PRESENT | `private` schema + `private.cron_function_jwt()` on `gdwhlstfguxarnxasrrs`; inert but need cleanup |

**P0 fully closed.** Jobs 1 and 2 removed. Verification query `SELECT jobid, jobname FROM cron.job WHERE command LIKE '%eyJ%'` returns 0 rows. Only jobs 8 and 9 (vault-backed) are now active. No more double-firing.

---

## Findings

- **vault.cron_function_jwt secret**: confirmed present, created 2026-05-10. Not readable via MCP (`permission denied for function _crypto_aead_det_decrypt`) — verified via `vault.secrets` metadata only.
- **private schema**: absent at session start (Sunday's migration was accidentally applied to ComplyHub `gdwhlstfguxarnxasrrs` instead of Unicorn). Deployed this session via Studio SQL Editor.
- **private.cron_function_jwt() helper**: deployed this session. SECURITY DEFINER, SET search_path = '', reads `vault.decrypted_secrets WHERE name = 'cron_function_jwt'`. EXECUTE granted to `supabase_read_only_user`.
- **Ownership wall — root cause confirmed**: Jobs 1 and 2 are owned by `supabase_read_only_user`. All direct rotation paths exhausted and failed:
  - `cron.alter_job()` via MCP → `permission denied for function alter_job`
  - `UPDATE cron.job` via MCP → `permission denied for table job`
  - Studio Cron Jobs UI → blocked (ownership check)
  - `cron.alter_job()` via Studio SQL Editor as `postgres` → `Job 1 does not exist or you don't own it`
  - `UPDATE cron.job` via Studio SQL Editor as `postgres` → `permission denied for table job`
  - Lovable migration with `UPDATE cron.job` → same `permission denied` (migration runner is `postgres`)
  - Lovable migration with `cron.alter_job()` → same ownership error
- **postgres is not a superuser**: confirmed via `SELECT usesuper FROM pg_user WHERE usename = current_user` → `false`. The actual superuser is `supabase_admin`, inaccessible to project owners.
- **Lovable migration runner runs as `postgres`**: confirmed — jobs 8 and 9 were created with `username = postgres`. This also confirmed the migration runner cannot unschedule or alter jobs owned by `supabase_read_only_user`.
- **MCP in read-only mode**: `apply_migration` blocked throughout. All DDL applied via Studio SQL Editor.

## What shipped

- `private` schema on Unicorn 2.0-dev (PUBLIC revoked, usage granted to `postgres`, `service_role`, `supabase_read_only_user`).
- `private.cron_function_jwt()` — vault-backed JWT helper, SECURITY DEFINER.
- Cron jobs 8 and 9 — vault-backed replacements for jobs 1 and 2, owned by `postgres`, active on the same schedules.

## What remains open

- ComplyHub cleanup: drop `private.cron_function_jwt()` and `private` schema from `gdwhlstfguxarnxasrrs`. Safe to do any time; confirm no other objects exist in `private` on ComplyHub before dropping.

## Resolution path (completed 2026-05-12)

Supabase support transferred ownership of jobs 1 and 2 from `supabase_read_only_user` to `postgres`. Once owned by `postgres`, a Lovable migration (`remove_legacy_cron_jobs`) called `cron.unschedule('generate-notifications-meetings')` and `cron.unschedule('generate-notifications-daily')` successfully.

Verification:
```sql
SELECT jobid, jobname FROM cron.job WHERE command LIKE '%eyJ%';
```
Result: 0 rows. P0 closed.

## Risk note

The hard-coded token is the project's **anon key**, not the service_role key. The anon key is already embedded in the client-side JavaScript bundle and is public-facing by design. The double-firing is idempotent (the edge function handles duplicate calls gracefully). Neither issue gates deployment.

## KB changes shipped

No KB changes this session.

## Codebase observations (read-only)

- `unicorn-cms-f09c59e5` @ `42ba7327` (Updated the AI tool use) — pulled during this session.

## Decisions

No new ADRs.

## Open questions parked

- Whether `vault.cron_function_jwt` contains the correct current anon key — vault decryption not readable via MCP. Verify in Studio → SQL Editor: `SELECT left(decrypted_secret, 20) FROM vault.decrypted_secrets WHERE name = 'cron_function_jwt'` and compare against Studio → Settings → API anon key prefix.

## Tag

`audit-2026-05-11-cron-jwt-rotation-blocked`
