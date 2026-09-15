# 2026-09-16 — TOM P1.2-c production `activate-ghost-user` deletion and observation

## Scope and authorization

This entry records the approved production retirement action for the legacy
`activate-ghost-user` Edge Function. Carl explicitly approved the complete
read-only preflight, permanent deletion, immediate verification, and bounded
60-minute read-only observation sequence, then confirmed the final deletion
action at action time. Production project ref `yxkgdalkbrriasiyyrwk` was the
confirmed target. No QA project switch, migration, invitation, credential
change, account repair, job repair, or unrelated production operation was
authorized or performed.

The earlier `unicorn-qa` disable-first packet was not executed: its approved
control plane did not contain the historical target function. The production
action was separately re-targeted and explicitly approved after that mismatch
was recorded.

## Preflight and immediate post-delete evidence

The final read-only checks confirmed the preserved caller guards and no queued
activation work before the permanent deletion. After deletion through the
authorized Supabase control plane:

| Check | Observed result |
| --- | --- |
| Edge Function inventory | 193 before; 192 after |
| Exact `activate-ghost-user` lookup | `Function not found` |
| `bulk-account-actions` guard | `GHOST_ACTIVATION_RETIRED` remains deployed |
| `cohort-access-sender-worker` guard | `GHOST_ACTIVATION_RETIRED` remains deployed; reset action remains supported |
| Open activation jobs | 0 |
| Locked activation items | 0 |
| Unprocessed activation items | 0 |
| Historical activation jobs | 4 total; all non-open |
| Writes to jobs, accounts, invitations, or unrelated functions | 0 |

The two stale cancelled-job items and the approved account-level hold remain
unchanged. No identifiers, tokens, or source secrets are included in this
entry; the private operator record contains only redacted aggregate evidence.

## Observation disposition

The approved minimum 60-minute read-only observation began after the immediate
post-delete checks. At the time this entry was prepared, the window had not
yet elapsed, so final request/log/audit verification remains pending. A clean
observation completion entry must be added before P1.2-c is marked fully
closed. Any unexpected legacy-path request, reset-path regression, audit
anomaly, target drift, or platform error is an abort condition and must be
recorded separately.

## Related records

- [P1.2-c retirement evidence](../../kb/reference/tenant-operating-model/p1/p1-2-c-activate-ghost-retirement-evidence.md)
- [P1.2-c retirement decision packet](../../kb/reference/tenant-operating-model/p1/p1-2-c-ghost-activation-retirement-decision-packet.md)
- [P1.2-c operational retirement packet](../../kb/reference/tenant-operating-model/p1/p1-2-c-activate-ghost-retirement-operational-packet.md)
- [2026-09-15 P1.2-c final QA preflight abort](2026-09-15-tom-p12c-retirement-preflight-abort.md)
