# Audit: 2026-08-27 — Promote to User sends a real invitation

**Trigger:** ad-hoc (follow-up to `2026-08-27-client-portal-contacts-and-swap.md`)
**Scope:** `TenantContactsSection.tsx`'s promote flow; additive change to
`accept_invitation_v2` (same signature, no other behaviour changes).

## Context

Carl asked how a client admin activates a contact's account after
promoting it. Answer at the time: they couldn't. `skip_email: true`
created the account directly with no `auth.users` row and no email — a
"ghost" account, same state as a never-activated invite. The only way to
turn that into something usable is `activate-ghost-user`, which is gated
to `check_permission(admin.team_users.manage, full)` — staff only, not
just UI-hidden. A real client caller had no path forward at all.

## Fix

- Promote now calls `invite-user` with `skip_email: false` — a normal
  invitation email, same as inviting someone fresh.
- Since no user exists at the moment "Promote" is clicked (the person
  hasn't accepted yet), the contact can't be archived/linked there
  anymore. Added a step to `accept_invitation_v2`: after the existing
  `tenant_users`/`tenant_members` work, it now also archives any
  `tenant_contacts` row matching `(tenant_id, lower(email))` with
  `status = 'active'` and stamps `promoted_to_user_id`/`promoted_at`.
  Matches the same matching convention `swap_tenant_user_to_contact`
  already uses. Additive only — no effect on invitations that don't
  happen to match a contact.

## Why this also answers "swap to contact, then promote again"

Nothing in the contact row is touched until acceptance, so a
swap → promote → swap → promote cycle just keeps sending fresh
invitations against whichever `tenant_contacts` row is currently
`active` for that email — the next person to actually accept is the one
that gets linked. No duplicate contacts, no stale `promoted_to_user_id`
pointing at an account that got swapped back out.

## Verification

- `npx vitest run`: 282 passed, 0 failures.
- `tsc --noEmit`: no new errors.
- Live DB verification on Demo RTO (tenant 7547), Chloe Davis (a contact
  that had already been through one swap/promote cycle in the prior
  session): swapped back to a contact, promoted again — confirmed a real
  `user_invitations` row was created (`status: pending`, correct
  `relationship_role`, real token, 7-day expiry) and the contact stayed
  `active`/unlinked. Confirmed via a read-only query that exactly one
  `tenant_contacts` row matches the `(tenant_id, lower(email), status =
  'active')` predicate `accept_invitation_v2` now uses — i.e. the row it
  will pick up is unambiguous. Did **not** fabricate a fake acceptance
  call (a random UUID through `accept_invitation_v2` directly) — that's a
  security-sensitive identity-binding RPC and the local auto-mode
  classifier correctly blocked the attempt; verified the matching logic
  instead of routing around it.

## Open questions parked

- The actual `accept_invitation_v2` auto-archive step has not been
  exercised via a real end-to-end signup (a person clicking the email
  link). Logic is additive and low-risk, but worth a real click-through
  next time someone actually accepts a promoted-contact invitation.
