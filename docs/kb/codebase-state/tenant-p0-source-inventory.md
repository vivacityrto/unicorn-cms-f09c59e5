# Tenant P0.1 Source-of-Truth Inventory

Generated: 2026-09-11 17:15 +08:00
Source baseline: `origin/main@debe29ee269070cfb43c0931d34bca6081495c16`
Live catalog baseline: Unicorn 2.0 production Supabase project `yxkgdalkbrriasiyyrwk`, read-only MCP queries on 2026-09-11

> This artifact is evidence, not authority. It records current frontend source and read-only live metadata. It does not create a directory contract, change authorization, repair unmatched rows, or authorize a schema/RLS/function/trigger/grant change.

## Scope and method

The source slice is `/manage-tenants` and its direct data and action dependencies:

- `src/pages/ManageTenants.tsx`
- `src/hooks/useTenantsBasic.ts`
- `src/hooks/useTenantPackages.ts`
- `src/hooks/useTenantContacts.ts`
- `src/hooks/useCscAssignments.ts`
- `src/hooks/useTenantNotes.ts`
- `src/hooks/useTenantCSCAssignment.tsx` (CSC dialog read/write path)
- `src/components/AddTenantDialog.tsx`
- `src/components/Unicorn1ImportDialog.tsx`
- `src/components/client/CSCQuickAssignDialog.tsx`
- `src/components/client/BulkReassignCscDialog.tsx`

Observed evidence was collected by inspecting those files from `origin/main` and querying the production catalog with read-only `list_tables`, `execute_sql`, and advisor calls. No row payloads or credentials are included here. Counts are current observations, not a promise that the live database is static.

## Request and dependency graph

| Caller | Reads / network calls | Writes or mutation boundary | Current contract / caveat |
|---|---|---|---|
| `ManageTenants.tsx` | `dd_lifecycle_status`, `dd_access_status`, `dd_status`, `connected_tenants`, `users`, `packages`; five hooks below; `auth.getSession()`; Realtime channels for `packages` and `tenant_csc_assignments` | `connected_tenants` upsert (single/all) and delete; child dialogs own tenant/CSC/import writes | Browser assembles the directory from one `tenants.*` query plus multiple child waves; direct page does not use a directory view/RPC |
| `useTenantsBasic` | `tenants.*`, ordered by `name`, `.range(0, 9999)` | none | Full-row transfer couples the page to the entire `tenants` row shape |
| `useTenantPackages` | Active `package_instances` by `tenant_id`; `packages` by collected `package_id` | none | Computes package list, earliest non-regulatory renewal, included minutes, and top-level used minutes in the browser; does not call `v_package_burndown` |
| `useTenantContacts` | `tenant_users` for member/primary rows; `users` for Admin-derived state and primary names; `dd_states` for labels | none | Four requests in two waves; primary contact is earliest `relationship_role='primary_contact'` row; state is first Admin user with a state code |
| `useCscAssignments` | Primary active `tenant_csc_assignments`; `users` for CSC profile | none | One primary assignment per tenant, `is_primary=true`, `ended_at IS NULL` |
| `useTenantNotes` | Batched `notes` and `client_notes`; `tga_rto_summary` | none | Most recent note across both tables; registration end from TGA summary; subscribes to `notes`/`client_notes` INSERT and UPDATE and invalidates the whole notes query |
| `useTenantCSCAssignment` | Current primary assignment and available CSC users | `admin_set_tenant_csc_assignment` / `admin_remove_tenant_csc_assignment` RPCs | RPCs are `SECURITY DEFINER`; current definitions require SuperAdmin, even though the page allows Team Leader UI access to the assignment dialog |
| `AddTenantDialog` | `packages`; `check_tenant_duplicates` RPC; `tga-rto-preview` Edge Function | Inserts `tenants` and `tenant_identifiers`; calls `start_client_package`, `client_tga_link_set`, `client_tga_link_verify`, `rpc_auto_assign_consultant`; invokes TGA sync and SharePoint provisioning Edge Functions | Creation is a multi-boundary workflow with trigger/RPC/Edge side effects; it is not part of a future directory read contract without separate characterization |
| `Unicorn1ImportDialog` | `lookup-unicorn1-client` Edge Function | `import-unicorn1-client` Edge Function | Legacy import path, not a direct table writer in this source slice |
| `BulkReassignCscDialog` | `users`; `compute_consultant_current_load` and `compute_consultant_weekly_capacity` RPCs | `bulk-reassign-team-member` Edge Function | Bulk mutation is outside the page's direct table writer graph and needs its own server-side contract evidence |

