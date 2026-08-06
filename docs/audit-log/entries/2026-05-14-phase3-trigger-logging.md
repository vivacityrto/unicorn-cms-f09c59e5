# Audit: 2026-05-14 — Phase 3 trigger-based logging

**Trigger:** Lovable production DB change session — Phase 3 of the audit log initiative (`unicorn-kb/codebase-state/audit-log-inventory.md`). Five entities had no write path to any audit table. Triggers were the remaining work after the `audit_user_events` table received its `tenant_id` column (NEW-006, 2026-05-13).
**Author:** Carl
**Scope:** Supabase project `yxkgdalkbrriasiyyrwk`. Five AFTER trigger functions + triggers, all SECURITY DEFINER with `SET search_path = ''`. No schema, RLS, or view changes.

---

## Background

Phase 1 (federated view) and Phase 2 (indexes) shipped earlier on 2026-05-14. Phase 3 covers the five entities that had no logging at all:

| Entity | Target table | Rationale |
|---|---|---|
| `tenant_users` | `audit_user_events` | Tenant membership join/leave events |
| `users` | `audit_user_events` | Profile created/updated/deleted |
| `client_audit_responses` | `client_audit_log` | RTO audit module — response lifecycle |
| `client_audit_findings` | `client_audit_log` | RTO audit module — finding lifecycle |
| `tenant_engagement_settings` | `audit_events` | Engagement feature toggle changes |

`audit_user_events` was chosen for `tenant_users` and `users` because it has a `target_user_uuid` column designed for user-entity events. `client_audit_log` was chosen for responses and findings because it is the existing domain log for the RTO audit module. `audit_events` was chosen for `tenant_engagement_settings` because it is the platform-level settings event table.

---

## Findings

- `audit_user_events.target_user_uuid` is NOT NULL — this blocks routing any non-user entity to that table. Responses, findings, and settings correctly route elsewhere.
- `client_audits` uses `subject_tenant_id` as its tenant column, not `tenant_id`. Migration 4's initial function body used `ca.tenant_id`, which caused `ERROR: 42703: column ca.tenant_id does not exist` on the first smoke test. Fixed via `CREATE OR REPLACE FUNCTION` before proceeding.
- `audit_events` schema differs from the other audit tables: the entity type column is `entity` (not `entity_type`), the actor column is `user_id` (not `actor_id`), and there is no `tenant_id` column. `tenant_id` was stored inside the `details` jsonb.
- `client_audit_findings` has no `title` column — the NOT NULL columns are `summary`, `priority`, and `is_auto_generated`. The smoke test INSERT was corrected accordingly.
- `tenant_engagement_settings` had 0 rows at time of verification — the UPDATE-based smoke test returned count=0 (no rows to update). Re-tested via INSERT which correctly fired the `settings_created` trigger. Count=1 confirmed.
- `client_audit_sections.id` is uuid, not bigint — an intermediate smoke test for Migration 4 used `DECLARE v_section_id bigint` and failed. Corrected to uuid.

---

## DB changes shipped

All applied via Lovable migration tool to `yxkgdalkbrriasiyyrwk`:

| Migration | Function | Trigger(s) | Target table | Actions logged |
|---|---|---|---|---|
| 1 | `fn_audit_tenant_users` | `trg_audit_tenant_users_insert` | `audit_user_events` | `user_joined` (INSERT only) |
| 2 | `fn_audit_users` | `trg_audit_users_insert`, `trg_audit_users_update`, `trg_audit_users_delete` | `audit_user_events` | `profile_created`, `profile_updated`, `profile_deleted` |
| 3 | `fn_audit_client_audit_responses` | `trg_audit_client_audit_responses` | `client_audit_log` | `create`, `update`, `delete` |
| 4 | `fn_audit_client_audit_findings` | `trg_audit_client_audit_findings` | `client_audit_log` | `create`, `update`, `delete` |
| 5 | `fn_audit_tenant_engagement_settings` | `trg_audit_tenant_engagement_settings_insert`, `trg_audit_tenant_engagement_settings_update` | `audit_events` | `settings_created`, `settings_updated` |

All functions: `SECURITY DEFINER`, `SET search_path = ''`, fully schema-qualified table references.

Migration 5 only fires on UPDATE when `OLD IS DISTINCT FROM NEW` — no-op updates do not produce log rows.

---

## Verification

All five migrations verified via `pg_trigger`, `pg_proc`, and smoke tests:

| Migration | Trigger enabled | SECURITY DEFINER | search_path='' | Smoke test |
|---|---|---|---|---|
| 1 | ✅ | ✅ | ✅ | count=1 ✅ |
| 2 | ✅ | ✅ | ✅ | count=1 (real UPDATE, not no-op) ✅ |
| 3 | ✅ | ✅ | ✅ | count=1 ✅ |
| 4 | ✅ (after fix) | ✅ | ✅ | count=1 ✅ |
| 5 | ✅ | ✅ | ✅ | count=1 (via INSERT; table was 0 rows) ✅ |

---

## KB changes shipped

None this session. `unicorn-kb/codebase-state/audit-log-inventory.md` Phase 3 status should be updated to "complete" — deferred to KB hygiene pass.

---

## Codebase observations (read-only)

- `unicorn-cms-f09c59e5 @ a171ca97`: No codebase changes in this session. All changes are at the DB trigger layer. Frontend callers writing to `client_audit_responses` and `client_audit_findings` will now produce log rows automatically with no code changes.

---

## Decisions

- **`tenant_users` INSERT-only**: Only `user_joined` is logged. No DELETE trigger — membership removal is already captured by existing `audit_client_impersonation` and related flows. Separate session if a `user_left` event is needed.
- **`users` UPDATE fires on any column change**: No column-level WHEN guard applied. Profile updates are infrequent enough that row volume is not a concern.
- **`tenant_engagement_settings` UPDATE guard**: `WHEN OLD IS DISTINCT FROM NEW` applied — prevents no-op UPDATE calls from producing spurious log rows.
- **`tenant_id` in `audit_events.details`**: `audit_events` has no `tenant_id` column. Stored in details jsonb as `details->>'tenant_id'`. Acceptable for an ops-diagnostic table; no structural change to `audit_events` warranted.
- **Migration 4 bug fixed in-session**: Rather than leaving a broken trigger, a `CREATE OR REPLACE FUNCTION` migration was applied immediately after the smoke test failure. No data loss risk — the table had no un-logged rows from the broken period.

---

## Open questions parked

- **KB update**: `audit-log-inventory.md` Phase 3 status needs updating to "complete".
- **`tenant_users` DELETE trigger**: `user_left` event not logged. Low priority — no current consumer for that event.
- **`audit_events.tenant_id` column**: Long-term, adding a first-class `tenant_id` column to `audit_events` would simplify queries. Deferred — requires a migration and view update.
- **`addin-auth-exchange` tenant population**: Edge function still does not populate `tenant_id` on `addin_opened` events. Separate session.
- **P1-c consult_* RLS**: Still blocked on Ask Viv edge function changes — 5 tables excluded from P1-b.
- **TICKET-008 error string sweep**: 11+ hooks with hardcoded error strings remain.

---

## Tag

`audit-2026-05-14-phase3-trigger-logging`
