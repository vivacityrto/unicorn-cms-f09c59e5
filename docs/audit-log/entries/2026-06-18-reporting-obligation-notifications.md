# Audit: 2026-06-18 — reporting-obligation-notifications

**Trigger:** Lovable production DB change session
**Scope:** New reporting obligation notification system — dd_* lookup tables, compliance_obligations schema extension, view refactor, edge function scope addition, cron job, Super Admin CRUD page. Client portal unchanged.

## Findings

- `compliance_obligations` was backed by raw `audience` / `recurrence` text columns with CHECK constraints, not dd_* lookup tables — inconsistent with project convention. Migrated in this session.
- `v_client_reporting_reminders` output was stable throughout all migrations (2,247 rows, 14 columns, identical schema pre and post).
- `user_notifications.dedupe_key` had two overlapping unique indexes (`user_notifications_dedupe_key_uq` non-partial + `user_notifications_dedupe_key_idx` partial). Non-partial is redundant. Flagged; deferred as optional Phase 3 cleanup — not blocking.
- `audit_events` schema (`entity text, entity_id uuid, action text, user_id uuid, details jsonb`) differs from what the implementation plan assumed. Broadcast audit rows mapped to existing schema: `entity='reporting_obligation'`, `entity_id=gen_random_uuid()`, obligation data in `details`.
- No application code read `compliance_obligations.audience` or `.recurrence` directly — all access was via the view. Drop of legacy text columns was clean.
- Cron job registered as jobid 17 at `15 0 * * *` UTC (~11:15 AEST), 10 minutes after existing `generate-notifications-daily-v2`.

## KB changes shipped

- No KB changes in this session.

## Codebase observations

- unicorn @ `6ff5b2df6bc2317ae0aa25ac49c6cc84ab45ab0a`: Phase 6 frontend shipped — 7 new files under `src/components/admin/reporting-obligations/`, `src/hooks/admin/`, and `src/pages/admin/settings/ReportingObligations.tsx`. Nav entry added under SYSTEM CONFIG in Settings sidebar.

## Decisions

- dd_* lookup tables for audience and recurrence: **yes** — migrated from CHECK constraints to `dd_obligation_audience` and `dd_obligation_recurrence` with standard read-all / vivacity-write RLS.
- Timezone for lead-time math: **AEST** (`now() AT TIME ZONE 'Australia/Sydney'`).
- `notification_message` semantics: **replaces** auto-generated text; falls back to `obligation.description` (truncated 1000 chars) if blank.
- Recipients: `relationship_role IN ('primary_contact','secondary_contact','user')`, `access_scope <> 'academy_only'`, test tenants excluded (`name ILIKE 'test%'`), `user_notification_prefs.obligations` honoured.
- Notification channels: **in-app only** (`user_notifications`, `type='reporting_obligation_due'`). No outbox.
- Auto-notification lead times: **[30, 14, 7, 1]** days (default per obligation; editable per obligation in Super Admin).
- Manual broadcast: **two-step** — Preview (returns tenant_count, user_count, sample list; no writes) then Send. Send disabled until preview fetched in current dialog session.
- No auto-deletion of `reporting_obligation_due` notifications.
- GTO deferred — `audience` enum covers `rto`, `cricos`, `rto_or_cricos` only.
- Admin location: Settings → Configuration → Reporting Obligations.

## Open questions parked

- Phase 3 (drop redundant `user_notifications_dedupe_key_uq` non-partial index) deferred — ship as a standalone cleanup migration when convenient.
- GTO audience type — no current tenants; add to `dd_obligation_audience` and `compliance_obligations` audience filter when the segment is ready.
- Functional UI QA (preview → broadcast flow end-to-end, notification appearing in client inbox) not yet run — must be verified against prod using QA test accounts on Test RTO A (7517) or Test RTO B (7546).

## Tag

audit-2026-06-18-reporting-obligation-notifications