## Manage Tenants field and filter source-of-truth matrix

`ManageTenants.tsx`'s local `Tenant` shape is a display projection, not a database entity. The source/writer/security columns below describe current behavior only.

| Display field / behavior | Current source and derivation | Current writer / security evidence | Ownership and unresolved point |
|---|---|---|---|
| `id`, `name`, `slug`, `status`, `risk_level`, `created_at`, `rto_id`, `complyhub_membership_tier`, `archived_at`, Xero fields | `tenants.*` through `useTenantsBasic`; `id` is the join key for all child maps | `tenants` has PK `id`; current SELECT RLS uses academy membership, `app.user_can_access_tenant`, or Super Admin | TOM owns canonical tenant identity; `rto_id` is an external text identifier and is not evidence of a tenant mapping |
| `lifecycle_status` | `tenants.lifecycle_status`, defaulted in the browser to `'active'` if falsy; used for CSC filter counts | FK to `dd_lifecycle_status.value`; live trigger `trg_sync_tenant_lifecycle_status`; tenant UPDATE RLS is Vivacity/Super Admin | Do not silently replace the browser fallback until lifecycle null/legacy behavior is characterized |
| `access_status` | `tenants.access_status`, defaulted in the browser to `'enabled'` if falsy; retained in merged row but not a visible column | FK to `dd_access_status.value`; same tenant UPDATE boundary | Current UI and DB vocabulary need a TOM/RBAC contract before changing semantics |
| Status label/options | `dd_status` rows with `code >= 100`, ordered by code; raw `tenant.status` is compared to `dd_status.value` | Authenticated SELECT policy is `true`; write policies require Super Admin | `"live"` is a browser grouping, not a database value |
| Live cohort | Browser constant `LIVE_STATUSES = ['active','on_hold','In Arears','warning']`, and `!archived_at` | No independent server contract | The exact spelling/casing of `In Arears` is current behavior and must not be normalized during a read-model change |
| `member_count` | Count of `tenant_users` rows per tenant from `useTenantContacts` | `tenant_users` has FK `tenant_id -> tenants.id`; current SELECT permits member/self, tenant parent, Super Admin, and Vivacity staff paths | Count is relationship-row count, not necessarily active membership count; TOM/RBAC must decide any target contract |
| `primary_contact_name` | Earliest `tenant_users.relationship_role='primary_contact'` row by `created_at`, joined to `users.first_name/last_name` | `tenant_users` unique key is `(tenant_id,user_id)`; trigger `trg_sync_primary_contact`; RLS is tenant-scoped | “Earliest” is current UI behavior, not a declared canonical-primary rule |
| `state` | First Admin `users.state` per tenant, mapped through `dd_states.legacy_code -> label` | `users.tenant_id -> tenants.id`; `users` SELECT is role/tenant scoped | Admin-derived state and `dd_states.legacy_code` are compatibility semantics; do not promote them to canonical operating state without TOM evidence |
| `all_packages`, `package_name`, `package_full_text`, `package_id` | Active, incomplete `package_instances` joined to `packages`; first non-`KS` package is preferred for the headline, otherwise first package | `package_instances` SELECT uses `app.user_can_access_tenant` or Super Admin; live catalog has no FK from `package_instances.tenant_id` or `package_id` | 25 orphan tenant references and 2 orphan package references observed; classify before any aggregation contract |
| `next_renewal_date` | Earliest non-regulatory `package_instances.next_renewal_date` per tenant | Same package-instance SELECT boundary; package-instance triggers include renewal/default and timeline functions | Browser excludes `regulatory_submission` by `packages.package_type`; preserve explicitly if moved |
| `hours_included_minutes` | Sum of `included_minutes` or `hours_included*60` plus `hours_added*60` across active instances, including parents and children | Same package-instance SELECT boundary | Existing `v_package_burndown` is a separate live view and must not be assumed equivalent |
| `hours_used_minutes` | Sum of `hours_used*60` only for top-level instances; negative values are clamped to zero in the hook | Same package-instance SELECT boundary; trigger graph includes package/timeline functions | Parent-child rollup assumption is application behavior and needs parity evidence |
| `csc_user_id`, `csc_name`, avatar, archived flag | Primary, open-ended `tenant_csc_assignments` row joined to `users` | Assignment table has `csc_user_id -> users.user_uuid`; assignment RPCs enforce Super Admin; table SELECT permits tenant access/Super Admin | Current page UI exposes the dialog to Super Admin or Team Leader, but the RPC is the effective mutation gate |
| `registration_end_date` | `tga_rto_summary.registration_end_date` per tenant | TGA summary SELECT uses `has_tenant_access_safe`; writes are Vivacity-team-only | 3 orphan TGA summary tenant references observed; TGA linkage needs classification |
| `last_note_date`, `last_note_snippet` | Most recent timestamp/content across `notes` and `client_notes`; snippet is title/details/content truncated to 50 chars | Both tables have tenant-scoped RLS; timeline triggers fire on inserts; no live Realtime publication membership was observed for these tables | Notes and client notes are separate stores; Client Health H0 must consume this distinction rather than collapse it silently |
| Invoice display and money-at-risk | Direct `tenants.xero_invoice_paid`, `xero_invoice_due_date`, `xero_repeating_invoice_url`; overdue derived by `isXeroInvoiceOverdue` | Tenant row SELECT boundary; Xero timeline trigger on paid/due-date updates | Money-at-risk is a UI predicate, not a canonical risk score |
| Search | Case-insensitive substring over `name` or `slug`; search bypasses all other filters | Uses already-loaded tenant rows | A server directory contract must preserve search precedence or explicitly version a changed contract |
| Package filter | `all`, `complyhub` by `complyhub_membership_tier`, or exact `all_packages.id` | Derived from package and tenant rows | `complyhub_membership_tier` and package membership are distinct predicates |
| CSC filter | `all`, `unassigned` by null `csc_user_id`, or exact CSC UUID; options come from non-disabled `users` with `client_success` team fields | Users SELECT and assignment SELECT policies | Archived CSCs remain filterable for historical rows |
| Status / archive filters | `live` grouping or exact raw `tenant.status`; archived rows hidden unless Super Admin selects `status=all` and enables toggle | Frontend checks `isSuperAdmin` for archive toggle; DB still controls rows | The archive toggle is a UI gate, not an authorization boundary |
| Anniversary / registration-end filters | Date cutoffs over `next_renewal_date` and `registration_end_date`; nulls excluded | Derived display fields | Current month arithmetic and overdue comparison are behavior to preserve in golden results |
| Invoice-status filter | Paid/unpaid/not-linked are OR; recurring is an independent AND predicate | Derived from tenant Xero columns | Preserve combination semantics; do not treat it as a DB status domain |
| Sort and stats cards | Sort by raw status order, member count, created date, or renewal; cards calculate live count, renewals, arrears/Xero risk, registration windows, and member sum | Pure browser derivation | Stats are not authoritative health metrics; Client Health H0 should not inherit them as canonical scores |
| Tenant navigation and connect actions | Row link `/tenant/:id`; connection state from `connected_tenants` for current user and all other assignments | `connected_tenants` unique `(user_uuid,tenant_id)`; insert policy requires owner plus membership, delete permits self or Super Admin | Page's Team Leader connect gate is stricter than the table insert policy for a qualifying tenant member; record as a current policy/UI mismatch, not a fix here |

