# Cron and Migration Inventory

> **Status:** M0 read-only inventory; no hosted state changed
>
> **Captured:** 2026-09-07
>
> **Evidence:** production Supabase project `yxkgdalkbrriasiyyrwk`, persistent
> preview branch `tenant-isolation-qa` (`iqichbimamlyjpaguddl`), repository
> `origin/main@b5c79c9b4`
>
> **Machine-readable companion:**
> [cron-and-migration-inventory-2026-09-07.json](cron-and-migration-inventory-2026-09-07.json)

## Executive result

Production has 27 active cron jobs. The current schedule is not uniformly
healthy:

- jobs 4, 5 and 6 are a legacy audit-reminder path; job 6 fails because its
  function inserts into the removed `notification_schedule.payload` column,
  while jobs 4 and 5 can report a successful SQL invocation without proving
  that a notification was delivered;
- jobs 20 and 21 invoke successfully but their forecast tables contain zero
  rows;
- job 15 writes stage-health rows, but all 357,471 rows have
  `progress_percentage = 0`; and
- job 14 writes workload snapshots, but its burn-forecast table is empty.

The persistent QA branch is not a safe replay target yet. It has 17 applied
migrations, no installed `pg_cron` extension or `cron` schema, and fails at
`20260714074920_enable_retention_and_risk_forecast_cron.sql`. That migration
contains production URLs. Enabling `pg_cron` in QA before migration cleanup
could cause QA schedules to invoke production Edge Functions.

## Production cron matrix

Run counts below are from `cron.job_run_details` for the 30 days ending on the
capture date. For HTTP jobs, `succeeded` means that `pg_net` accepted the
request; it is not an application-level success assertion.

| ID | Job | Schedule | 30d runs | Failed | Latest evidence | Disposition |
|---:|---|---|---:|---:|---|---|
| 3 | `seed-compliance-tasks-nightly` | `0 2 * * *` | 30 | 8 | 22 recent successes; older failures used an invalid `system_job_runs` status | Keep; monitor |
| 4 | `audit-24hr-confirmation` | `0 21 * * *` | 30 | 0 | Legacy function writes obsolete `notification_schedule.payload` if a matching appointment exists | Retire or migrate |
| 5 | `audit-evidence-reminders` | `0 22 * * *` | 30 | 0 | Legacy function filters `evidence_requests.status = 'sent'`; successful SQL invocation does not prove delivery | Retire or migrate |
| 6 | `audit-flag-overdue-chcs` | `0 0 1 * *` | 1 | 1 | Fails: `notification_schedule.payload` does not exist | Retire after owner confirmation |
| 8 | `generate-notifications-meetings-v2` | `0 * * * *` | 720 | 0 | Current notification generator | Keep |
| 9 | `generate-notifications-daily-v2` | `5 0 * * *` | 30 | 0 | Current notification generator | Keep |
| 10 | `process-notification-outbox` | `*/5 * * * *` | 8,640 | 0 | Current outbox processor | Keep |
| 11 | `sync-outlook-calendar-every-30min` | `*/30 * * * *` | 1,440 | 0 | Current calendar sync | Keep |
| 12 | `close-stale-preview-sessions` | `0 */4 * * *` | 180 | 0 | Current impersonation-session maintenance | Keep |
| 13 | `reclaim-stale-cohort-locks` | `*/5 * * * *` | 8,640 | 0 | Current lock maintenance | Keep |
| 14 | `run-workload-forecast-nightly` | `0 16 * * *` | 30 | 0 | 2,510 workload snapshots; burn forecast has 0 rows | Fix and add output health |
| 15 | `run-stage-health-monitor-nightly` | `0 15 * * *` | 30 | 0 | 357,471 snapshots; 0 non-zero progress values | Contain and fix |
| 16 | `email_tickets_flag_sla_breaches` | `*/5 * * * *` | 8,640 | 0 | Current ticket-SLA maintenance | Keep |
| 17 | `generate-notifications-reporting-obligations` | `15 0 * * *` | 30 | 0 | Current notification generator | Keep |
| 18 | `bulk-documents-reclaim-locks` | `*/5 * * * *` | 8,640 | 0 | Current bulk-document lock maintenance | Keep pending usage review |
| 19 | `bulk-documents-purge-items` | `15 3 * * *` | 30 | 0 | Current bulk-document retention maintenance | Keep pending usage review |
| 20 | `run-tenant-risk-forecast-nightly` | `0 13 * * *` | 30 | 0 | `tenant_risk_forecasts` has 0 rows | Repair or retire |
| 21 | `run-retention-forecast-nightly` | `0 14 * * *` | 30 | 0 | `tenant_retention_forecasts` has 0 rows | Repair or retire |
| 22 | `reconcile-invite-delivery-status` | `*/20 * * * *` | 2,160 | 0 | Current invitation reconciliation | Keep |
| 23 | `send-action-item-due-reminders-nightly` | `0 20 * * *` | 30 | 0 | Current action-item reminder path | Keep |
| 24 | `embed-ask-viv-corpus-incremental` | `*/30 * * * *` | 1,440 | 0 | Current Ask Viv ingestion | Keep |
| 25 | `embed-ask-viv-documents-incremental` | `*/30 * * * *` | 1,440 | 0 | Current Ask Viv ingestion | Keep |
| 26 | `portal-activity-digest-daily` | `15 0 * * *` | 30 | 0 | Current client timeline digest | Keep |
| 27 | `generate-ask-viv-faqs-daily` | `17 3 * * *` | 30 | 0 | Current Ask Viv FAQ generation | Keep |
| 28 | `xero-invoice-sync-all-every-6h` | `0 */6 * * *` | 120 | 0 | Current Xero invoice cache sync | Keep |
| 29 | `regulator-watch-check-weekly` | `0 4 * * 1` | 3 | 0 | Function is active; repository owner/reference not found | Ownership review |
| 30 | `bulk-generate-resume-stalled` | `*/2 * * * *` | 13,060 | 0 | Current stalled-job recovery | Keep |

