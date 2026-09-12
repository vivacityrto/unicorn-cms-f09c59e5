# Tenant P0.1 Source-of-Truth Inventory

Generated: 2026-09-12 11:35 +08:00
Source baseline: `origin/main@b59c23d8e8805af4021ec29e1a4920103a255531`
Live catalog baseline: Unicorn 2.0 production Supabase project `yxkgdalkbrriasiyyrwk`, read-only MCP queries on 2026-09-12; the historical 2026-09-11 snapshot is labeled where retained

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

Observed evidence was collected by inspecting those files from `origin/main` and querying the production catalog with read-only `list_tables`, `execute_sql`, and advisor calls. The source-only extraction is reproducible with [`scripts/tenant-p0-inventory.mjs`](../../../scripts/tenant-p0-inventory.mjs), which covers this complete target list; the live catalog query is [`scripts/tenant-p0-catalog.sql`](../../../scripts/tenant-p0-catalog.sql). No row payloads or credentials are included here. Counts are current observations, not a promise that the live database is static.

### Statistics and Advisor window caveat

The live `pg_stat_statements_info.stats_reset` value was
`2026-07-15 03:55:10.476508+00`. Therefore any `pg_stat_statements` call
counts or execution totals are cumulative observations over that window, not
a normalized current-rate or release-to-release comparison. A bounded
2026-09-12 sample confirmed repeated PostgREST shapes against
`tenant_users`, `tenant_members`, `package_instances`, and
`connected_tenants`, but this packet does not use those counters as a
performance budget or optimization authorization. The Supabase security
Advisor read on the same date returned broad project findings, including
unrelated objects; it is recorded as a baseline/triage input, not as
deletion or remediation authority for this packet.

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
| `v_client_package_dashboard` | No direct caller; the page assembles its own package data | Owner `postgres`; `reloptions` is null (no `security_invoker` option observed); fresh check: `anon` and `authenticated` SELECT false | Raw view remains inaccessible to API roles; do not substitute it into the directory |
| `v_package_burndown` | No direct caller; package consumers use `get_package_burndown` | Owner `postgres`; `reloptions` null; fresh check: `anon` and `authenticated` SELECT false | Raw view remains inaccessible; use the tenant-gated RPC and do not restore direct view access |

The fresh definition review confirms the raw-view boundary remains unsafe for
direct API exposure: `v_client_package_dashboard` applies
`app.user_can_access_tenant` inside aggregate CTEs but has no tenant predicate
on its final `package_instances` SELECT, while `v_package_burndown` is filtered
only by `pi.is_complete = false` and has no caller-access predicate. Both are
ordinary views owned by `postgres` with no observed `security_invoker`
reloption. Direct `anon` and `authenticated` SELECT is now revoked on both;
the safe replacement is the separately gated `get_package_burndown` RPC (and
the existing guarded dashboard RPC), not reopening either raw view.

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

## P0.1 follow-up — repository writers, boundary review, and orphan classification

This follow-up was run from `origin/main@5fbf425c3efec6b4aaddf80ff8daf6a0babb4bce`.
The writer census used an independent repository scan of `.from('<table>')`
chains across `src/` and `supabase/functions/`, followed by manual inspection
of the direct writers and the live definitions below. It is a current-code
census, not a claim that historical migrations are runtime writers.

### Writer census

- `connected_tenants`: `ManageTenants.tsx` is the only runtime writer found
  (single/all `upsert`, disconnect `delete`).
- `package_instances`: direct UI writers include `ClientPackagesTab`,
  `PackageDataManager`, `RenewalConfirmDialog`, `StartPackageDialog`,
  `EditPackageDialog`, `PackageBuilderEditor`, and `TenantStatusDropdown`;
  Edge writers include `import-clickup-csv` and `import-unicorn1-client`.
- `tenants`: direct UI writers include `AddTenantDialog`, tenant-management
  dialogs/cards, `TenantStatusDropdown`, and the client-management hooks;
  Edge writers include `tenant-lifecycle`, `tga-rto-sync`, and the Xero
  invoice/webhook paths. The trigger graph therefore remains part of the
  authority review for any tenant-field contract.
- `tenant_identifiers`: `AddTenantDialog` is the direct runtime insert found;
  the normalization trigger remains the effective value-shaping side effect.
