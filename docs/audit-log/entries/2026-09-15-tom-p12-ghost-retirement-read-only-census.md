# 2026-09-15 — TOM P1.2-c read-only ghost-retirement census

## Scope and authorization

Carl approved a bounded, read-only evidence pass after the indirect
`activate-ghost-user` callers were frozen. The pass was limited to aggregate
SQL counts and a provider-log observation. It did not close, retry, delete, or
mutate jobs; alter invitations, auth identities, profiles, memberships, or
contacts; deploy or disable an Edge Function; or export identifiers.

## Observed live state

- Activation jobs: 4 total — 2 completed and 2 cancelled.
- Completed activation jobs account for 2 sent items.
- The 2 cancelled activation jobs retain 2 pending item rows. No queued,
  running, failed, or currently locked activation items were observed.
- `auth.users`: 223 total; 41 rows carry `ghost_activation = true`, including
  31 that have never signed in and 10 that have signed in. All 41 have a
  matching public profile. One auth user has no stored encrypted password
  overall; none of the 41 ghost-flagged users are in that subset.
- `public.users`: 627 total; 411 profiles have no matching auth identity.
  This is a broad legacy-profile population, not a ghost-activation
  classification.
- `user_invitations`: 35 `sent` rows have no token hash and all are expired;
  57 `pending` rows remain, with 2 currently open under the expiry/revocation
  test.

The available unified function-log window covered
`2026-09-14T05:12:00.908` through `2026-09-15T05:10:02.917` and contained zero
requests to `/functions/v1/activate-ghost-user`.

## Interpretation and boundary

The static caller closure is complete on merged `origin/main` commit
`c09bcac99`, and the available 24-hour observation is clean. The two cancelled
jobs with pending items, the 31 never-signed-in ghost-flagged accounts, the
expired legacy invitation ledger, and the broader profile/auth mismatch still
need an explicit hold or completion plan. A single 24-hour log window is not
historical zero-caller proof; an owner-approved longer window or retained log
export remains required. Edge Function retirement is not authorized by this
entry.
