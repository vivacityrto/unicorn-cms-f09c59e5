# Audit: 2026-11-20 — broadcast-recipients-active-members

**Trigger:** the messenger redesign review (Carl: "make sure we don't mess up the broadcast message feature", then approved "design A" on 20 November 2026 after pointing out that `tenant_members` is canonical, ADR-019).
**Scope:** migration `20261120130000_broadcast_recipients_use_active_members.sql` replaces `public.fn_resolve_broadcast_recipients` (same signature, columns and access; it feeds the audience preview, queueing and the scheduled delivery function). Edge function `send-broadcast-campaign` changes who is added as a conversation participant on an immediate send. No row is changed.
**Status:** **Written and dry-run in production (rolled back). NOT applied. The edge function change deploys when this PR is merged, so the migration should be applied first, with explicit go-ahead.**

## What was wrong

1. **Recipients came from the legacy `tenant_users` table**, not the canonical `tenant_members`, and there was no check that a recipient is an active member. Active members with no `tenant_users` row were never reached (4 real people in active organisations: valid organisation and sign-in account).
2. **The immediate send added every `tenant_users` row of the organisation as a participant**, not just the recipients, so inactive and untargeted people (66 inactive rows measured) became participants and could read the broadcast. The scheduled-delivery function already added recipients only, so the two paths disagreed.

## What changes

- **`fn_resolve_broadcast_recipients`:** a recipient must be an active `tenant_members` member of the organisation. Targeting is unchanged for people who have a `tenant_users` row (role or relationship role in the chosen roles, full access scope, same five audience modes, one organisation per person, Vivacity's own organisation excluded). An active member with no `tenant_users` row, who is not disabled or archived and has a sign-in account, is treated as an ordinary client user (relationship role "user", full access): reached when the chosen roles include "user", not when only "parent" is chosen.
- **`send-broadcast-campaign`:** participants are this organisation's recipient rows (plus the sending staff member). The per-row fallback for stale accounts and the "failed recipient" reporting are unchanged.
- **Not changed:** the scheduled-delivery function (it already adds recipients only), read tracking (`broadcast_recipients`, `fn_mark_conversation_read`), campaign totals, the audit log writes, the sender UI.

## Dry run (production, rolled back; audience "everyone", roles parent and user)

- Recipients 119 before, 121 after: **4 gained** (all active members with no `tenant_users` row, all able to sign in), **2 left** (one with no `tenant_members` row at all, one whose membership in the targeted organisation is inactive). No duplicate people. Roles parent only: 78 to 76. Gold tier audience: 18 to 18.
- 5 current recipients have no sign-in account; that is existing behaviour (delivery marks them failed) and is unchanged.
- The dry run used the same function body for the modes it exercised (everyone, tier); the migration file carries all five modes, covered by a source guard test.
- No names, emails or message text were printed. The block ended with a deliberate exception so nothing persisted.

## Not done

- **No backfill.** The 4 gained people are not added to earlier broadcasts (they would suddenly see old broadcasts as unread). Their next broadcast reaches them.
- Moving the contact data (primary and secondary contact, relationship role) onto `tenant_members` and retiring `tenant_users` as a second authority (ADR-019, separately authorised).
- After applying: postflight (function replaced once, same signature, access unchanged, a preview for a normal audience returns recipients), then merge, then confirm the edge function deployed and the next broadcast sends.

**Rollback:** restore the previous function body from `supabase/migrations/20261119130000_schedule_bulk_messages.sql` (`CREATE OR REPLACE`), and revert the edge function change.
