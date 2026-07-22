## Backfill 27 migration files from `supabase_migrations.schema_migrations`

Pure git-history reconciliation. No SQL will be executed against the database — every listed version is already applied in production. The task is to fetch each version's `statements` column verbatim and write it to the corresponding file under `supabase/migrations/`.

### Approach

1. For each of the 27 versions, run a read-only query:
   ```sql
   SELECT statements FROM supabase_migrations.schema_migrations WHERE version = '<version>';
   ```
   `statements` is a `text[]`; write its elements concatenated as-is (joined with `;\n` between statements, matching the Supabase CLI's own on-disk convention) with **no reformatting, cleanup, or modification** of the SQL content itself.

2. Write each result to the exact target path listed in the request.

3. Preserve the two known historical quirks unchanged:
   - `20260715234853_l3_gate_tga_sync_cluster.sql`, and the relevant portions of `20260715235839_l3_gate_document_ai_cluster.sql` (`upsert_excel_template_bindings`) and `20260716000201_l3_gate_remaining_utility_functions.sql` (`stall_bulk_document_job`) — backfill the original gate content as-recorded. The 22 Jul supersede fix already exists in git and remains untouched.
   - `20260715233351_l3_harden_release_audit_report_rpc.sql` — add alongside the existing earlier same-day file `20260715080600_release_audit_report_caller_gate.sql`. That existing file is not touched.

4. Do not run migrations, do not lint, do not modify any other file.

### Files created (27)

```
supabase/migrations/20260714031339_add_is_retrospective_to_client_audits.sql
supabase/migrations/20260714031635_a1_auto_generate_evidence_request_on_audit_scheduling.sql
supabase/migrations/20260714033012_validation_tool_sprint1_register_and_schedule.sql
supabase/migrations/20260714033414_validation_tool_sprint2_methods_and_sessions.sql
supabase/migrations/20260714033900_validation_tool_sprint3_pilot_and_portal_intake.sql
supabase/migrations/20260714070905_fn_package_used_minutes_helper.sql
supabase/migrations/20260714070914_backfill_null_package_instance_id_from_package_id.sql
supabase/migrations/20260714071007_backfill_remaining_orphan_time_entries_via_package_template_id_v2.sql
supabase/migrations/20260714071033_fix_recalc_hours_used_trigger.sql
supabase/migrations/20260714071041_backfill_hours_used_all_package_instances.sql
supabase/migrations/20260714071137_exclude_carry_over_from_used_minutes_calc.sql
supabase/migrations/20260714071256_fix_package_burndown_and_time_summary_views_v2.sql
supabase/migrations/20260714071319_fix_rpc_get_package_usage.sql
supabase/migrations/20260714074601_fix_v_package_time_summary_security_invoker.sql
supabase/migrations/20260714074812_fix_research_jobs_stage_instance_id_type.sql
supabase/migrations/20260714074920_enable_retention_and_risk_forecast_cron.sql
supabase/migrations/20260715035656_revoke_users_personal_contact_columns_c2.sql
supabase/migrations/20260715060008_retire_dead_accept_invite_m1.sql
supabase/migrations/20260715061352_widen_rpc_set_client_account_status_client_parent_m3.sql
supabase/migrations/20260715233351_l3_harden_release_audit_report_rpc.sql
supabase/migrations/20260715233813_l3_revoke_orphaned_audit_functions.sql
supabase/migrations/20260715233915_l3_gate_audit_workflow_functions.sql
supabase/migrations/20260715234853_l3_gate_tga_sync_cluster.sql
supabase/migrations/20260715235328_l3_gate_eos_meetings_cluster.sql
supabase/migrations/20260715235552_l3_gate_document_ai_cluster.sql
supabase/migrations/20260715235839_l3_gate_templates_packages_cluster.sql
supabase/migrations/20260716000201_l3_gate_remaining_utility_functions.sql
```

### Verification

- Confirm all 27 files exist at the exact paths above.
- Spot-check a few files against the `statements` array they came from to confirm verbatim content.
- No DB writes, no `supabase--migration` calls, no other project files changed.

### Commit

All 27 new files as a single commit (I'll surface the file writes; you handle the actual git commit in your usual workflow since this sandbox can't run stateful git commands).