## Identity ledger

This is a structural ledger with live cardinality and unmatched counts. It is not a migration mapping or permission decision. “No FK” means the live catalog query found no declared FK, not that the values are necessarily invalid.

| Identifier | Source domain and type | Canonical target currently evidenced | FK / live observation | Disposition |
|---|---|---|---|---|
| `tenants.id` | Canonical tenant row, `bigint` PK | `tenants.id` | PK; 416 live rows | Canonical tenant key for this slice |
| `tenant_users.tenant_id` | Membership, `bigint` | `tenants.id` | FK present; 576 rows, 0 unmatched | Strong current mapping |
| `tenant_users.user_id` | Membership subject, `uuid` | `users.user_uuid` | FK present; 576 rows, 0 unmatched | Strong current user mapping; relationship role remains a separate contract |
| `package_instances.tenant_id` | Package/service instance, `bigint` | Intended `tenants.id` | No FK; 1,052 rows, 25 unmatched | Unresolved historical/orphan classification; no mutation |
| `package_instances.package_id` | Package instance, `bigint` | Intended `packages.id` | No FK; 1,052 rows, 2 unmatched | Unresolved package-reference classification; no mutation |
| `tenant_csc_assignments.tenant_id` | CSC assignment, `bigint` | Intended `tenants.id` | No FK; 149 rows, 0 unmatched | Values map in current snapshot; constraint gap remains |
| `tenant_csc_assignments.csc_user_id` | CSC subject, `uuid` | `users.user_uuid` | FK present; 149 rows, 0 unmatched | Strong current mapping; mutation goes through admin RPCs |
| `connected_tenants.tenant_id` | User workspace connection, `bigint` | Intended `tenants.id` | No FK; 109 rows, 57 unmatched | Likely stale connection records, but classification is required before cleanup |
| `connected_tenants.user_uuid` | Acting user, `uuid` | `users.user_uuid` / auth user ID | No declared FK; 109 rows, 0 unmatched against `users` | Current values map; auth.users parity not established here |
| `notes.tenant_id` | Legacy/current note tenant scope, `bigint` | Intended `tenants.id` | No FK; 11,524 rows, 0 unmatched | Values map in current snapshot; legacy columns (`tenant_uuid`, `user_id`, `u1_userid`) remain separate domains |
| `client_notes.tenant_id` | Structured note tenant scope, `integer` | Intended `tenants.id` | No FK; 22 rows, 0 unmatched | Values map in current snapshot |
| `client_notes.client_id` | Legacy client identity, `text` | None established | No FK; not used by Manage Tenants query | Unknown/legacy alias; do not equate to `tenant_id` without mapping evidence |
| `tga_rto_summary.tenant_id` | TGA summary, `bigint` | Intended `tenants.id` | No FK; 68 rows, 3 unmatched; three duplicate unique constraints on `(tenant_id,rto_code)` | Unmatched rows and duplicate constraints require classification; no cleanup |
| `tenant_identifiers.tenant_id` | Canonical external identifier registry, `bigint` | `tenants.id` | FK present; 654 rows, 0 unmatched; normalization trigger | Strong current mapping for ABN/RTO identifier registry |
| `users.tenant_id` | User profile tenant association, `bigint` nullable | `tenants.id` | FK present; 555 non-null rows, 0 unmatched | Current profile association; not interchangeable with membership rows |
| `users.client_id` | Legacy profile client identity, `uuid` | `clients_legacy.id` | FK present | Legacy domain; not used by current Manage Tenants assembly |
| `tenants.rto_id` | External RTO identifier, `text` | Not established by this packet | No FK observed; `tga_rto_summary.rto_code` is a separate text domain | Keep as external identifier until TOM/TGA mapping evidence is signed off |

