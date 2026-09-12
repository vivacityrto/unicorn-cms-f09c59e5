# RBAC v6 — Packet P1-f: client-details capability semantics

> **Parent plan:** [RBAC v6 Authorization Implementation and Gate-Streamlining Plan](../../rbac-v6-authorization-implementation-plan-2026-09-01.md)
> **Inputs:** [P1-b draft classification](p1-b-draft-classification.md), [P1-d static enforcement ledger](p1-d-static-enforcement-ledger.md), [P1-e bundled-verb decomposition](p1-e-bundled-verb-decomposition.md), [Client Detail source](../../../../../src/pages/ClientDetail.tsx)
> **Program index:** [Program Index](../../program-index.md)
> **Status:** R2-b design approved 2026-09-12; source-backed contract preparation delivered; implementation remains separately gated
> **Source:** `origin/main@214368f173e126636f1d2aa21c6c0493a7f5dba8`
> **Owner:** RBAC v6 with TOM/product/security review for target and relationship semantics
> **Audit entry:** none needed — repository analysis only; no permission, role, grant, RLS, RPC, Edge, credential, or production change

## Decision

Keep one canonical action for ordinary client-profile editing:

```text
clients.details.edit
```

Do not preserve `limited` and `full` as different meanings for this row.
The only observed gate is
`src/pages/ClientDetail.tsx:263`:

```text
usePermission('clients.details.edit', 'limited')
```

The ordinal permission check makes `full` and `limited` equivalent at that
call site. There is no second call site that demonstrates a distinct
field-level or workflow-level behavior. Inventing a second level now would
encode an intention that the current application does not implement.

The important refinement from the source audit is boundary, not level:
`clients.details.edit` should authorize the ordinary profile-edit contract,
not every mutation rendered on the Client Detail page. Scope and relationship
remain separate authorization dimensions.

## Why a page-wide permission is the wrong target

`ClientDetail.tsx` uses the one `canEdit` boolean in several unrelated places:

| Current consumer | Current behavior | Why it should not automatically inherit profile-edit semantics |
| --- | --- | --- |
| `ClientProfileForm` | edits tenant/profile fields through `useClientProfile.saveProfile` | This is the natural core of `clients.details.edit` |
| `ClientAddressSection` | inserts, updates, and soft-deletes `tenant_addresses`; seeds from TGA | Address lifecycle has its own data ownership and audit boundary |
| `CSCAssignmentSelector` | invokes `admin_set_tenant_csc_assignment` and `admin_remove_tenant_csc_assignment` | Assignment changes a staff-to-tenant relationship; TOM/RBAC semantics apply |
| `RiskLevelBadge` | calls `saveProfile({ risk_level })` | Risk classification may need Client Health ownership and stronger audit semantics |
| rename affordance | opens `RenameTenantDialog`, which rechecks `tenant_name_is_locked` server-side | Name authority is TGA-dependent and has a separate lock rule |
| Save button | triggers the profile form's pending save | Same ordinary profile-edit contract |
| `TenantLogoUpload` | uploads/deletes storage objects and updates `tenants.logo_path` | It is rendered without `canEdit`; storage and file ownership need a separate boundary |
| `TenantStatusDropdown` | updates `tenants.status` and may close open packages | It is rendered without `canEdit`; status/package effects are not ordinary profile edits |
| `TenantLifecycleActions` | uses existing `clients.activate`/`clients.deactivate` checks and `tenant-lifecycle` | Already a separate lifecycle capability family |

This means the current UI gate is a useful display affordance but not a
complete authorization contract. A future server cutover must not assume that
adding or checking `clients.details.edit` automatically secures all of these
children.

## Field and write-path inventory

### Ordinary profile-edit candidate

`useClientProfile.saveProfile` in
`src/hooks/useClientManagement.tsx:415-512` maps the form payload into two
tables and writes one audit event:

| Storage boundary | Fields observed in current save mapper | Candidate treatment |
| --- | --- | --- |
| `tenants` | `legal_name`, `rto_name` (from `trading_name`), `abn`, `acn`, `website`, `state`, `rto_id`, `cricos_id`, `lms`, `sms`, `accounting_system`, `risk_level`, plus `updated_at` | `clients.details.edit` candidate, subject to field-source and Client Health review |
| `tenant_profile` | `phone1`, `org_type`, `rto_email`, `gto_name`, `country`, `primary_contact_name`, `primary_contact_email`, `primary_contact_phone` | `clients.details.edit` candidate, subject to TOM/contact ownership review |
| `client_audit_log` | `client_profile_updated`, old/new payload, changed-field list | Required audit side effect; verify server atomicity before implementation |

The form also reads lookup tables (`dd_org_type`, `dd_sms`, `dd_lms`,
`dd_accounting_system`) and can copy contact details from `tenant_users` and
`users` through `handleSyncContact`. Those reads are not themselves edit
authority, but the identity/contact source-of-truth must be reconciled with
TOM before a golden row is approved.

