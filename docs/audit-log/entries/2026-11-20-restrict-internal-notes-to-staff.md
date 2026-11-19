# Audit: 2026-11-20 — restrict-internal-notes-to-staff

**Trigger:** Carl asked to fix the three client data exposures found in the package analytics review ("alright fix the data exposures").
**Scope:** migration `20261120110000_restrict_internal_notes_to_staff.sql`: replaces the row-level security policies on `public.notes`, `public.client_notes` and `public.tenant_notes` (12 policies); replaces the view `public.v_client_home_feed` (same columns, `security_invoker` kept) and the functions `get_client_package_dashboard` and `get_client_package_hours_recent` (same signatures and columns). Portal: the pinned-note banner and the notes line in the client "recent work" list are removed. No row is changed.
**Status:** **Applied to production** on 19 November 2026 (Carl said "Apply it"), via the Supabase MCP `apply_migration` as `restrict_internal_notes_to_staff`, after a rolled-back dry run. Postflight verified (see "Postflight" below).

## The exposures

1. **Any client member could read, change and delete the organisation's internal notes.** The policies on `notes` (and `client_notes`, `tenant_notes`) let any member of an organisation through `user_has_tenant_access` / `has_tenant_access_safe`, and update and delete only needed that membership too. Confirmed in a rolled-back test (the earlier review had not tested it): one client contact could read all 139 of their organisation's notes (121 package notes), update all 139 and delete all 139, and could insert notes. This is the most serious of the three; it is more than the "read" exposure first recorded.
2. **Pinned note text on the client package page.** `get_client_package_dashboard` returned the pinned note's title, text, priority and a severity guessed from keywords in the text, and the page rendered it. The pin is a staff-side pin, not a "visible to client" flag.
3. **Staff free-text time-entry notes in the client "recent work" list.** `get_client_package_hours_recent` returned `time_entries.notes`.
4. **Found while fixing 1 (not in the earlier list):** the client Home feed (`v_client_home_feed`, a `security_invoker` view) also read the notes table and showed the **title** of any pinned note containing "urgent", "overdue" or "action required" as an "urgent note" item. It only worked because of exposure 1.

## Decision

Carl chose (20 November 2026, asked directly): "Remove both for now". Notes are staff-only, and the two client-facing things built on internal notes (the pinned-note banner, the urgent-note Home item) are removed. If staff should ever share a note with a client on purpose, that needs an explicit "share with client" option, which is not built.

## What changes

- **Policies:** all four actions on `notes`, `client_notes` and `tenant_notes` now require Vivacity team or super admin (`is_vivacity_team_safe` / `is_super_admin_safe`); `tenant_notes` update and delete also require the note's author unless super admin (as before in spirit). Nothing is granted through organisation membership any more.
- **Evidence this is safe for clients:** no non-staff user has ever authored a row in any of the three tables (0 of 11,911 notes, 22 client notes, 19 tenant notes), and no client-portal page reads them directly. All 19 active internal staff retain access; the only authors who would lose it are 3 disabled or archived former staff accounts.
- **Home feed:** the `urgent_notes` branch is removed; the other branches are unchanged.
- **Dashboard function:** `pinned_note_*` columns now return NULL. The status pill, including "on hold" (still detected on the server from the pinned note), is unchanged.
- **Recent work function:** `notes` returns NULL. Other behaviour unchanged (it still does not filter to billable entries, as before).
- **Portal:** `PinnedNoteBanner` is deleted and no longer rendered; `PackageRecentWork` no longer shows a notes line. The staff side reads notes as staff and is unaffected.

## Dry run (production, read-only, rolled back)

Inside one rolled-back block, as a real client contact of an organisation with a pinned note that trips the urgent-note rule, before and after applying the migration SQL:
- **Before:** 94 notes visible, 1 client note, the pinned note visible through the dashboard function, status "drifting", 26 time-entry notes returned, 1 urgent-note item among 11 Home feed rows.
- **After (client):** 0 notes visible, update 0 rows, delete 0 rows, insert refused by row-level security; 0 client notes and 0 tenant notes; client-note and tenant-note inserts refused; all pinned columns NULL; status still "drifting"; 0 time-entry notes; 0 urgent-note items and 10 Home feed rows (only the urgent note item gone).
- **After (Vivacity staff):** 94 notes visible and updatable (94 rows), client notes readable.
- No names, emails or note text were printed.

## Postflight (production, after apply; the check itself was rolled back)

- 12 policies on `notes`, `client_notes` and `tenant_notes`; 0 of them reference organisation membership.
- `v_client_home_feed` no longer contains `urgent_notes` and is still `security_invoker = true`.
- As a real client contact: 0 notes visible, update 0 rows, delete 0 rows, insert refused; 0 client notes; 0 tenant notes; all pinned dashboard fields NULL with the status pill unchanged ("drifting"); 0 time-entry notes; 0 urgent-note feed items (10 feed rows).
- As Vivacity staff: 94 notes visible and updatable; client notes readable.
- No names, emails or note text were printed.

Still to do: ask staff to re-test the staff notes screens now that it is live.

## Not done

- A deliberate "share with client" option for notes.
- `get_client_package_hours_recent` does not filter to billable entries (the other hours functions do); left as it was.
- The pinned-note keyword detection for "on hold" still reads internal note text on the server to set a status; only the resulting state reaches the client.

**Rollback:** restore the previous policies on the three tables (qualified by `user_has_tenant_access` / `has_tenant_access_safe`), the previous view and the previous functions from their earlier migrations. Doing so re-opens the exposures.