## Data and function checks

### Forecast and health outputs

| Table | Rows | Latest generated value | Finding |
|---|---:|---|---|
| `stage_health_snapshots` | 357,471 | 2026-09-06 15:00 UTC | 0 rows with non-zero progress |
| `workload_snapshots` | 2,510 | 2026-09-06 16:00 UTC | Workload output exists |
| `tenant_risk_forecasts` | 0 | — | No forecast output |
| `tenant_retention_forecasts` | 0 | — | No forecast output |
| `tenant_package_burn_forecast` | 0 | — | No burn output |
| `evidence_gap_checks` | 0 | — | No gap-check output |

### Legacy notification path

The production `notification_schedule` table has no `payload` column. The
following `SECURITY DEFINER` functions still reference it:

- `audit_flag_overdue_chcs()` — currently fails when job 6 runs;
- `audit_send_24hr_confirmation()` — latent failure when a matching appointment
  exists; and
- `audit_send_evidence_reminders()` — uses a documented status mismatch and
  calls the email Edge Function directly.

`notification_schedule` is also referenced by the current
`process-notification-queue` Edge Function and `send-automated-email`; it is
not safe to drop as part of M2. `notification_audit_log` is written by the
current `process-notification-outbox` Edge Function even though no frontend
consumer was identified in this pass. Dropping either table requires a
separate dependency, retention and rollback review.

M2 read-only preflight confirmed the exact production jobs and their recent
run evidence before the corrective migration was authored. Jobs 4 and 5
reported `succeeded`/`1 row` but that only proves the SQL invocation completed;
job 6 failed on the missing `notification_schedule.payload` column. The M2
migration unschedules only the three exact job names and preserves all legacy
tables/functions for the later M3 decision.

## Migration replay inventory

The repository contains 1,539 migration files, of which 1,517 are non-rollback
files. Production reports 329 applied migrations; QA reports 17.

### Files containing environment-specific URLs

Fourteen migration files contain either the production project ref or a
`*.supabase.co` URL. The eight files after the QA failure point are the immediate
replay-safety queue:

```text
supabase/migrations/20260714074920_enable_retention_and_risk_forecast_cron.sql
supabase/migrations/20260727043013_action_item_notify_reminders.sql
supabase/migrations/20260803051036_ask_viv_corpus_ingestion.sql
supabase/migrations/20260803052814_ask_viv_documents_ingestion_cron.sql
supabase/migrations/20260804041038_ask_viv_suggested_faqs.sql
supabase/migrations/20260805063000_xero_invoice_sync_all_schedule.sql
supabase/migrations/20260815080000_cron_invoke_secret_header.sql
supabase/migrations/20260819234500_bulk_generate_stall_resilience.sql
```

