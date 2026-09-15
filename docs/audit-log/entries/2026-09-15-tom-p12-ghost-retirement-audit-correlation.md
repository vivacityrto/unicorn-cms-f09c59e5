# 2026-09-15 — TOM P1.2-c durable ghost-activation audit correlation

## Scope and authorization

This was an aggregate-only read of the durable `public.audit_eos_events`
trail, performed as the approved read-only historical review. It returned no
identifiers and made no live change. The source function writes the
`ghost_user_activated` action as a best-effort audit event after its account,
membership, invitation, and email work.

## Observed evidence

For `action = 'ghost_user_activated'`, the durable audit trail contains:

| Window | Distinct audited target users | Current ghost-flagged | Current never-signed-in | Current public profile | Invitation match |
| --- | ---: | ---: | ---: | ---: | ---: |
| 2026-06-03 through 2026-06-17T04:59:59Z | 8 | 2 | 1 | 8 | 8 |
| 2026-06-17T05:00:00Z through guard deployment | 56 | 39 | 31 | 56 | 55 |

Among the 56 retained-window audit events, the stored audit details report
`email_sent = true` for 52 and `email_sent = false` for 4. There are zero
`ghost_user_activated` audit rows at or after the guard-effective timestamp
`2026-09-15T05:07:04.936Z`.

The provider's retained function-log review found 109 exact-path requests in
the retained window (50 `OPTIONS`/200, 55 `POST`/200, and 4 `POST`/403), while
the provider returned no rows for the queried June 3–16 slices. The durable
audit evidence corroborates historical activation outcomes across that gap,
but it is not a one-to-one request map: the audit insert is best-effort and
the provider query does not expose response bodies or request identifiers.

## Disposition

The evidence confirms historical use and preserves the non-destructive holds:
the two stale cancelled-job items and the 31 never-signed-in current ghost
accounts remain unchanged. The fail-closed guards remain deployed, reset
behavior remains supported, and no invitation, retry, repair, job close,
account mutation, Edge disable, or Edge delete was performed. Retirement stays
held pending the separate RBAC/security review and any request-by-request
export that may be required for a stronger historical reconstruction.