No `client_id` is used by the current Manage Tenants page or its five primary hooks. The live catalog nevertheless contains `client_notes.client_id` and `users.client_id`, so the identity ledger must retain those as separate legacy domains rather than infer a tenant mapping from the name alone.

## Live security, view, RPC, and dependency evidence

### Tables, RLS, grants, and Realtime

All scoped public tables have RLS enabled in the live catalog. `connected_tenants` and `package_instances` have `relforcerowsecurity=true`; the other scoped tables have RLS enabled but not forced. The exposed-table grants are broad (the catalog reports table privileges for `anon`/`authenticated` on most scoped tables), so effective access is determined by RLS policy predicates, not by the grant list alone.

The most relevant current policies are:

- `tenants` SELECT: academy membership, `app.user_can_access_tenant`, or Super Admin; INSERT/DELETE are Super Admin; UPDATE is Vivacity-team or Super Admin.
- `tenant_users` SELECT: self, tenant parent, Super Admin, or Vivacity staff; UPDATE is tenant parent or Super Admin; INSERT is tenant parent; DELETE is tenant parent or Super Admin.
- `users` SELECT: self, relevant tenant/CSC visibility, Vivacity team, or Super Admin. Restrictive UPDATE policies protect role, internal, global-role, superadmin-level, and tenant fields.
- `package_instances` SELECT: `app.user_can_access_tenant(tenant_id)` or Super Admin; writes are Super Admin.
- `tenant_csc_assignments` SELECT: Super Admin or `app.user_can_access_tenant`; writes are Super Admin.
- `notes` and `client_notes` use tenant-access helpers plus Vivacity/Super Admin paths; TGA summary SELECT uses `has_tenant_access_safe` and its writes are Vivacity-team-only.
- `connected_tenants` SELECT permits Super Admin, owner, or `user_in_tenant`; INSERT requires owner plus membership; DELETE permits owner or Super Admin.

