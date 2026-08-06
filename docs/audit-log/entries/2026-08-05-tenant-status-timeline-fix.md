# Audit: 2026-08-05 — tenant status change timeline fix

**Trigger:** ad-hoc — Carl asked who changed Australian National Education
College (tenant 7444) from On Hold back to Active, and asked for tenant
status changes to show up in the client Timeline feature (the same
Timeline built out in the 2026-08-04 client-timeline-expansion audit).

**Scope:** `client_timeline_events`, `public.tenants`, `client_audit_log`,
and the `TenantStatusDropdown.tsx` component that writes tenant status
changes. Did not touch any other part of the Timeline expansion work from
2026-08-04.

## Findings

- Australian National Education College's status was set to On Hold by
  **Carl Simpao** on 2026-07-28 00:23 UTC, then back to Active by **Dave
  Richards** on 2026-08-04 05:14 UTC. Found via `client_audit_log`
  (`action = 'tenant_status_changed'`); no dedicated status-history table
  exists, `client_audit_log` is the source of truth for this.
- Tenant status changes were never appearing in the Timeline despite
  `TenantStatusDropdown.tsx` appearing to try: it called
  `rpc_create_client_note(p_note_type: 'status_change')` to auto-record a
  note (which also writes a `'note_created'` timeline row). That RPC's
  `note_type` CHECK constraint only allows `('meeting', 'decision', 'risk',
  'follow_up', 'escalation', 'general')` — `'status_change'` was never a
  valid value, so every single call failed silently (caught only by a
  `console.error`, no user-facing error). Confirmed via query: zero
  `client_notes` or `client_timeline_events` rows existed anywhere in prod
  for any tenant's status change, ever.
- `client_audit_log` already had 61 historical `tenant_status_changed`
  entries across all tenants (since 2026-02-21) — small enough to backfill
  in full, unlike the 2026-08-04 notes backfill which needed a 90-day
  scope cut.

## KB changes shipped

- unicorn-kb @ n/a — no KB changes this session.

## Codebase observations (read-only, plus one hand-applied hotfix)

- unicorn-cms-f09c59e5 @ `9128151` (main, post-merge of PR #154, hotfix
  branch `hotfix/timeline-tenant-status-change`) — added Timeline event
  type `tenant_status_changed` (internal-only), a new DB trigger
  `fn_tenant_status_timeline_trigger` on `public.tenants` (`AFTER UPDATE`,
  fires when `status` changes), backfilled all 61 historical
  `client_audit_log` rows into `client_timeline_events`, and removed the
  dead `rpc_create_client_note` call (plus the now-unused `clientId` prop
  on `TenantStatusDropdown`) described above.
- Migration: `20260805010000_tenant_status_change_timeline_event.sql`,
  applied directly to prod (project `yxkgdalkbrriasiyyrwk`) via Supabase
  MCP `apply_migration`.
- Verified live: toggled Test RTO A (tenant 7517) active → cancelled →
  restored via direct SQL, confirmed the trigger produced a correct
  timeline row, then deleted the test row and confirmed the tenant's
  status matched its pre-test value exactly.

## Decisions

- Chose a DB trigger on `tenants.status` over fixing the broken
  `rpc_create_client_note` call in place, so the timeline event fires for
  every code path that changes tenant status (not just this one dropdown
  component), consistent with the trigger-based pattern used for the rest
  of the 2026-08-04 Timeline expansion work.
- Removed the dead note-auto-insert code entirely rather than fixing its
  `note_type` validation — the DB trigger now owns this responsibility,
  and fixing the RPC call in addition would have produced a duplicate
  timeline entry (`note_created` + `tenant_status_changed`) for the same
  status change.

## Open questions parked

- Whether `rpc_create_client_note`'s `note_type` CHECK constraint should
  formally add `'status_change'` for cases where staff want to leave an
  actual persisted note (not just a timeline event) explaining *why* a
  status changed — not requested this session, parked.
- Whether other silent-failure call sites of the same shape (a frontend
  RPC call whose argument doesn't match a CHECK/validation constraint,
  caught only by `console.error`) exist elsewhere in the codebase — not
  investigated this session.

## Tag

audit-2026-08-05-tenant-status-timeline-fix
