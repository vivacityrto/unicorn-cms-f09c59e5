# Audit: 2026-08-06 — primary/secondary contact swap + timeline role events

**Trigger:** ad-hoc — Carl reported that promoting Secondary Contact → Primary
Contact (and the reverse) from Manage Tenants → Users was not working, and
asked for relationship-role changes to appear on the tenant Timeline.

**Scope:** `set_relationship_role` RPC, unique indexes on
`tenant_users.relationship_role` / `secondary_contact`,
`TenantUsersTab.tsx` swap confirm flow, and `client_timeline_events`
(`account_role_changed`). Did not touch invite/accept flows or client-portal
role switchers beyond the shared RPC.

## Findings

- Unique indexes enforce one primary and one secondary per tenant:
  `uniq_tenant_one_primary_contact`, `uniq_tenant_one_secondary_contact`,
  and legacy `tenant_users_one_secondary`.
- The UI's "Swap Primary" confirm path demoted the existing primary to
  secondary **before** promoting the target. When the target already held
  secondary (the common swap), that first UPDATE hit
  `uniq_tenant_one_secondary_contact` (SQLSTATE 23505) and aborted — so the
  dialog appeared broken.
- Role changes already wrote `audit_eos_events` (`relationship_role_changed`)
  but never emitted `client_timeline_events`, despite `account_role_changed`
  already being a valid timeline event type and UI-wired.

## KB changes shipped

- n/a

## Codebase observations (hand-applied hotfix)

- unicorn-cms-f09c59e5 @ branch `hotfix/swap-primary-contact-timeline` —
  rewrote `set_relationship_role` to free unique slots atomically (via
  internal `_apply_relationship_role_row`), emit internal-only
  `account_role_changed` timeline rows for each final role change, and
  simplify `TenantUsersTab.confirmPrimarySwap` to a single promote RPC.
  Backfilled historical role changes from `audit_eos_events` (~28 rows).
- Migration applied to prod as four sequential MCP `apply_migration`
  steps (tool payload size), recorded as:
  - `20260806054430_fix_relationship_role_swap_and_timeline`
  - `20260806054717_fix_relationship_role_swap_apply_row_helper`
  - `20260806054737_fix_relationship_role_swap_rewrite_rpc`
  - `20260806054746_fix_relationship_role_swap_timeline_backfill`
- Dry-run verified on Test RTO A (tenant 7517): promote QA Secondary →
  primary inside a rolled-back transaction produced the expected two
  timeline titles (`Secondary Contact → Primary Contact` and
  `Primary Contact → Secondary Contact`) and left final roles restored.

## Decisions

- Orchestrate the swap inside the existing RPC rather than a new
  `swap_primary_contact` RPC, so every caller (admin UI, future paths) gets
  correct unique-slot handling.
- When promoting to primary while a *different* user already holds secondary,
  demote the outgoing primary to `user` instead of secondary (cannot violate
  the one-secondary index). Dialog copy updated to match.
- Timeline events are internal-only, matching other account_* timeline events
  written by bulk-user-action.

## Open questions parked

- Whether demoting the only primary to secondary (leaving the org with no
  primary) should be blocked product-side — currently allowed by the schema
  and unchanged this session.
