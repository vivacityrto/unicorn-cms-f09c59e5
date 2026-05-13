## Phase 3 — Create `v_workspace_audit_log` (SECURITY INVOKER, 20-table UNION ALL)

### Pre-flight verification (complete)

**1. All 20 tables exist in `public` schema** ✅

**2. Column existence — every column referenced confirmed present** ✅
Spot-checks of the trickier mappings:
- `ai_events.ai_event_id` (uuid) — PK is not `id` ✅
- `audit_client_impersonation` — no `action` column; synthetic `'impersonation_started'` literal used ✅
- `assistant_audit_log.client_tenant_id` (not `tenant_id`) ✅
- `process_audit_log.occurred_at` exists; aliased as `created_at` ✅
- `audit_invites.actor_user_id` is `text` (not uuid); regex guard converts to uuid or NULL ✅
- `engagement_audit_log.actor_user_uuid`, `audit_user_events.actor_user_uuid`, `audit_user_events.target_user_uuid` ✅
- `consultant_assignment_audit_log.created_by`, `consultant_capacity_audit_log.created_by` ✅
- `tga_import_audit.triggered_by`, `tga_import_audit.run_id` (uuid), `tga_import_audit.metadata` jsonb ✅
- `document_activity_log.metadata`, `portal_document_audit.metadata` jsonb ✅
- `audit_eos_events.entity`, `audit_eos_events.entity_id` (uuid → cast to text) ✅
- `eos_minutes_audit_log` / `eos_template_audit_log`: `change_summary`, `minutes_version_id` / `version_id`, `details` ✅
- `consultant_capacity_audit_log.assignment_method`, `weekly_assignable_hours`, `consultant_current_load`, `projected_remaining`, `over_capacity`, `candidate_snapshot`, `client_id` ✅
- `sharepoint_access_log`: `drive_id`, `item_id`, `file_name` ✅
- `meeting_sync_audit`: `meetings_created/updated/skipped`, `error_message` ✅

**3. View `public.v_workspace_audit_log` does not currently exist** ✅

**4. Type-unification for UNION ALL** — all explicit casts produce a consistent column signature `(uuid, bigint, uuid, text, text, text, text, jsonb, jsonb, jsonb, timestamptz)`. Two tables store `tenant_id` as `integer` (`audit_client_impersonation`, `time_entry_audit_log`) — `::bigint` cast handles both losslessly. ✅

**No column mismatches found. The view SQL is correct as written.**

### One small adjustment to statement ordering

The provided SQL has `REVOKE ALL ON public.v_workspace_audit_log FROM PUBLIC;` *before* `CREATE VIEW ...`. That would error — the view doesn't exist yet. The migration will reorder to:

1. `CREATE VIEW ... WITH (security_invoker = true) AS ...`
2. `REVOKE ALL ON public.v_workspace_audit_log FROM PUBLIC;`
3. `GRANT SELECT ON public.v_workspace_audit_log TO authenticated;`

No semantic change — same end state (PUBLIC has nothing, `authenticated` has SELECT).

### Migration

A single transactional migration containing the reordered DDL above (CREATE → REVOKE → GRANT) with the full 20-branch UNION ALL exactly as specified in the prompt body.

### Post-apply verification

1. `SELECT * FROM pg_views WHERE viewname = 'v_workspace_audit_log';` — confirms creation.
2. `SELECT relname, reloptions FROM pg_class WHERE relname = 'v_workspace_audit_log';` — confirms `security_invoker=on`.
3. `SELECT * FROM information_schema.role_table_grants WHERE table_name = 'v_workspace_audit_log';` — confirms only `authenticated` has SELECT, PUBLIC has none.
4. `EXPLAIN SELECT * FROM public.v_workspace_audit_log WHERE tenant_id = <X> ORDER BY created_at DESC LIMIT 50;` — confirms the Phase 1 + 2 indexes are picked up across branches.
5. `SELECT count(*) FROM public.v_workspace_audit_log;` — sanity.

### Notes / RLS

`security_invoker = true` means each underlying table's RLS applies as the calling user. Existing tenant RLS (via `get_current_user_tenant_id()` for staff, plus tenant scoping for non-staff) governs visibility per branch. The view itself does not need (and cannot have) its own RLS — it inherits.

`authenticated` GRANT only; `anon` and `public` are blocked.