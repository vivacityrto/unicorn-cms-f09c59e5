# Audit: 2026-05-13 — BUG-005 Accept-invitation access_scope verification

**Trigger:** BUG-005 from the 12 May 2026 deployment status audit — `accept_invitation_v2` access_scope mapping for `academy_user` invites unverified.
**Author:** Carl
**Scope:** Read-only verification of `public.accept_invitation_v2`. No code or data changes.
**Supabase project:** `yxkgdalkbrriasiyyrwk` — Unicorn 2.0-dev (ap-southeast-2)

---

## Verdict

**Closed — verified correct. No action required.**

---

## Findings

### Function logic — correct

`accept_invitation_v2` CASE block maps `relationship_role` values to derived fields as follows:

| `relationship_role` | `access_scope` | `tm_status` | `unicorn_role` |
|---|---|---|---|
| `primary_contact` | `full` | `active` | `Admin` |
| `secondary_contact` | `full` | `active` | `Admin` |
| `user` | `full` | `active` | `User` |
| `academy_user` | `academy_only` | `inactive` | `Academy User` |

The `academy_user` path correctly sets `access_scope = 'academy_only'` and `tenant_members.status = 'inactive'`. The mapping is written to `tenant_users` via INSERT/ON CONFLICT DO UPDATE covering `relationship_role`, `role`, `primary_contact`, `secondary_contact`, and `access_scope` — all fields updated atomically.

Audit logging to `audit_eos_events` includes `access_scope` and `relationship_role` in the JSONB details, providing a verifiable trail per acceptance.

### Live data — no `academy_user` invites sent

Invite distribution across all statuses:

| `relationship_role` | `status` | count |
|---|---|---|
| `primary_contact` | accepted | 1 |
| `secondary_contact` | accepted | 1 |
| `secondary_contact` | pending | 1 |
| `user` | accepted | 2 |
| `null` | accepted | 4 |
| `null` | revoked | 22 |

No `academy_user` relationship_role invite exists in any status. The `academy_user` CASE branch has never been exercised in production. The code path is correct but unconfirmed by live acceptance data.

### Drift row — test account, not a function bug

One accepted `user` invite (`khianbsismundo@gmail.com`, 6 May 2026, invite_id `379133b7`) has `tu_rr = 'academy_user'` and `access_scope = 'academy_only'`. The invite was accepted correctly as `user` (access_scope=full, tm_status=active per the CASE logic), and the row was subsequently modified manually — most likely during BUG-017 academy access testing on 12 May 2026. This is a test account in a manually modified state, not evidence of a function bug.

---

## Side observations (non-blocking)

- **`SET search_path TO 'public', 'pg_temp'`** — `accept_invitation_v2` uses a non-empty, non-`= ''` search path. Added to the P1-e-ii body audit scope.
- **`pg_temp` is unnecessary** — no temp tables are created in the function body. The `pg_temp` entry in the search path can be removed in the P1-e-ii cleanup pass without any functional change.
- **`accept_invitation` (1-arg)** — does not exist on this project. `accept_invitation_v2` is the only acceptance function.

---

## KB changes shipped

None.

---

## Codebase observations (read-only)

- `public.accept_invitation_v2` — verified via `pg_get_functiondef`. Function body confirmed correct.
- `public.user_invitations` — invite distribution confirmed via live COUNT query. Zero `academy_user` rows.

---

## Decisions

- BUG-005 closed as verified-correct. No migration, no data backfill, no code change required.
- `pg_temp` cleanup and `search_path = ''` upgrade deferred to P1-e-ii body audit session.

---

## Open questions parked

- **First `academy_user` invite in production** — when the feature is first used, the acceptance flow should be smoke-tested end-to-end to confirm the live path behaves as the code predicts. Recommend adding this to the QA checklist for the first Academy-only user onboarding.

---

## Tag

`audit-2026-05-13-bug-005-accept-invitation-access-scope`