Six earlier files contain the same pattern and must remain in the historical
audit queue. Historical migrations already applied to production must not be
rewritten casually.

### Files containing cron operations

Seventeen migration files contain `cron.schedule`, `cron.unschedule` or a
`pg_cron` assumption. Cron registration should move out of ordinary schema
replay and into a controlled, project-ref-aware deployment step.

The following origins are identified from the migration text:

| Migration | Jobs or operation |
|---|---|
| `20260217031153_00d3b571-8cd1-4654-9a9a-380d2f117844.sql` | job 3, `seed-compliance-tasks-nightly` |
| `20260428033759_a7b79724-3c60-4c72-9369-4dee643fb3df.sql` | temporary `validate-user-uuid-fks-offpeak` schedule and unschedule |
| `20260511230952_4babc47a-29f6-4aec-afc8-64ba31a03f8c.sql` | unschedules the predecessor notification jobs |
| `20260514233447_c6354641-3932-40da-90b6-716df2d99a3a.sql` | job 10, `process-notification-outbox` |
| `20260521032656_254d38e3-1cdc-49cc-a2fb-35edaeee4302.sql` | job 11, Outlook sync |
| `20260524233113_6d6c2df3-df44-4f9f-b4d2-d042c3d67698.sql` | job 12, stale preview sessions |
| `20260531025451_47ef503e-2ecd-4b75-879c-bfb3f5cbbf51.sql` | job 13, cohort locks |
| `20260617040107_54551699-c7b3-4f54-89b5-a03692cf5d2e.sql` | job 16, ticket SLA breaches |
| `20260714074920_enable_retention_and_risk_forecast_cron.sql` | jobs 20 and 21, tenant risk and retention forecasts |
| `20260727043013_action_item_notify_reminders.sql` | job 23, action-item reminders |
| `20260803051036_ask_viv_corpus_ingestion.sql` | job 24, Ask Viv corpus ingestion |
| `20260803052814_ask_viv_documents_ingestion_cron.sql` | job 25, Ask Viv document ingestion |
| `20260804041038_ask_viv_suggested_faqs.sql` | job 27, Ask Viv FAQ generation |
| `20260804060000_client_portal_page_view_tracking.sql` | job 26, portal activity digest |
| `20260805063000_xero_invoice_sync_all_schedule.sql` | job 28, Xero invoice sync |
| `20260815080000_cron_invoke_secret_header.sql` | jobs 22, 11 and 28 are re-scheduled with the invoke-secret header |
| `20260819234500_bulk_generate_stall_resilience.sql` | job 30, stalled bulk-generation recovery |

No current migration in the repository contains the creation of jobs 4, 5, 6,
8, 9, 14, 15, 17, 18 or 19. Their origin is therefore **unresolved** and
must be recovered from Supabase history, an older repository baseline, or
manual-console change history before retirement or replay cleanup.

### Named data-operation candidates

Twenty-nine post-2026-07-14 migration filenames explicitly identify a backfill,
seed, cleanup, duplicate merge/removal, requeue, archive or delete operation.
The filename is only a classification signal: each file must be inspected to
determine whether it executes DML immediately or only defines a later-called
function. The complete list is in the JSON companion.

## QA branch state

| Field | Value |
|---|---|
| Branch | `tenant-isolation-qa` |
| Project ref | `iqichbimamlyjpaguddl` |
| Branch id | `a3727ad5-3ea0-4189-9eab-ec60f2f420d6` |
| Parent | production `yxkgdalkbrriasiyyrwk` |
| Data copy | none (`with_data=false`) |
| Status | `MIGRATIONS_FAILED` |
| Applied migrations | 17 |
| `pg_cron` | not installed; `cron` schema absent |
| `pg_net` | installed |
| Required action | select replay-safe baseline/patch strategy before reset or rebase |

## M0 disposition and next packet

M0 is complete as an evidence pass. No job was unscheduled, no extension was
enabled, no migration was applied, and no production data was changed.

Next implementation order:

1. M1 — add the migration scanner and CI guardrail;
2. obtain product ownership decisions for jobs 4, 5, 6, 20, 21 and 29;
3. select the QA replay strategy; and
4. only then execute M2–M6 and unblock the live P1-C isolation suite.
