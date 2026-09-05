# Tenant P0.1 Live Catalog Snapshot

Captured: 2026-09-05 UTC through the read-only Supabase catalog tool.

This is a point-in-time Tier A snapshot. It is not a persona-authorization
test, and `pg_class.reltuples` values are planner estimates rather than exact
counts. The reproducible query is [`tenant-p0-catalog.sql`](../../../scripts/tenant-p0-catalog.sql).

## Source-referenced tables

All 14 source-referenced public tables have RLS enabled. Primary keys are:
`tenants.id`, `package_instances.id`, `packages.id`, `tenant_users.id`,
`users.user_uuid`, `tenant_csc_assignments.id`, `notes.id`, `client_notes.id`,
`tga_rto_summary.id`, `connected_tenants.id`, `dd_status.code`, and `id` on
the remaining lookup tables.

| Table | Estimated rows | Policy count |
|---|---:|---:|
| `tenants` | 416 | 4 |
| `users` | 625 | 7 |
| `tenant_users` | 572 | 6 |
| `tenant_csc_assignments` | 137 | 4 |
| `package_instances` | 1,050 | 4 |
| `packages` | 32 | 4 |
| `notes` | 11,422 | 4 |
| `tga_rto_summary` | 59 | 4 |
| `connected_tenants` | 64 | 4 |
| `client_notes` | `reltuples = -1` | 4 |
| `dd_lifecycle_status` | `reltuples = -1` | 4 |
| `dd_access_status` | `reltuples = -1` | 4 |

Exact read-only counts for the three `-1` estimates were: `client_notes` 22,
`dd_lifecycle_status` 4, and `dd_access_status` 2.

## Confirmed central foreign keys

- `tenant_users.tenant_id → tenants.id`
- `tenant_users.user_id → users.user_uuid`
- `tenant_csc_assignments.csc_user_id → users.user_uuid`
- `tenants.lifecycle_status → dd_lifecycle_status.value`
- `tenants.access_status → dd_access_status.value`

`package_instances` currently has no foreign key to either `tenants` or
`packages`; its relevant live constraints are `membership_state →
dd_membership_state.value` and `parent_instance_id → package_instances.id`.
This agrees with the tenant plan's existing §5.4 integrity finding and must
not be treated as authority to add a constraint.

Policy text/effective grants, views/RPC security, triggers, relation sizes,
identity ledger, and complete writer census remain open P0.1 work.
