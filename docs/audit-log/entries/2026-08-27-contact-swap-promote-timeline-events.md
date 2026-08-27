# Audit: 2026-08-27 — Swap/promote timeline events + Contact Directory staff access

**Trigger:** ad-hoc (follow-up to `2026-08-27-promote-sends-real-invitation.md`)
**Scope:** `timeline_valid_event_type` CHECK constraint; additive changes to
`swap_tenant_user_to_contact` and `accept_invitation_v2` (same signatures, no
other behaviour changes); frontend RBAC visibility for `/administration/contacts`.

## Context

Two follow-up asks in the same session: (1) enable Contact Directory access
for all internal Vivacity staff, not just SuperAdmin; (2) make the
user↔contact swap and promote actions show up in the tenant Timeline tab and
staff Dashboard "Client Activity" feed, which both read from the single
`client_timeline_events` table.

## Fix

- **CHECK constraint:** dropped and re-added `timeline_valid_event_type` on
  `client_timeline_events`, preserving the existing ~60-value list and adding
  `'user_swapped_to_contact'` and `'contact_promoted_to_user'`.
- **`swap_tenant_user_to_contact`:** added a `client_timeline_events` INSERT
  alongside the existing `audit_eos_events` write, same pattern as
  `_apply_relationship_role_row`. No FK guard needed — this table has no
  foreign keys, unlike `audit_eos_events` which FKs to `auth.users`.
- **`accept_invitation_v2`:** captured the matched `tenant_contacts.id` via
  `RETURNING` on the existing archive-on-accept UPDATE (from the prior audit
  entry's fix) and, when a contact was actually matched, inserts a
  `contact_promoted_to_user` timeline event. Also added `matched_contact_id`
  to the existing `audit_eos_events` metadata for traceability.
- **Frontend types:** added both event types to `TIMELINE_EVENT_TYPES` in
  `src/types/timeline.ts` (single source of truth, mirrors the DB CHECK).
  `TimelineEventCard.tsx` has three exhaustive `TimelineEventType`-keyed
  structures — `EVENT_ICON_MAP`, `EVENT_COLOR_MAP`, and the `getPrimaryAction`
  switch, plus `getModuleChip()` — all updated so the build stays exhaustive.
  Grepped the rest of `src/` for other `Record<TimelineEventType, ...>`
  structures; `TimelineEventCard.tsx` is the only one.
- **Staff access:** `/administration/contacts` route changed from
  `requireSuperAdmin` to `allowVivacityTeam`; sidebar nav item's
  `superAdminOnly` flag removed; the Administration section's visibility gate
  broadened from `(isSuperAdmin || isTeamLeader || isIntegrator)` to
  `isVivacityTeam`. Backend RPCs behind Contact Directory were already staff-
  scoped correctly (`is_vivacity_staff` confirmed to be a pure alias for
  `is_vivacity_team_safe`, matching the frontend's `isVivacityTeam`) — this
  was a frontend-only visibility gap, not a backend permission gap.

## Verification

- `npx vitest run`: 282 passed, 0 failures.
- `tsc --noEmit` (scoped to touched files): no new errors.
- Live DB verification on Demo RTO (tenant 7547): swapped Ella Fisher from
  user to contact via the browser; confirmed a `client_timeline_events` row
  was created (`title: "Ella Fisher: User → Contact"`, `entity_type:
  'tenant_contacts'`, `source: 'user'`, `visibility: 'internal'`). No console
  errors during the action.
- `contact_promoted_to_user` verified at the migration/logic level only (same
  additive pattern as the swap event, using the same `RETURNING`-based
  matching the prior audit entry already verified) — not yet exercised via a
  live promote→accept click-through, since a real acceptance requires either
  a real email click or the classifier-blocked direct RPC call (see prior
  entry's "Open questions parked").

## Open questions parked

- `contact_promoted_to_user` needs a real end-to-end click-through
  verification once someone actually accepts a promoted-contact invitation
  (same parked item as the prior entry, now also covering the timeline
  event).
- Broadened Contact Directory staff access has been verified for SuperAdmin
  and the client persona only — not yet tested as a non-SuperAdmin internal
  staff login (e.g. CSC/CET/BGT role).
