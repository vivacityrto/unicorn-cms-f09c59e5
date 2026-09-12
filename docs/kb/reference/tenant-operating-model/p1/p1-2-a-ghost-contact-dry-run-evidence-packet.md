# TOM P1.2-a — ghost-to-contact dry-run evidence packet

> **Parent plan:** [Tenant Operating Model Data Architecture Plan](../../tenant-operating-model-data-architecture-plan-2026-09-02.md)
> **Program index:** [Program Index](../../program-index.md)
> **Related design packet:** [TOM P1.2 — ghost-user retirement and contact promotion scope](p1-2-ghost-user-retirement-contact-promotion-scope.md)
> **Status:** planning; read-only evidence contract only; no implementation or production mutation authorized
> **Owner:** TOM, with RBAC and Client Health review
> **Scope:** define the deterministic, idempotent report that must precede any ghost-profile contact projection
> **Dependencies:** [TOM P0.1 source inventory](../../../codebase-state/tenant-p0-source-inventory.md); P1.1 membership compatibility scope; invitation/auth contract; approved P1.2 lifecycle decisions
> **Exit criteria:** reproducible dry-run output schema, collision/quarantine rules, reconciliation totals, rollback evidence contract, and explicit production authorization gate
> **Evidence:** read-only source review and live counts recorded in P1.2 on 2026-09-12; no writes performed by this packet
> **Audit entry:** none needed — planning/read-only evidence contract; no production, schema, security, cron, or operational change

## Boundary and authority

This packet specifies what a future dry-run must report before any ghost
profile is projected into `tenant_contacts`. It does not provide authority to
insert contacts, alter `public.users`, update `tenant_users` or
`tenant_members`, send invitations, change RLS, deploy or retire an Edge
Function, or delete any live record.

The dry-run is a read-only snapshot. A future apply step must be a separate,
explicitly authorized migration or operational packet with its own audit
entry, execution identity, canary cohort, rollback owner, and observation
window. A report that looks internally consistent is not migration authority.

## Approved lifecycle decisions

The following decisions are treated as inputs to the dry-run contract:

| Decision | Approved behavior |
| --- | --- |
| Pending promotion presentation | Keep the contact visible with an explicit `Pending invitation` state and disable duplicate promotion. |
| Seat semantics | A pending promotion reserves a seat immediately; a plain contact does not. |
| Legacy profile retention | Retain the legacy `public.users` ghost profile until acceptance/relink and audit reconciliation are complete. |
| Historical relationship data | Preserve source UUID, role, relationship, status, and other relevant metadata in an audit/migration record; do not assign a relationship role or access scope to a pre-login contact. |
| Membershipless ghosts | Quarantine the 55 profiles without a reliable tenant membership for manual review; do not automatically convert them. |

These decisions do not authorize the future migration. They define the
expected classification and evidence shape if that migration is later
approved.

## Candidate source set

The report must begin from the stable identity predicate used by the current
application: a `public.users` profile for which the live `is_ghost_user`
security-definer predicate is true (a profile exists without a matching
`auth.users` identity). It must then independently join the two current
membership ledgers and invitation/contact relations.

The report must derive tenant association only from `tenant_users.tenant_id`
and/or `tenant_members.tenant_id`. A global email match is never sufficient to
assign a person to a tenant. A person associated with two tenants produces two
candidate tenant rows, even when the source profile UUID and email are the
same.

The candidate population is partitioned into:

1. **Membership-bearing candidates:** a ghost with at least one tenant row in
   either membership ledger. These are eligible for deterministic per-tenant
   classification, subject to collision and data-quality checks.
2. **Membershipless quarantine:** a ghost with no usable tenant association.
   These are reported, never silently attached to a tenant by email, domain,
   name, or a presumed home organization.
3. **Data-quality quarantine:** a membership-bearing row with no usable email,
   malformed email, conflicting identity fields, or an unresolvable tenant
   key. These require manual disposition before any apply step.

The report must read both ledgers even though P1.1 makes `tenant_members` the
future canonical membership/access authority. `tenant_users` carries current
contact and relationship data that must not be lost during compatibility
planning.

## Deterministic report grain and output schema

The primary report grain is one row per `(tenant_id, lower(trim(email)))` for
an eligible, membership-bearing ghost. Source UUIDs and source membership
rows remain attached as evidence fields; they do not change the candidate
grain. A separate source-membership detail section may contain one row per
`(tenant_id, source_user_uuid, source_membership_row)` when aggregation would
hide role or status conflicts.