The `supabase_realtime` publication exists but no scoped table in this packet appeared in `pg_publication_tables`. Therefore `useTenantNotes`'s Realtime listeners are source-intended behavior, not live publication evidence; this is an explicit P0.1 gap, not a reason to alter the publication.

### Views

| View | Current caller in this slice | Live security evidence | Disposition |
|---|---|---|---|
| `v_client_package_dashboard` | No direct caller; the page assembles its own package data | Owner `postgres`; `reloptions` is null (no `security_invoker` option observed); `anon` and `authenticated` have SELECT | Required effective-security review before reuse; do not substitute it into the directory |
| `v_package_burndown` | No direct caller; `useTenantPackages` reimplements a related calculation | Owner `postgres`; `reloptions` null; `anon` SELECT false, `authenticated` SELECT true | Required parity/security review before reuse; browser math is not proven equivalent |

### RPCs and Edge boundaries

The relevant live routines are `SECURITY DEFINER`, owned by `postgres`, and executable by `authenticated` and `service_role` (not `anon` in the observed grants):

| Caller | Routine / Edge boundary | Observed guard or open question |
|---|---|---|
| `AddTenantDialog` | `check_tenant_duplicates` | Requires non-null `auth.uid()` in the observed definition; reads identifier/tenant data under definer privileges |
| `AddTenantDialog` | `start_client_package` | Definer routine; observed body begins with package lookup and package-instance work; full actor/tenant guard must be reviewed before reuse as a server contract |
| `AddTenantDialog` | `client_tga_link_set` / `client_tga_link_verify` | Both require authentication; verify restricts to `SuperAdmin`/`Admin`; set assigns pending vs linked based on `global_role` |
| `AddTenantDialog` | `rpc_auto_assign_consultant` | Explicit `is_vivacity_team_safe(auth.uid())` check |
| `useTenantCSCAssignment` | `admin_set_tenant_csc_assignment` / `admin_remove_tenant_csc_assignment` | Explicit Super Admin check; audit `client_audit_log` writes are side effects |
| `BulkReassignCscDialog` | `compute_consultant_current_load` / `compute_consultant_weekly_capacity` | Definer routines; current caller is capacity preflight; full body/authorization evidence remains separate |
| `BulkReassignCscDialog` | `bulk-reassign-team-member` Edge Function | Server mutation boundary; source packet records invocation and tenant/user IDs but does not claim Edge authorization parity |
| `Unicorn1ImportDialog` | `lookup-unicorn1-client` / `import-unicorn1-client` Edge Functions | Legacy import boundary; separate Edge-function auth and writer census required |

