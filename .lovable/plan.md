## P1-b Batch 11b — RLS auth.uid() Subquery Optimization

Mechanical performance-only migration. Replaces bare `auth.uid()` with `(SELECT auth.uid())` in RLS policy USING/WITH CHECK expressions across t% tables (part 2) through `training_products`. No access-rule changes.

### Scope
~76 policies across 31 tables:
- `tenant_message_attachments` (5), `tenant_messages` (6), `tenant_notes` (2)
- `tenant_package_burn_forecast` (2), `tenant_profile` (4), `tenant_registry_links` (2)
- `tenant_relationships` (1), `tenant_retention_forecasts` (1), `tenant_review_sessions` (1)
- `tenant_risk_forecasts` (3), `tenant_rto_scope` (2), `tenant_sharepoint_reference_links` (2)
- `tenant_sharepoint_seed_runs` (1), `tenant_sharepoint_settings` (6), `tenant_support_inclusions` (3)
- `tenant_task_status` (3), `tenant_tier_capacity_config` (4), `tenant_users` (4), `tenants` (3)
- `tga_cache` (1), `tga_import_audit` (3), `tga_import_runs` (2), `tga_links` (4)
- `tga_rest_sync_jobs` (2), `tga_rto_acknowledgements` (5), `tga_rto_addresses` (2)
- `tga_rto_contacts` (2), `tga_rto_delivery_locations` (2), `tga_rto_flags` (5)
- `tga_rto_import_jobs` (1), `tga_rto_snapshots` (2), `tga_rto_summary` (2)
- `tga_scope_courses/qualifications/skillsets/units` (4), `time_entries` (4)
- `time_entry_allocations` (4), `time_entry_audit_log` (1), `trainer_matrix_extracts` (4), `training_products` (1)

### Execution
Single migration file `20260513_p1b_batch_11b_tenant_part2_through_training_products_auth_uid_subquery` applying the SQL exactly as supplied.

### Verification
Post-apply: confirm policy count unchanged and run Supabase linter to verify no new warnings.
