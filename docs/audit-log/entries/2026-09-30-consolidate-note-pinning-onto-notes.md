# Audit: 2026-09-30 — consolidate-note-pinning-onto-notes

**Trigger:** ad-hoc (feature redesign — "optimize the pinning of notes")
**Scope:** every place a note is created, listed or pinned for a client: the
`notes` and `client_notes` tables, their RPCs/triggers/RLS, and the frontend
surfaces that read them. Did not touch `merge_tenants` (see open questions),
Ask Viv, or notification delivery.

## Findings
- Two parallel note systems existed. `notes` is the real one (11,609 rows, 362
  tenants, 60 pinned across 30 tenants, package- and tenant-level). `client_notes`
  was a January 2026 timeline-only table (22 rows, 20 tenants, 0 pinned ever).
- The Timeline's "Pinned Notes" card, its pin button and `rpc_toggle_client_note_pin`
  all operated on `client_notes` — so the card was empty for nearly every tenant and
  the Timeline pin button never appeared on the 11k real notes (their events are
  `structured_note_added`, entity type `structured_note`).
- Only two features still wrote to `client_notes`: the package **renewal note**
  (17 of the 22 rows, tagged `renewal`, linked to a package instance) and the
  Timeline **quick note** box (5 rows, 20 Feb 2026). Renewal notes therefore showed
  on the Timeline but not on the package or the Notes tab.
- `rpc_create_client_note` inserted a `note_created` timeline event AND the
  `trg_client_note_timeline` trigger inserted a second `note_added` event — every
  client_notes insert produced two timeline events (22 + 22 confirmed).
- `trg_notes_timeline` fires on INSERT only, so pinning/unpinning a `notes` row has
  never written a timeline event (only the client_notes RPC did).
- Pin semantics were inconsistent: `useNotes.togglePin(id, isPinned)` took the
  CURRENT state; the Timeline path took the TARGET state. Both did a full refetch
  with no optimistic update, and `useNotes` showed a generic "Note updated" toast.
- `NotePreviewDialog` read `client_notes` by notification `source_id`, but note
  notifications carry `notes` ids, so it always fell to its fallback text.
- `PackagePinnedNote` ran its own query per package card (N queries per page).
- A pin write blocked by RLS is a silent 0-row update, not an error.
- **RLS exposure (pre-existing, not changed here):** `notes_select` allows any
  user in a tenant's `tenant_users` (via `user_has_tenant_access`) to read every note
  of that tenant. Simulated in a rolled-back transaction as a plain client "User" on
  Demo RTO (7547): all 9 of that tenant's notes were readable (including the pinned
  one), 0 of other tenants'. The staff-side Notes tab is labelled "Internal" but the
  policy does not enforce it. No client-portal UI reads `notes` (every reader is a
  staff tenant-management component), so pins are not shown to clients in the app.
  Client users only see `client_timeline_events` rows with `visibility = 'client'`
  (same simulation: 414 events visible, 0 internal).

## KB changes shipped
- no changes

## Code changes (if this entry accompanies one)
- Migration `20260930090000_migrate_client_notes_to_notes.sql` — **applied to
  production 2026-09-30** via the Supabase MCP (`apply_migration`). Copies the 22
  client_notes rows into `notes`, preserving ids, with `trg_notes_timeline` paused
  for the copy so no duplicate timeline events are created. Verified afterwards:
  22 rows migrated (17 package-level, 5 client-level), content/tenant/creator/
  timestamps/pin state identical for all 22, 0 duplicate `structured_note_added`
  events for them, `client_timeline_events` unchanged at 17,554 rows, trigger back
  to enabled (`O`), `client_notes` still 22 rows. No schema change, no new
  column, no RLS change, no grant change.
- Migration `20260930100000_notes_pin_timeline_events.sql`: adds
  `fn_notes_pin_timeline_trigger` + `trg_notes_pin_timeline` (AFTER UPDATE OF
  is_pinned on `notes`, only when the value changes). Writes a `note_pinned` /
  `note_unpinned` event (already allowed by `timeline_valid_event_type`) with
  entity_type `structured_note`, visibility `internal` (column default, so clients
  never see it), created_by = `auth.uid()` (the person who pinned). Dry-run in a
  rolled-back transaction on production: one entry per pin and per unpin, none for an
  unrelated column update, attributed to the acting user, nothing persisted after
  rollback. No Edge Function writes `is_pinned`. Additive only.
- Frontend: single write path `setNotePinned` (`src/lib/notePin.ts`, target-state
  semantics, fails loudly on a 0-row RLS no-op); `usePinnedNotes` /
  `useSetNotePinned` (shared react-query cache, optimistic unpin with rollback,
  "Note pinned"/"Note unpinned" toasts); shared `PinnedNotesCard` on Overview and
  Timeline; `PackagePinnedNote` reads the shared list; Notes tab gets a row-level
  Pin/Unpin action; Timeline pin button now works on `structured_note` events;
  renewal note and quick note write to `notes`; `NotePreviewDialog` and
  `useTenantNotes` read `notes`; dead `useClientNotes` hook removed.

## Decisions
- `notes` is the single source of truth for notes and pins; `client_notes` is
  retired from the app (table retained, unused, not dropped).
- Frontend-only for the pin model: no `pinned_at`/`pinned_by` columns were added.
- Pin/unpin timeline entries are produced by a database trigger (not client code) so
  every pin path is covered and the entry commits atomically with the pin. (An
  earlier draft of this entry said pins would produce no events; that changed when
  the requirement to log them was added.)

## Open questions parked
- **Tighten `notes_select`** (and insert/update/delete) so client users of a tenant
  cannot read or modify internal notes directly through the API. Needs its own design
  (staff-only, or a per-note `visibility` column with client-shared notes) and its
  own audit entry; deliberately not bundled here. Check first whether any client
  feature (e.g. notify-client-of-note, `NotePreviewDialog` for client notifications)
  relies on clients reading `notes`.
- `merge_tenants` still references `client_notes` and does not move `notes` rows;
  since new renewal/quick notes now land in `notes`, confirm whether tenant merges
  are meant to carry `notes` across (they never did for the 11k existing rows).
- The `note_created` + `note_added` duplicate events for the 22 historic rows are
  left as-is (no deletes).
- Whether to drop `client_notes`, `rpc_create_client_note`, `rpc_update_client_note`
  and `rpc_toggle_client_note_pin` after a soak period.
- Optional: a DB trigger to record pin/unpin timeline events for `notes`, and
  `pinned_at`/`pinned_by` columns if pin ordering/attribution is wanted.
