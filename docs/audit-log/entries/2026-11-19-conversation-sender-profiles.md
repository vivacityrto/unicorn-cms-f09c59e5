# Audit: 2026-11-19 — conversation-sender-profiles

**Trigger:** Carl said clients only ever see "Vivacity Team" on the other side of a conversation and asked that the internal staff member's name and profile picture be shown so they know who they are talking to.
**Scope:** one new read-only function, `public.get_conversation_sender_profiles(p_conversation_id uuid)` (migration `20261119190000_get_conversation_sender_profiles.sql`), and the portal code that uses it. No table, column, policy, trigger or data change.
**Status:** Applied to production on 19 November 2026 on Carl's explicit go-ahead ("yes"). Postflight below.

## Cause

Row security on `public.users` (`users_select`) lets a client read only themselves, their assigned CSC, and (for organisation admins) people in their own organisation. Any other staff member who wrote in a conversation, such as the sender of a broadcast or a second consultant, returned no row, so the portal used the fallback label "Vivacity Team" for them.

## What the function does

For ONE conversation it returns `user_uuid`, `first_name`, `last_name`, `avatar_url` and `is_staff` for people who sent messages in it. Nothing else: no email, phone, role or any other column. It answers only for a participant in that conversation (`is_conversation_participant_safe`) or Vivacity staff (`is_vivacity_team_safe`), which is the audience that can already read the messages; anyone else gets "Not authorized for this conversation", and no sign-in gets "Not authorized". `SECURITY DEFINER`, `search_path` pinned, execute granted to `authenticated` only (revoked from `public` and `anon`).

## Dry run (production, read-only, rolled back)

For a real broadcast conversation and one of its client participants, with that client's identity set for the session: the sender rows visible to the client through `public.users` today: 0 of 1. Through the function: 1 row with a name, flagged as staff. For a conversation that client does not take part in: refused with "Not authorized for this conversation". No names were printed.

## Production

Preflight: function absent, migration not recorded, helper functions present. Applied with the exact migration SQL. Postflight: exactly one overload `(p_conversation_id uuid)`, `SECURITY DEFINER`, execute granted to `authenticated` (plus the default `postgres` and `service_role`), none to `anon` or `public`. Called as the real function with a client participant's identity: with no sign-in it is refused ("Not authorized"); for the broadcast conversation it returns 1 row with a name, flagged as staff; for a conversation the client does not take part in it is refused ("Not authorized for this conversation"). No table or data changed.

## Portal change

`fetchSenderProfiles` (`src/lib/conversationSenders.ts`) asks the function first and falls back to the direct lookup for anyone it misses. Used by the Inbox conversation hook and the help-centre thread. Messages show the person's name and profile picture, with a "Vivacity" marker for staff; the generic label remains only when no name is on file.

## Known limits

- The conversation list rows do not yet show the sender's picture, only the message thread does.
- Staff with no first or last name on file still show as "Vivacity Team".

**Rollback:** `drop function public.get_conversation_sender_profiles(uuid);` (the portal falls back to the previous behaviour).
