# M5 QA migration replay preflight — 2026-09-07

## Status

Read-only investigation complete; branch repair is intentionally blocked on a
replay-strategy decision.

## Evidence

Supabase branch `tenant-isolation-qa` has project ref
`iqichbimamlyjpaguddl`, branch id `a3727ad5-3ea0-4189-9eab-ec60f2f420d6`,
status `MIGRATIONS_FAILED`, and `preview_project_status=ACTIVE_HEALTHY`. The
branch migration ledger contains only 17 migrations through
`20260714074812_fix_research_jobs_stage_instance_id_type`. Production contains
329 migrations; the next unapplied migration is
`20260714074920_enable_retention_and_risk_forecast_cron`.

The failed migration assumes the `cron` schema/extension and embeds a
production Supabase URL. Replaying it unchanged could schedule QA to call
production. The preview health flag is therefore insufficient: the branch is
not migration-complete and is not yet safe for P1-C credentials.

## Safety boundary

No reset, rebase, migration-history mutation, extension enablement, service-role
secret injection, or schema/data write was performed. The production project
ref `yxkgdalkbrriasiyyrwk` remains outside the QA test target.

## Recommended decision

Prefer a clean schema baseline followed by environment-neutral migrations, with
cron registration moved to a controlled deployment step that defaults to no
schedules in QA/preview and rejects unapproved project refs. A replay-safe patch
to the existing failed branch is possible only after every skipped migration is
classified for backfill/data effects and the cron URL is removed or guarded.
Carl must approve one strategy before Supabase branch mutation.

## Follow-up

After approval, perform the selected branch operation, then verify migration
completeness, absence of cron jobs, absence of production URL references in
executed migration paths, and schema parity before adding any QA-only secret.