- `tenant_users`: `TenantUsersTab`/`TenantUsers` update or delete rows;
  `invite-user`, `provision-m365-user`, and `activate-ghost-user` insert or
  upsert them. This is shared RBAC/TOM ownership, not a Manage Tenants-only
  authority.
- `tenant_csc_assignments`: direct hook writers are
  `useClientCommunications` (upsert) and `useDocumentRequests` (insert), in
  addition to the assignment RPCs and bulk CSC RPC/Edge path.
- `notes`/`client_notes`: note editor/hooks and the `unlink-email` and
  dashboard seed functions write `notes`; `useClientManagementData` deletes
  `client_notes`. Client Health must preserve these as distinct stores.
- `tga_rto_summary`: only the TGA sync paths (`tga-rto-sync` and `tga-sync`)
  were found as runtime upsert writers.
- `packages` and `users` have broader builder/profile/admin writers and are
  not safe to infer from the Manage Tenants page. The `dd_*` tables were
  observed as lookup reads, not runtime writers, in this census.

### Live RPC and Edge authorization evidence

The live RPC review on 2026-09-11 found the following boundaries. All listed
functions are `SECURITY DEFINER` owned by `postgres`; ordinary authenticated
execution is granted unless noted.

The five security findings in the 2026-09-11 snapshot were remediated in merged PR
[#1185](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/1185), with
the corresponding audit entry linked from the program index. The fresh
post-remediation live check below supersedes the snapshot's open grant/body
questions for those four objects; the historical findings remain below as
evidence of why the remediation was required.

### Post-#1185 live verification (2026-09-12)

The read-only production check confirmed both remediation migrations are
present in `supabase_migrations.schema_migrations`:

- `20260911094010` — `fix_tenant_isolation_gaps_package_dashboard_burndown_start_transition_capacity`
- `20260911094544` — `lock_down_get_package_burndown_execute_grants`

The deployed routine and grant state is now:

- `get_package_burndown(p_tenant_id bigint, p_package_instance_ids bigint[])`
  is `SECURITY DEFINER`, executable by `authenticated` only among the API
  roles checked, and its body includes both `p_tenant_id` filtering and
  `app.user_can_access_tenant(p_tenant_id)`.
- `start_client_package(p_tenant_id bigint, p_package_id bigint,
  p_assigned_csc_user_id uuid)` and
  `transition_membership_state(p_instance_id bigint, p_new_state text,
  p_reason text)` are `SECURITY DEFINER`, authenticated-only among the API
  roles checked, use `auth.uid()`, and include the tenant-access gate before
  their writes.
- `get_tenant_user_capacity(p_tenant_id bigint)` is `SECURITY DEFINER`,
  authenticated-only among the API roles checked, uses `auth.uid()` through
  `has_tenant_access_safe`, and no longer exposes a caller-identity override
  parameter.
- Both raw views still exist, but `anon` and `authenticated` have no SELECT
  privilege on either. Their definitions remain non-tenant-filtered at the
  final/raw-view boundary, so they must not be treated as safe sources merely
  because direct grants are revoked.

This is a grant/definition verification, not a behavioral mutation test: no
write RPC was invoked and no production data or authorization state was
changed. The broad Supabase security-advisor output contains unrelated
findings and is not treated as evidence that these four targeted checks failed.

### Historical 2026-09-11 snapshot (superseded for the remediated objects)

- `admin_set_tenant_csc_assignment`, `admin_remove_tenant_csc_assignment`,
  `rpc_auto_assign_consultant`, the consultant-capacity routines, and
  `bulk_reassign_primary_csc` have explicit Super Admin, Vivacity-staff, or
  Super Admin/Team Leader checks as appropriate. The bulk Edge function only
  checks for an Authorization header, but its authenticated-only RPC enforces
  the actual role boundary.
- `check_tenant_duplicates`, `client_tga_link_set`,
  `client_tga_link_verify`, and `swap_tenant_user_to_contact` have explicit
  authentication/role or tenant-access checks. The latter is `anon`-executable
  at the catalog grant layer but still fails closed on a null caller; that
  grant should remain an RBAC/security review item rather than being treated
  as harmless.
- `start_client_package` is authenticated-executable and writes
  `package_instances` plus stage/task/document instances, but its live body
  contains no actor, tenant-access, or role check before the write. It records
  `auth.uid()` only in the audit row. This is a high-priority authorization
  gap for the RBAC/TOM owners; no caller-side gate is authoritative enough to
  promote this routine into a directory contract.
- `transition_membership_state` is also authenticated-executable and writes
  `package_instances`/tenant status, but its live body validates the target
  state and instance existence without an actor, tenant-access, or role check.
  It is an adjacent package writer, not a Manage Tenants action, and remains
  explicitly out of scope for a read-only packet.
- `get_client_tenant_users` and `get_tenant_user_capacity` are both
  `anon`-executable despite being `SECURITY DEFINER`. The former filters its
  result through a caller authorization CTE. The latter authorizes
  `COALESCE(p_caller_id, auth.uid())`, so a caller-supplied identity is part
  of the effective boundary; this needs an RBAC/security decision before any
  client-facing reuse.
- `get_client_package_dashboard` is a separate guarded RPC: its body calls
  `app.user_can_access_tenant` and intentionally sets `row_security=off`.
  That explicit helper gate is materially different from the two unsafe
  ordinary views above.
- Live Edge metadata and source were checked for the scoped boundaries:
  `tga-rto-preview` v665 (`verify_jwt=false`, no in-function caller gate),
  `tga-rto-sync` v694 (`verify_jwt=false`, in-function `requireCaller` plus
  tenant access), `tga-sync` v785 (`verify_jwt=false`, bearer validation plus
  `adminSystemConfig` permission), `bulk-reassign-team-member` v207
  (`verify_jwt=false`, header presence then guarded RPC),
  `lookup-unicorn1-client` v426 and `import-unicorn1-client` v439
  (`verify_jwt=false`, both in-function `requireCaller`), and
  `tenant-lifecycle` v526 (`verify_jwt=false`, in-function `requireCaller`).
  The preview endpoint is a pre-creation public RTO lookup; whether that
  intentional unauthenticated posture is acceptable is a product/security
  decision, not an assumption made by this packet.

### Read-only classification of unmatched rows

- Of the 25 `package_instances` rows whose tenant is absent, 24 are
  `is_complete=true`, `is_active=false`, `membership_state='complete'`, all
  created on 2026-03-03; one is still `is_complete=false`, `is_active=true`,
  and `membership_state='active'`. The two rows whose package is absent are
  separately `is_complete=true`, `is_active=false`, and `membership_state`
  `cancelled`, created in May/June 2026. The active tenant orphan is not safe
  to clean up automatically.
- All 57 orphaned `connected_tenants` rows still map to an existing user and
  have a nonblank stored tenant name. Fifty-five were connected before
  2026-01-01 and two from 2026 onward. This looks consistent with stale or
  historical workspace selections, but it is not proof of deletion intent;
  preserve them pending owner classification.
- The three orphaned `tga_rto_summary` rows have two `status='current'` rows
  and one null-status row; one lacks a registration end date. Their fetched
  timestamps are from January 2026. Current rows require a tenant-identity
  reconciliation before any cleanup or remapping.

A fresh read-only aggregate recheck on 2026-09-12 reproduced the same
classification counts: 27 package-instance/package orphans (24 completed
inactive tenant orphans, one active tenant orphan, and two missing-package
rows), 57 connected-tenant rows whose tenant is absent (all 57 still point to
an existing user; 55 predate 2026 and two do not), and three TGA summary
orphans (two current, one null-status, one missing registration end date).
This confirms the existing evidence has not drifted since the prior snapshot;
it does not turn any row into a deletion candidate.

### Realtime evidence

The production `supabase_realtime` and
`supabase_realtime_messages_publication` publications contain none of the
scoped tables in `pg_publication_tables`. Repository migration/source search
also found no current publication-maintenance statement that would reconcile
the `useTenantNotes` listener with live publication membership. A fresh
read-only query on 2026-09-12 again returned no rows for the scoped tables.
This remains a live operational gap, not a reason to change the publication
in this packet.

## Cross-initiative ownership and membership reconciliation

The remaining unresolved findings are tracked for explicit owner disposition
in the [TOM P0.1 owner-disposition checklist](../reference/tenant-operating-model/p0/p0-1-owner-disposition-checklist.md).

The four previously held view/RPC objects are handled in the post-#1185 live
verification above. This section does not re-open that security remediation;
it records only the independent TOM/RBAC/Client Health intersection for
membership, ownership, and notes.

### `tenant_users` versus `tenant_members`

TOM ADR-019 establishes `tenant_members` as the target canonical membership
ledger, with `tenant_users`' contact and relationship columns to migrate onto
that model. Current code is not yet on one ledger:

- `TenantUsersTab.tsx`, `TenantUsers.tsx`, `useTenantContacts`, and the
  Manage-Tenants source graph still read or write `tenant_users` for current
  contacts, relationship roles, position types, and primary/secondary flags.
- `useSeatLimits` reads active rows from `tenant_members` instead. The
  `invite-user` skip-email path mirrors a new association into both tables;
  `activate-ghost-user` explicitly upserts both tables. `provision-m365-user`
  still inserts only the Vivacity `tenant_users` association in its inspected
  path. These are different write contracts, not a proven one-to-one mirror.
- Read-only live counts show 936 `tenant_members` rows (559 active, 377
  inactive), 576 `tenant_users` rows, and 570 overlapping `(tenant_id,user_id)`
  pairs. `tenant_members` has 349 rows whose tenant no longer exists and no
  rows whose user is missing. Only 196 active `tenant_members` rows overlap a
  `tenant_users` pair; 363 active membership rows have no `tenant_users` row,
  while 380 `tenant_users` rows have no active `tenant_members` counterpart.

A fresh read-only aggregate on 2026-09-12 reproduced those membership counts:
936 `tenant_members` rows (559 active, 377 inactive), 349 tenant-orphan rows,
zero missing-user rows, and 576 `tenant_users` rows with 570 overlapping
pairs. Only 196 active membership rows overlap a `tenant_users` pair; the
remaining 363 active membership rows have no `tenant_users` row. Six
`tenant_users` rows have no membership overlap at all, and 380 have no active
membership counterpart; these remain part of the two-way divergence.

This is sufficient to rule out an implicit table swap or a count-based
directory contract. The 349 active-ledger tenant orphans and the two-way
active/inactive divergence need provenance and status decisions before a
backfill, cleanup, or authorization interpretation. RBAC must not infer
authorization from overlap alone; Client Health must not use either table as
an authoritative active-membership denominator until the crosswalk is owned.

### Field, lifecycle, and policy compatibility matrix

The following matrix is a current-contract comparison from the live catalog
and repository writers. It is not a proposed schema. `tenant_users` is the
relationship/contact ledger currently consumed by the client-facing flows;
`tenant_members` is the TOM target membership ledger currently consumed by
seat-limit and selected authorization paths. The two rows cannot be swapped
without an explicit mapping and rollout contract.

| Concern | `tenant_users` current contract | `tenant_members` current contract | Migration / owner gate |
|---|---|---|---|
| Row identity | `bigint` identity `id`; unique `(tenant_id,user_id)`; FKs to `tenants.id` and `users.user_uuid` | UUID `id`; unique `(tenant_id,user_id)`; FK to `users.user_uuid` only in the live catalog; no live FK from `tenant_id` to `tenants.id` was observed | TOM must choose whether the membership ledger receives a tenant FK and how the 349 tenant-orphan rows are handled; do not infer referential repair from the counts |
| Tenant/user keys | Required `bigint tenant_id`, required UUID `user_id` | Required `bigint tenant_id`, required UUID `user_id` | Key types align, but equal pair counts do not establish equal membership semantics |
| Role vocabulary | `role` is `parent` or `child`; client flows derive parent from primary/secondary contacts and child from user/academy relationship | `role` is `Admin` or `General User` | RBAC/TOM must ratify the mapping; current invite writers map primary/secondary to `Admin`, `user` to `General User`, and `academy_user` to `General User` with inactive status |
| Lifecycle/status | No membership `status` column; pending invitations live in `user_invitations`, while a created `tenant_users` row is the relationship record | `status` is `active`, `inactive`, or `pending`; live snapshot is 506 Admin/active, 329 Admin/inactive, 53 General User/active, 48 General User/inactive, with no observed `pending` rows | TOM must define whether pending is represented in this ledger or only in invitation records, and whether inactive means access-denied, historical, or a product-specific state |
| Invitation timestamps | No `invited_at`/`joined_at`; invitation lifecycle is external to the row | `invited_at` nullable, `joined_at` nullable default `now()`; all 936 live rows currently have `invited_at IS NULL` and `joined_at IS NOT NULL` | Existing timestamps do not prove invitation history; acceptance/backfill rules require an owner decision and evidence from `user_invitations`/activation flows |
| Contact relationship | `relationship_role` FK to `dd_relationship_role`; current values drive primary, secondary, full user, and academy-user behavior | No relationship/contact columns | TOM must decide where these fields live after ADR-019; Client Health must retain relationship provenance if it consumes contact or ownership signals |
| Contact flags | Nullable `primary_contact`, non-null `secondary_contact DEFAULT false`; trigger derives flags from `relationship_role` and prevents both flags being true | Not present | Do not map booleans by role alone without preserving the trigger's current precedence and null behavior |
| Access scope | Non-null `access_scope DEFAULT 'full'`, constrained to `full`/`academy_only`; parent plus `academy_only` is rejected | Not present | RBAC must own the target capability/scope resolver; a membership-row role cannot silently replace this plan/access distinction |
| Position type | Nullable `position_type` FK to `dd_position_type`; edited directly by `TenantUsers` and `TenantUsersTab` | Not present | TOM must assign this relationship attribute to the target model or a linked profile/contact relation before any move |
| Audit / side effects | INSERT/UPDATE/DELETE audit triggers capture role, access scope, relationship role, and contact flags; primary/secondary changes also synchronize `tenant_profile` | Only `BEFORE UPDATE` trigger sets `updated_at` | A table move must preserve both audit events and the secondary-contact profile synchronization, or explicitly replace them with an equivalent server path |
| Writer behavior | UI and Edge writers read/write this row directly; `invite-user` and `activate-ghost-user` also write the second ledger | `invite-user` and `activate-ghost-user` mirror selected role/status fields; `provision-m365-user` has an inspected path that writes only `tenant_users` | Writer inventory is not yet a synchronization guarantee; every writer needs a chosen source-of-truth and failure/rollback behavior |

The current invite mapping is evidence of implementation behavior, not a
ratified authorization mapping. In both `invite-user`'s direct-add path and
`activate-ghost-user`, `primary_contact` and `secondary_contact` become
`tenant_users.role='parent'` and `tenant_members.role='Admin', status='active'`;
`user` becomes `child` plus `General User/active`; and `academy_user` becomes
`child` plus `General User/inactive`. The email invitation path records the
pending invitation separately and does not populate `tenant_members.invited_at`
or `status='pending'`. This explains why the live rows cannot be read as a
complete invitation ledger and why the mapping must be tested against the
acceptance and activation flows before any backfill.

### Membership RLS, grants, and trigger boundary comparison

Both tables have RLS enabled and `relforcerowsecurity=false` in the live
catalog. The catalog also reports broad table privileges for `anon` and
`authenticated`; effective row access is therefore policy-driven, and the
base grant list must not be mistaken for an authorization contract.

The live policy boundaries differ materially:

- `tenant_users` SELECT permits the subject, a tenant parent, Super Admin, or
  Vivacity staff. Its INSERT and UPDATE paths are tenant-parent/Super-Admin
  scoped; DELETE is tenant-parent/Super-Admin scoped. The current catalog also
  contains an authenticated `tenant_users_restrict_scoped` ALL policy whose
  `USING` includes Vivacity staff while its `WITH CHECK` remains restricted to
  tenant parent/Super Admin; this is a policy-composition detail to preserve
  in any RBAC review.
- `tenant_members` SELECT permits the subject, Vivacity team, Super Admin, or
  a tenant admin. INSERT, UPDATE, and DELETE are Super Admin or tenant-admin
  scoped. There is no tenant-parent or contact-role predicate in the live
  membership policies.
- `tenant_members` has one `BEFORE UPDATE` `updated_at` trigger. `tenant_users`
  has the audit triggers plus `trg_sync_primary_contact` and
  `trg_sync_secondary_contact`; the latter recomputes the tenant profile's
  secondary-contact snapshot after inserts, deletes, and relevant updates.

Consequently, replacing a `tenant_users` read with `tenant_members` would
change both visible relationship data and the effective RLS boundary. A
replacement write would additionally need to account for audit rows, contact
flag derivation, tenant-profile synchronization, and the fact that current
tenant-admin/contact authorization is not equivalent to the current
tenant-membership policy. No RLS, grant, trigger, schema, or data change is
authorized by this evidence packet.

### CSC ownership is a relationship fact, not an authorization grant

The live assignment snapshot has 60 tenants with an open primary
`tenant_csc_assignments` row, while 88 tenants still have the legacy
`tenants.assigned_consultant_user_id` populated. The two representations differ
for 28 tenants; all open primary assignment rows map to an existing `users`
row. This independently confirms the TOM and Client Health plans' warning
that the legacy tenant column and assignment table cannot be silently treated
as interchangeable ownership sources. RBAC's approved broad staff-read
decision does not turn CSC assignment into a read-scope grant; sensitive
assignment writes remain a separate capability/relationship contract.

### Notes ownership boundary

The current Manage Tenants graph still reads both `notes` and `client_notes`,
while Client Health H0.1 characterizes notes/tasks separately and explicitly
requires source sensitivity, tenant authorization, and provenance to survive
into any analytical projection. The writer census remains split: note hooks,
editors, ClickUp-note persistence, and `unlink-email` write `notes`, while
`useClientManagementData` owns the observed `client_notes` delete path. No
cross-store collapse or “latest note” authority is introduced by this packet;
the existing browser merge remains current behavior only.

### Cross-initiative disposition

- TOM owns the current-to-target membership crosswalk and the canonical
  ownership/source-of-truth decision; this packet supplies evidence only.
- RBAC owns the capability/relationship interpretation. Current membership
  rows, CSC assignment rows, and connected-tenant rows must not be promoted
  into authorization scope without a named resolver and server-side target
  binding.
- Client Health owns analytical consumers and must retain source table,
  sensitivity, as-of time, ownership history, and authorization provenance;
  no health or engagement metric may use the divergent ledgers as if they
  were interchangeable.

The next safe step is owner review of this crosswalk and a separately scoped
ADR or evidence packet for the `tenant_users` → `tenant_members` migration
boundary. No migration, cleanup, RLS/grant change, authorization change, or
analytics projection is authorized here.

## Current evidence gaps and exit status

P0.1 is materially advanced but remains **in progress**, not complete:

1. The source-of-truth matrix now covers every displayed field, filter, action, and derived stat in the Manage Tenants surface, with explicit source/writer/security ownership or an unresolved flag.
2. The identity ledger covers every tenant/client/user identifier in the scoped source and the live rows most directly feeding the page. Orphan counts are recorded; no row is changed or classified by guess.
3. The view/RPC catalogue and write graph now include direct callers, server boundaries, security-definer status, grants, triggers, and the two directory-overlap views.
4. The repository writer census and the scoped RPC/Edge review are now
   materially attached. They found two adjacent `SECURITY DEFINER` writer
   gaps (`start_client_package` and `transition_membership_state`), an
   identity-parameter concern in `get_tenant_user_capacity`, and an ordinary
   view-boundary concern in both package views. These are findings for
   RBAC/TOM/security owners, not fixes authorized by P0.1.
5. The unmatched rows are classified by status, age, and linkage evidence,
   but remain untouched. The active package orphan and current TGA orphans
   need named owner decisions; the historical connected-tenant rows need a
   retention/cleanup policy, not an inferred delete.
6. The Realtime publication mismatch is confirmed and remains unreconciled.
7. The independent cross-initiative pass confirms that `tenant_users` and
   `tenant_members` are materially divergent live ledgers, and that the
   legacy consultant column differs from the open primary assignment table.
   These findings are now owned as TOM/RBAC/Client Health crosswalk inputs.
   The four reported view/RPC objects, plus the caller-identity RPC finding,
   were remediated in merged PR #1185 and the 2026-09-12 live check above
   confirms the deployed grants and relevant guards. The remaining cross-
   initiative findings are unchanged.
8. The post-#1185 live-verification gate is complete. P0.1 can close its
   evidence-gathering portion after the TOM/RBAC/Client Health owners review
   these findings and the remaining unmatched rows and membership crosswalk
   have explicit owners and dispositions. No P1 directory contract should
   proceed until those findings have those dispositions. No directory
   migration, RLS change, grant change, cleanup, or production-data
   correction is implied by this document.

**Audit entry:** none needed — this change is a read-only documentation inventory with no schema, RLS, trigger, grant, production-data, or user-visible behavior change.
