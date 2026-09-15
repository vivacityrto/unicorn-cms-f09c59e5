# 2026-09-15 — TOM P1.2-c ghost-retirement hold and historical invocation review

## Scope and authorization

Carl approved two non-destructive holds and a read-only historical function-log
review for the TOM P1.2-c retirement evidence packet:

- retain the two stale pending items in the two cancelled activation jobs
  unchanged, with no retry, close, delete, or repair;
- retain the 31 never-signed-in current `ghost_activation` accounts unchanged,
  with no bulk repair, invitation, or account mutation; and
- review the provider's retained function logs from the activation-job start
  period through the effective time of the merged fail-closed guards.

No live row, invitation, auth identity, profile, membership, job, contact, or
Edge deployment was changed.

## Observed evidence

The hosted fail-closed guards are active in `bulk-account-actions` version 284
and `cohort-access-sender-worker` version 283, both deployed at
`2026-09-15T05:07:04.936Z`.

The provider returned no retained function rows for the queried
`2026-06-03` through `2026-06-16` slices. This is a retention/coverage gap,
not proof that the legacy path was unused during that period. The retained
contiguous review from `2026-06-17T05:00:00Z` through guard deployment found
109 exact-path requests to `/functions/v1/activate-ghost-user`:

| Method/status | Count |
| --- | ---: |
| `OPTIONS` / 200 | 50 |
| `POST` / 200 | 55 |
| `POST` / 403 | 4 |

No exact-path request was observed in the final
`2026-09-13T05:00:00Z`–`2026-09-15T05:07:04.936Z` slice. The log provider does
not expose response bodies or row-level outcomes in this query, so the
55 `POST`/200 responses cannot be interpreted as 55 distinct successful
activations.

## Disposition and remaining gate

The approved holds remain documentation-only and preserve reset behavior. The
historical evidence is not a zero-caller proof: the retained history contains
legacy-path POST responses, and the earlier June window is unavailable from the
provider query. Keep the Edge Function deployed and fail-closed. Any disable,
delete, invitation, repair, retry, job close, or account mutation requires a
separate exact authorization after an alternative retained export or an
explicit acceptance of the historical evidence gap, plus the pending
RBAC/security review.