The form disables TGA-sourced fields in the UI via
`ClientProfileForm.tsx:46-53`, but that is not a server authorization rule.
The future server contract must decide whether TGA-synced fields are
immutable to ordinary users, editable only through a registry workflow, or
editable with an explicit override/audit path.

### Separate or separately owned mutation candidates

| Candidate action family | Source evidence | Current boundary question |
| --- | --- | --- |
| `clients.addresses.manage` | `ClientAddressSection.tsx:111-183,244-282` reads `tenant_addresses`, seeds from `tga_rto_addresses`, inserts/updates rows, and soft-deletes by `inactive` | Is address management part of ordinary profile edit, or a distinct tenant-data capability? Confirm TGA authority, tenant scope, and negative case |
| `clients.csc_assignment.manage` | `useTenantCSCAssignment.tsx:95-145` invokes `admin_set_tenant_csc_assignment` / `admin_remove_tenant_csc_assignment`; `ClientDetail.tsx:526-531` passes the profile `canEdit` boolean | TOM owns assignment/relationship semantics; verify RPC caller and target checks before any reuse of the profile capability |
| `clients.risk_level.edit` | `ClientDetail.tsx:479-500` calls `saveProfile({ risk_level })`; Client Health owns the metric/provenance implications | Decide whether risk classification is ordinary metadata or a separately controlled operational signal |
| `clients.registry_links.manage` | `useClientProfile` methods `setTgaLink`, `verifyTgaLink`, and `updateRegistryLink` call `client_tga_link_set`, `client_tga_link_verify`, or upsert `tenant_registry_links` | TGA link initiation, verification, and unlink/status transitions have different authority; do not collapse them into profile edit |
| `clients.logo.manage` | `TenantLogoUpload.tsx:56-109` writes `client-logos` storage and `tenants.logo_path` | Identify storage RLS, audit, and intended operator scope; current page does not pass the profile gate |
| `clients.status.edit` | `TenantStatusDropdown.tsx:71-113` writes `tenants.status`, optionally closes open `package_instances`, and logs the change | Destructive package side effect requires its own capability and confirmation/rollback contract |
| `clients.activate` / `clients.deactivate` | `TenantLifecycleActions.tsx:20-58,73-78` uses existing capability checks and `tenant-lifecycle` Edge Function | Keep as the existing lifecycle family; do not alias it to profile edit |
| `clients.rename` | `RenameTenantDialog.tsx:65-101` rechecks `tenant_name_is_locked`, updates `tenants.name`, and writes `audit_events` | TGA lock and name authority need explicit server-side relationship proof |

These candidate names are not new active feature keys. They are the target
vocabulary for later product/security review. Existing keys must not be
renamed or split in production from this packet.

## Recommended target contract

1. Keep `clients.details.edit` as one action with no `limited`/`full`
   distinction.
2. Define its target as ordinary client-profile fields only, with an
   explicit field allowlist and tenant/resource scope resolved server-side.
3. Treat TGA-sourced fields as a separate source-of-truth decision; a disabled
   input is not sufficient protection.
4. Do not use `clients.details.edit` as the authorization predicate for
   lifecycle, status/package closure, CSC assignment, TGA verification,
   storage upload/delete, or broad risk operations without an explicit
   cross-initiative contract.
5. If product wants field-level separation later, introduce narrowly named
   capabilities only for a demonstrated need, such as a sensitive-field or
   risk-classification action. Do not create generic `limited`/`full` levels
   to stand in for field policy.
6. Preserve legacy UI behavior during migration, but make the server boundary
   authoritative before changing route or child-component gates. Unknown,
   cross-tenant, inactive-principal, and missing-context cases deny.

## Required evidence before implementation

The next implementation packet is not ready until it cites:

- the authoritative tenant/profile/address/contact source for every editable
  field;
- the exact target tenant and relationship resolver for profile, address, and
  assignment writes;
- server-side authorization for `tenants`, `tenant_profile`,
  `tenant_addresses`, `tenant_registry_links`, and the CSC RPCs;
- TGA-synced-field behavior and override/audit policy;
- positive and negative cases for an authorized staff persona, unauthorized
  staff persona, client persona, inactive principal, and cross-tenant target;
- audit atomicity and rollback behavior for profile and address writes; and
- owner sign-off from TOM for membership/assignment semantics and Client
  Health for risk/provenance semantics where those fields are included.

## Decision record

R2-b is approved for the design direction: one ordinary profile-edit action,
no inferred `limited`/`full` distinction, and no page-wide permission alias.
The remaining field ownership and server-boundary evidence is preparation
work, not permission to implement a migration, change an RPC, alter RLS,
deploy an Edge Function, or modify any live grant.

## Verification

This is a docs-only packet. Relevant checks are:

```text
node scripts/check-kb-links.mjs
node scripts/check-kb-doc-size.mjs
git diff --check
```

No frontend, Edge, migration, schema, authorization, credential, or live-QA
verification is applicable because no runtime source changed.