Every report row must contain, or explicitly mark unavailable, the following
fields:

| Field | Purpose |
| --- | --- |
| `run_id`, `snapshot_at`, `source_commit` | Reproduce and identify the read-only snapshot. |
| `disposition` | `candidate`, `already_contact`, `pending_invite`, `collision`, `quarantine_no_tenant`, `quarantine_no_email`, `quarantine_conflicting_source`, or `manual_review`. |
| `tenant_id` | Tenant derived only from membership data. |
| `source_user_uuid` | Legacy profile UUID; retained for relink and reconciliation. |
| `normalized_email` | Lowercase, trimmed email used only for deterministic comparison. |
| `first_name`, `last_name`, `phone`, `job_title`, `position_type` | Contact projection inputs with source availability noted. |
| `tenant_users_rows`, `tenant_members_rows` | Counts and source row identifiers for each ledger. |
| `source_roles`, `source_relationship_roles`, `source_statuses`, `source_access_scopes` | Preserved relationship/access evidence; not copied into pre-login authorization. |
| `existing_contact_id`, `existing_contact_status`, `existing_contact_promoted_to_user_id` | Contact collision and idempotence evidence. |
| `pending_invitation_id`, `pending_invitation_status`, `pending_invitation_expires_at` | Pending-state and duplicate-invite evidence. |
| `collision_reason` / `quarantine_reason` | Human-readable reason for holdout. |
| `expected_future_action` | `project_contact`, `reconcile_existing_contact`, `retain_pending_state`, or `manual_review`. |

The report must not include access tokens, service-role keys, invitation
secrets, or unnecessary personal data beyond the fields required for the
approved reconciliation. Any exported artifact must have a controlled
location and retention owner.

## Classification and collision rules

Apply these rules in order, with the first applicable holdout taking
precedence:

1. **No tenant:** no usable membership-derived tenant ID →
   `quarantine_no_tenant`.
2. **No usable email:** null, blank, or invalid email →
   `quarantine_no_email`. Do not infer an email from a name or domain.
3. **Conflicting source identity:** multiple ghost profiles or source rows
   resolve to the same tenant/email but have incompatible names, profile
   identity, or relationship evidence → `quarantine_conflicting_source` or
   `manual_review`; never choose a winner implicitly.
4. **Existing active contact:** an active `tenant_contacts` row matches the
   same tenant and normalized email → `already_contact`. Do not create a
   duplicate. Preserve the existing contact ID and compare source metadata.
5. **Pending invitation:** a matching pending/sent `user_invitations` row →
   `pending_invite`. Keep the contact visible and do not send or create a
   second invitation. The future apply/reconciliation step must link or
   reconcile the existing pending state rather than duplicate it.
6. **Multiple source ghosts at one tenant/email:** → `collision` or
   `manual_review`, even if the fields appear similar. A deterministic merge
   policy needs separate approval.
7. **Otherwise:** → `candidate`, with `expected_future_action: project_contact`.

Archived contacts are not active collision targets, but they must remain in
the evidence so an apply packet can decide whether reactivation, a new active
row, or manual review is correct. A previously promoted contact is never a
new candidate.

## Idempotence and future apply contract

The dry-run itself must be safe to repeat: it performs only reads, uses a
stable snapshot timestamp, sorts by `(tenant_id, normalized_email,
source_user_uuid)`, and emits deterministic dispositions for unchanged input.
The report must expose both the candidate key and the source UUID so a later
run can distinguish an unchanged candidate from a source-data change.

The future apply packet, if separately authorized, must consume a frozen
`run_id` and candidate list rather than recomputing a different population
mid-write. It must make the unique `(tenant_id, contact-email)` policy
explicit, reconcile existing contacts and invitations before any insert, and
retain source UUID/role/status evidence under a durable audit or migration
batch identifier. It must not delete or rewrite the source ghost profile as
part of contact projection.

No runnable DML is included here. In particular, a future use of conflict
handling, contact promotion markers, or migration metadata requires a
separate review of the current schema, triggers, RLS, and the unused
`mark_tenant_contact_promoted` RPC.

## Reconciliation and rollback evidence

Each dry-run artifact must include a count reconciliation table:

