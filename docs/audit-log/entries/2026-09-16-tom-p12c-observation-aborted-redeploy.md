# 2026-09-16 — TOM P1.2-c observation aborted by in-window redeployment

## Scope and evidence

This append-only entry records the final read-only check for the approved
60-minute production observation following the explicit deletion of
`activate-ghost-user`. The confirmed project remained
`yxkgdalkbrriasiyyrwk` (`https://yxkgdalkbrriasiyyrwk.supabase.co`). No
deletion, redeploy, migration, data write, rollback, credential change, or
other hosted action was performed during this check.

## Observation result

The observation window was `2026-09-15T23:30:00Z` through
`2026-09-16T00:30:00Z`. The final control-plane check at approximately
`2026-09-16T00:30:24Z` contradicted the immediate post-delete snapshot:

| Check | Final observed result |
| --- | --- |
| Edge Function inventory | 193, not the expected 192 |
| Exact `activate-ghost-user` lookup | Present and `ACTIVE`, version 1 |
| `activate-ghost-user` metadata | `updated_at` `2026-09-16T00:14:42Z`; legacy source returned, without the retirement guard |
| `bulk-account-actions` | ACTIVE v286, still contains `GHOST_ACTIVATION_RETIRED` and reset path |
| `cohort-access-sender-worker` | ACTIVE v285, still contains `GHOST_ACTIVATION_RETIRED` and reset path |
| Legacy-path request logs | 0 matching `function_edge_logs` rows in the exact observation window |
| `ghost_user_activated` audit events | 0 in `audit_eos_events` in the exact observation window |
| Activation jobs/items | 4 total; 0 open/running/failed; 2 cancelled and 2 completed; 0 locked; 0 unprocessed active; 2 stale pending held items |

The target and guard deployment timestamps show that the retired function was
recreated during the observation (`bulk-account-actions` updated at
`00:15:27Z`; the worker at `00:16:08Z`). The source of that redeployment is
not inferred here. Zero requests and zero audit events do not make the
retirement a clean observation because the retired function was present again.

## Disposition

P1.2-c reconciliation is **not closed**. The observation is invalidated by
the in-window target redeployment, and the PR/retirement closeout must not be
merged or presented as successful until the redeployment source is reconciled
and Carl decides whether a new deletion and fresh observation are authorized.

## Related records

- [2026-09-16 production deletion and observation](2026-09-16-tom-p12c-production-deletion-and-observation.md)
- [P1.2-c retirement evidence](../../kb/reference/tenant-operating-model/p1/p1-2-c-activate-ghost-retirement-evidence.md)
- [P1.2-c retirement decision packet](../../kb/reference/tenant-operating-model/p1/p1-2-c-ghost-activation-retirement-decision-packet.md)
- [P1.2-c operational retirement packet](../../kb/reference/tenant-operating-model/p1/p1-2-c-activate-ghost-retirement-operational-packet.md)
