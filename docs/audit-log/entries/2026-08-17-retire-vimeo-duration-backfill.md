# Audit: 2026-08-17 — harden Vimeo duration backfill

**Trigger:** final security audit of legacy Edge Functions with
`verify_jwt=false`.

## Finding

`backfill-vimeo-durations` was an active function with wildcard CORS and no
authentication. A GET enumerated `training_videos` missing durations,
including their private Vimeo URLs; a POST accepted arbitrary video IDs and
duration values and updated them using `SUPABASE_SERVICE_ROLE_KEY`.

No repository caller was found. This was an externally reachable
service-role read/write surface.

## Remediation

- Created PR #324 before the hardened deployment.
- The first audit response incorrectly retired the function after relying on
  an incomplete caller search. The tracked Super Admin UI calls it directly;
  the retirement was therefore reverted in favour of a secure implementation.
- The replacement preserves the UI's `{ batchSize }` contract, fetches Vimeo
  durations server-side, validates a bearer token with `auth.getUser`,
  requires an active `Super Admin`, bounds batches to 200 records, and returns
  the UI's `updated`, `skipped`, `errors`, and `remaining_null` response shape.
- Its CORS response is origin-allowlisted rather than wildcard.
- Deployed the corrected, source-matched secure handler as production version
  25 and retrieved the hosted source after deployment. It validates the bearer
  token via `auth.getUser`, enforces the active Super Admin check, preserves
  the `batchSize` / result contract, and contains no wildcard CORS response.

## Consequence

The Super Admin Academy Builder workflow remains available after deployment.
Anonymous, non-Super-Admin, malformed, and over-large requests are rejected.
