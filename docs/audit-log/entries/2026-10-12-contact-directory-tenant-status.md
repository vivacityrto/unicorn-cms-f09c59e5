# Audit: 2026-10-12 — Contact Directory shows the client's status

**Trigger:** request from Dave (via Carl): the Contact Directory should default to active memberships, and people at cancelled clients (for example All States) were still showing as active.
**Scope:** `get_admin_contact_directory()` (read-only) and the Contact Directory page. Part 1 of 2. The second part (deactivating a client's people when the client leaves active) is a separate change with its own audit entry and approval; nothing here disables or archives anyone.

## Findings

- The directory's Status column came only from the person's own record (the user's `disabled`/`archived` flags, or the contact's `status`), never from the client. A contact at a cancelled client therefore read "active".
- Client statuses at the time (counts of clients): inactive 324, active 58, cancelled 29, completed 4, disabled 4, on hold 2, archived 1, terminated 1, in arrears 1. Only `active` is treated as active.
- Checked before changing the function: no other function body and no view references `get_admin_contact_directory`; the only callers are the Contact Directory page and the Events registry's walk-in lookup, both via `supabase.rpc`.

## Code changes

- Migration `20261012010000_contact_directory_tenant_status.sql`: drops and re-creates `get_admin_contact_directory()` (a changed `RETURNS TABLE` cannot be replaced in place) with one extra trailing column, `tenant_status` (`tenants.status`). Body otherwise identical: same staff-only gate, same two sources, same exclusions. Execute granted to `authenticated` and `service_role`, matching the previous callers. Read-only; no data changes. Rollback: re-create the previous version from `20260825060000_tenant_contacts_and_groups.sql`.
- Contact Directory page: defaults to active people at active clients; new "Client status" filter (statuses present in the data, Active first, plus "All client statuses"); the client name opens the client's page (`/tenant/<id>`) in a new tab and non-active clients are flagged beside the name. The same link and flag appear in the Group member tables. The "select all matching" and CSV export follow the filtered list, so they now default to the active view too.

## Decisions

- Only `active` counts as an active client (on hold and in arrears included in the hidden set).
- Teams event registration is deliberately unchanged for now: it still resolves a Group's members from the source tables and does not look at client status.
- The default view can be widened by the operator at any time; it is a view default, not a restriction.

## Open questions parked

- What should happen to people when a client leaves active? Handled in the follow-up (part 2), which also has to account for a legacy trigger, `update_tenant_status`, that rewrites `tenants.status` to `active`/`inactive` whenever any user's disabled/archived flag changes, and for the 34 users who belong to more than one client.
