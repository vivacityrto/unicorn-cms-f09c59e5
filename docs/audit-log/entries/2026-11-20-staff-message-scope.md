# Audit: 2026-11-20 — staff-message-scope

**Trigger:** the messenger redesign, phase 3b (Carl: staff should see the threads they are responsible for, mainly the primary consultant's, with the assistants who cover most consultants, "similar to how notification and delegation work"; confirmed and approved "Go with your picks" on 20 November 2026).
**Scope:** migration `20261120140000_staff_message_scope.sql` adds one read-only function, `public.get_my_message_scope()`. No table, policy, trigger or row is changed.
**Status:** **Applied to production on 20 November 2026** (Carl: "Apply it"), via the Supabase MCP `apply_migration` as `staff_message_scope`, after a rolled-back dry run. Postflight verified (below). It was applied before the staff bubble PR is merged; until that PR is merged nothing calls it.

## What it does

For the signed-in Vivacity staff member, it returns the client organisations whose messages are theirs, and why. It does not copy the notification routing rules: for every active client organisation it asks `public.resolve_notification_recipients('client_message', tenant, NULL)` and keeps the organisations where the caller is a recipient. So the bubble and the bell cannot disagree about who owns a client, and any change to the routing (a new delegate, a reassigned consultant, a watch or mute) changes the bubble with it.

- `reason` is the resolver's own word: `primary_csc` (my client), `delegate` (I cover for their consultant, named in `covering_name`), `opted_in` (my preference is all clients), `watching` (I chose to watch this client), `unassigned` (a Super Admin, for an organisation with no consultant).
- Only Vivacity staff get rows (`is_vivacity_team_safe`); only active client organisations; never the Vivacity organisation (6372).
- `SECURITY DEFINER`, `STABLE`, `search_path` pinned to empty; `EXECUTE` revoked from `PUBLIC` and `anon`, granted to `authenticated`.

## How the bubble uses it (front end, same PR)

- **Default view "My clients":** conversations of the organisations in the scope, with a chip for why (`Covering <first name>`, `Watching`, `Unassigned`); an "All clients" switch shows everyone's (access is unchanged: any Vivacity staff member can already open any thread).
- **Unread** is taken from the message notifications the routing sent the person (`user_notifications`, type `message`, unread), not from participant rows. That fixes the gap where a delegate or a newly reassigned consultant got a bell notification but no unread state on the thread. Only conversations that are mine can be unread.
- **Reading** a conversation that is mine records the read position on the person's participant row (adding them as staff if absent, which also shows the client "Seen") and clears the message notification. Browsing a client that is not mine through "All clients" leaves no trace. It deliberately does not call `fn_mark_conversation_read`, which is written for clients (it requires a participant row and writes a "message read" client timeline entry and audit entries).
- **Replies** go out as staff and add the person as a participant first (needed by row-level security), as the Communications page does.

## Dry run (production, rolled back)

The function was created inside a block that ended in a deliberate exception, then called as four real users:

- **A primary consultant** (not a delegate): 17 organisations, all `primary_csc`.
- **An all-CSC delegate:** 55 organisations: 47 `delegate`, 7 `primary_csc`, 1 `unassigned`.
- **A Super Admin who is not a delegate:** 1 organisation, `unassigned`.
- **A client user:** 0 rows.

No names, emails or message text were printed.

## Postflight (production, after apply; the check itself was rolled back)

- One `get_my_message_scope` function, `SECURITY DEFINER`, `STABLE`, `search_path` pinned; `authenticated` can run it, `anon` cannot (a call as `anon` is refused).
- The same four callers as the dry run return the same counts: a primary consultant 17 (all `primary_csc`); an all-CSC delegate 55 (47 `delegate`, 7 `primary_csc`, 1 `unassigned`); a Super Admin who is not a delegate 1 (`unassigned`); a client user 0.
- No names, emails or message text were printed.

## Not done

- Typing indicators and one shared realtime listener (the bubble refreshes every 20 seconds and the open conversation is live).
- Staff Communications and the Manage Client Messages tab on the kit (phase 5); the separate rollout-flagged Ask Viv assistant widget at the bottom left is unchanged.

**Rollback:** `DROP FUNCTION public.get_my_message_scope();` (nothing else depends on it except the staff bubble, which then shows no scoped threads).
