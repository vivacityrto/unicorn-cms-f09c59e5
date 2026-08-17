# Audit: 2026-08-17 — retire exposed Vimeo duration backfill

**Trigger:** final security audit of legacy Edge Functions with
`verify_jwt=false`.

## Finding

`backfill-vimeo-durations` was an active one-off function with wildcard CORS
and no authentication. A GET enumerated `training_videos` missing durations,
including their private Vimeo URLs; a POST accepted arbitrary video IDs and
duration values and updated them using `SUPABASE_SERVICE_ROLE_KEY`.

No repository caller was found. This was an externally reachable
service-role read/write surface.

## Remediation

- Created PR #324 before deployment.
- Replaced the implementation with the tracked single-file 410
  `FUNCTION_RETIRED` response.
- Deployed the exact source as production version 24.
- Retrieved the hosted function after deployment and verified it has the
  retirement response, no service-role key, and no CORS header.

## Consequence

The obsolete backfill endpoint is no longer available. No tracked product flow
depends on it; any unknown external caller now receives 410.