## Write-path dependency graph

This graph covers direct writers and known server side effects reachable from the scoped UI. It intentionally does not claim to be a repository-wide writer census.

| Target | Direct writer from scoped surface | RPC/Edge writer | Trigger / side effect observed live | Current risk |
|---|---|---|---|---|
| `tenants` | `AddTenantDialog` INSERT | `import-unicorn1-client` may write through Edge boundary | Default Unicorn 1 ID, auto consultant assignment, lifecycle sync, RTO profile sync, package-added timestamp, overload alert, lifecycle/status/Xero timeline triggers | Creation has many hidden side effects; no directory mutation belongs in a read-contract PR |
| `tenant_identifiers` | `AddTenantDialog` INSERT | `check_tenant_duplicates` reads; normalization trigger writes normalized values | `normalise_identifier_before_upsert` | Canonical identifier registry is safer than `tenants.rto_id`, but adoption needs parity evidence |
| `connected_tenants` | `ManageTenants` single/all UPSERT; disconnect DELETE | none | `updated_at` trigger | 57 orphan tenant IDs and UI/DB gate mismatch require classification before redesign |
| `package_instances` | none directly | `start_client_package` | auto-enrol, org-type, timeline, stage seeding, renewal default, billing validation triggers | 25 orphan tenant IDs and 2 orphan package IDs; package math is not yet a safe contract |
| `tenant_csc_assignments` | none directly | `admin_set_tenant_csc_assignment`, `admin_remove_tenant_csc_assignment`, `bulk-reassign-team-member` | Assignment table has no observed tenant FK; assignment RPCs audit | Super Admin server gate must remain authoritative over page affordances |
| `tenant_users` | none in this Manage Tenants slice | none in these direct callers | audit and primary/secondary contact sync triggers | Shared RBAC/TOM ownership; not safe to redefine from this packet |
| `users` | none in this slice | RPC/Edge callers may update indirectly | audit, role/type/internal/full-name sync, tenant-status recalculation triggers | `users.tenant_id` is a profile association, not a replacement for membership |
| `notes` / `client_notes` | none in Manage Tenants | none in this slice | timeline triggers on INSERT; `updated_at` on client notes | No Realtime publication membership observed; Client Health H0 must preserve two stores |
| `tga_rto_summary` | none in Manage Tenants | TGA Edge/RPC paths outside the page | no direct trigger in scoped trigger query | 3 unmatched tenant IDs; preserve as unresolved |

## Current evidence gaps and exit status

P0.1 is materially advanced but remains **in progress**, not complete:

1. The source-of-truth matrix now covers every displayed field, filter, action, and derived stat in the Manage Tenants surface, with explicit source/writer/security ownership or an unresolved flag.
2. The identity ledger covers every tenant/client/user identifier in the scoped source and the live rows most directly feeding the page. Orphan counts are recorded; no row is changed or classified by guess.
3. The view/RPC catalogue and write graph now include direct callers, server boundaries, security-definer status, grants, triggers, and the two directory-overlap views.
4. The remaining P0.1 evidence gaps are: full repository-wide writer census for the same tables; full definitions/authorization review for every invoked Edge Function and RPC; classification of the 25 package-instance, 57 connection, and 3 TGA-summary unmatched rows; effective security review of both package views; and confirmation/reconciliation of the Realtime publication mismatch.
5. The next safe packet is evidence-only: attach the missing writer/function/publication evidence and have TOM/RBAC/Client Health owners review the matrix. No P1 directory contract, migration, RLS change, grant change, cleanup, or production data correction is implied by this document.

**Audit entry:** none needed — this change is a read-only documentation inventory with no schema, RLS, trigger, grant, production-data, or user-visible behavior change.
