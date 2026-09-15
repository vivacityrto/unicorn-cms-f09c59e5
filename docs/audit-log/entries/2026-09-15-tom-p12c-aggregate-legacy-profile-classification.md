# 2026-09-15 — TOM P1.2-c aggregate legacy-profile classification and log-retention gap

## Scope and authorization

This was a bounded, read-only evidence pass for the TOM P1.2-c
`activate-ghost-user` retirement gate. It performed no schema, RLS, trigger,
cron, Edge deployment, invitation, account, job, credential, or production
change. No identifiers, emails, or row-level exports were retained.

## Historical log sweep

The current hosted Supabase `logs` endpoint was queried for every UTC day from
`2026-06-03` through `2026-06-16`. The sweep checked all available sources,
including `function_edge_logs`, `edge_logs`, `function_logs`, `postgres_logs`,
`auth_logs`, and `realtime_logs`. Every day returned zero retained rows from
every source.

This is a complete provider-retention gap for the bounded period, not proof of
zero requests. The durable `public.audit_eos_events` correlation remains the
surviving account-level evidence for historical activation activity in that
window.

## Aggregate classification

The mismatch population was classified through aggregate SQL across
`public.users`, `auth.users`, `tenant_members`, `tenant_users`,
`tenant_contacts`, and `user_invitations`:

| Aggregate measure | Count |
| --- | ---: |
| Public profiles with no matching auth identity | 411 |
| Profiles with `tenant_members` evidence | 356 |
| Profiles with `tenant_users` evidence | 348 |
| Profiles with either membership evidence (mutually descriptive bucket) | 356 |
| Membershipless profiles | 55 |
| Profiles with no `tenant_id` | 54 |
| Contact-email matches | 4 |
| Invitation-email matches | 3 |
| Auth-email matches | 1 |
| Email conflicts | 0 |
| Archived profiles | 369 |
| Disabled profiles | 378 |
| Internal profiles | 3 |
| CSC profiles | 0 |

The indicators overlap and must not be summed. The broad population is mostly
archived or disabled legacy data, but it is not a ghost-activation set. The
aggregate result does not authorize row-level conversion, invitation, repair,
or retirement.

## Disposition

- The 411 unmatched profiles remain outside ghost-retirement scope.
- The 356 membership-bearing and 55 membershipless rows remain unchanged;
  neither group is bulk-converted.
- The June 3–16 all-source log gap remains an evidence limitation. A separate
  request-level export is only needed if Carl requires complete historical
  reconstruction before an operational retirement decision.
- The fail-closed guards, stale-job hold, never-signed-in account hold, and
  reset behavior remain unchanged.
- `activate-ghost-user` remains deployed and retirement remains unauthorized.