| Count | Required relationship |
| --- | --- |
| total ghost profiles | union of membership-bearing and membershipless populations, after dedupe by source UUID |
| membership-bearing profiles | profiles with at least one usable tenant association |
| membershipless quarantine | total ghosts minus membership-bearing profiles, with explicit no-tenant reason |
| tenant candidate rows | one per tenant/normalized-email grain before holdouts |
| eligible candidates | candidate rows not held by collision, pending, or quarantine rules |
| existing-contact matches | subset requiring reconciliation, not insertion |
| pending-invite matches | subset requiring pending-state preservation, not duplicate invitation |
| collision/manual rows | explicit holdout count and IDs |
| projected future inserts | eligible candidates only; expected, not executed |

The expected future insert count must equal the eligible candidate count after
all holdouts are frozen. Any unexplained count difference blocks the apply
packet.

The report must also prove that the dry-run made zero writes: no changed row
counts in source tables, no new contact or invitation IDs, no updated
promotion markers, and no outbound email. A future applied batch must be
rollbackable by batch ID by removing or reversing only rows it created, while
preserving legacy profiles, historical membership, invitation/audit records,
and any contact that was concurrently edited or promoted. The exact audit
storage and rollback mechanism remain implementation questions and must be
approved before apply.

## Security, RBAC, and acceptance gates

Before any future apply is considered ready:

- the report runs in the approved controlled environment using a read-only
  identity or an explicitly bounded service operation; browser credentials
  and raw secrets never appear in artifacts;
- contact visibility, editing, and promotion are checked against the approved
  tenant-admin capability model, while a contact has no access role before
  acceptance;
- the standard invitation path remains the materialization boundary, and a
  safe QA fixture proves acceptance creates/relinks the profile and membership
  records exactly once and archives/links the contact exactly once;
- pending invitations reserve capacity according to the approved semantics,
  but a pre-acceptance contact grants no `tenant_members` access;
- all callers of `activate-ghost-user`, including bulk actions and cohort
  workers, have zero-caller evidence before legacy activation is retired;
- RBAC, RLS, audit, Realtime, and Client Health provenance implications are
  reviewed as one cross-initiative packet where the same membership/contact
  rows are involved;
- production backfill, Edge Function retirement/deletion, and any schema or
  policy change each receive separate explicit authorization and audit
  records.

## Current evidence baseline

The P1.2 read-only investigation recorded the following baseline on
2026-09-12. These figures are evidence for planning, not a promise that a
future run will produce the same values; all counts must be regenerated at
the start of an authorized execution:

- 627 `public.users` profiles, 411 without a matching `auth.users` row;
- 576 `tenant_users` rows, 375 referencing profiles without auth;
- 936 `tenant_members` rows, 691 referencing profiles without auth;
- 691 ghost membership rows representing 356 distinct ghost profiles;
- 348 distinct ghosts with `tenant_users` rows, while 55 have neither
  membership ledger; 54 of those lack a tenant association;
- 335 of 356 membership-bearing ghosts occur in two tenants, so global
  person-level projection would be incorrect;
- 114 `tenant_contacts` rows (105 active, 9 archived, 2 marked promoted);
- six active contacts match pending invitations by tenant/email;
- no active contact matched a ghost by tenant/email in that snapshot.

The prior 24-hour log review found no `activate-ghost-user` invocation, but
that is not sufficient historical zero-caller evidence. The activation Edge
Function, bulk activation branch, and cohort worker caller remain gated until
their complete call/job history is accounted for.

## Remaining implementation questions

The product decisions above are closed. The future apply packet still needs
explicit answers for these implementation and operational questions:

1. Where will the durable source-metadata and migration-batch record live?
2. What is the exact apply/rollback mechanism that preserves concurrent
   contact edits and accepted invitations?
3. Which controlled environment and read-only credential are approved for the
   reproducible dry-run artifact?
4. Who owns manual disposition and evidence retention for the 55
   membershipless ghosts and any collision holdouts?
5. What observation window and zero-caller evidence are required before
   `activate-ghost-user` can be separately retired or deleted?

## Exit criteria

This packet is ready to hand to a separately authorized execution packet when
the report schema and classification rules are accepted, the five approved
lifecycle decisions are linked to their decision record, and the execution
owner has supplied the controlled environment, artifact retention, audit
storage, rollback, and manual-review answers above. Until then, this remains
planning documentation only.
