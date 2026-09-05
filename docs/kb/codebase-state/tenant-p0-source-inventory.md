# Tenant P0.1 Source Inventory

Generated: 2026-09-05T00:59:29.082Z

> This artifact is source evidence only. It does not connect to Supabase, execute SQL, or claim live authorization/metadata results.

## Request graph

| Source | Reads | RPCs | Write methods present |
|---|---|---|---|
| `src/pages/ManageTenants.tsx` | dd_lifecycle_status, dd_access_status, dd_status, connected_tenants, users, packages | — | delete, delete, upsert, delete, upsert, delete |
| `src/hooks/useTenantsBasic.ts` | tenants | — | — |
| `src/hooks/useTenantPackages.ts` | package_instances, packages | — | — |
| `src/hooks/useTenantContacts.ts` | tenant_users, users, dd_states | — | — |
| `src/hooks/useCscAssignments.ts` | tenant_csc_assignments, users | — | — |
| `src/hooks/useTenantNotes.ts` | notes, client_notes, tga_rto_summary | — | — |

Unique tables referenced: dd_lifecycle_status, dd_access_status, dd_status, connected_tenants, users, packages, tenants, package_instances, tenant_users, dd_states, tenant_csc_assignments, notes, client_notes, tga_rto_summary

## Visible contract fields

- `id`
- `name`
- `slug`
- `status`
- `lifecycle_status`
- `access_status`
- `risk_level`
- `created_at`
- `rto_id`
- `complyhub_membership_tier`
- `archived_at`
- `xero_invoice_paid`
- `xero_invoice_due_date`
- `xero_repeating_invoice_url`
- `member_count`
- `primary_contact_name`
- `state`
- `csc_user_id`
- `csc_name`
- `csc_avatar`
- `csc_archived`
- `package_name`
- `package_full_text`
- `package_id`
- `all_packages`
- `next_renewal_date`
- `last_note_date`
- `last_note_snippet`
- `hours_used_minutes`
- `hours_included_minutes`
- `registration_end_date`

## P0.1 observations

- useTenantsBasic selects tenants.* and requests range(0, 9999), so the first viewport is coupled to the full tenant row shape.
- Packages, contacts, CSC assignments, and notes are assembled through independent query hooks keyed by the full tenant-id set.
- Notes performs batched reads and subscribes to table-wide INSERT/UPDATE realtime events; this is a candidate for measured invalidation narrowing.
- ManageTenants contains connected_tenants upsert/delete write paths; P0 inventory records them but does not change them.
- The source inventory cannot establish table keys, policies, grants, triggers, statistics, or effective authorization; those remain live metadata evidence items.

## Evidence still required

- Live catalog inventory: keys, FKs, constraints, policies, grants, functions, triggers, views, realtime publications, and relation sizes.
- Signed tenant/client identity ledger with semantic domains, canonical targets, unmatched classifications, and migration dispositions.
- View/RPC contract catalogue and write-path dependency graph beyond the Manage Tenants source slice.

## Live metadata snapshot (read-only, 2026-09-05 UTC)

The Supabase catalog was queried directly with no writes. All 14 source-referenced tables have RLS enabled. The relevant primary keys are: `tenants.id`, `package_instances.id`, `packages.id`, `tenant_users.id`, `users.user_uuid`, `tenant_csc_assignments.id`, `notes.id`, `client_notes.id`, `tga_rto_summary.id`, `connected_tenants.id`, `dd_status.code`, and the `id` keys on the remaining lookup tables. Estimated row counts were: `tenants` 416, `users` 625, `tenant_users` 572, `tenant_csc_assignments` 137, `package_instances` 1,050, `packages` 32, `notes` 11,422, `tga_rto_summary` 59, and `connected_tenants` 64. `client_notes`, `dd_lifecycle_status`, and `dd_access_status` reported zero in `pg_class.reltuples`; those are estimates, not proof of emptiness.

The live foreign-key graph confirms the central identity joins (`tenant_users.tenant_id → tenants.id`, `tenant_users.user_id → users.user_uuid`, `tenant_csc_assignments.csc_user_id → users.user_uuid`, `package_instances.tenant_id → tenants.id`, `package_instances.package_id → packages.id`, `tenants.lifecycle_status → dd_lifecycle_status.value`, and `tenants.access_status → dd_access_status.value`). Policy counts were 4 on most source tables, 6 on `tenant_users`, and 7 on `users`; policy text/effective grants and view/RPC security still require the dedicated catalog pass.

This snapshot is Tier A evidence but is point-in-time and does not establish effective persona authorization. It must be refreshed at the start of P1 implementation and paired with the identity ledger and disposable persona tests.
