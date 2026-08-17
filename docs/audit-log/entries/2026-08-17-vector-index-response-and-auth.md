# Audit: 2026-08-17 — vector index response context and authorization

**Trigger:** security-remediation consequence audit.
**Scope:** `vector-index-rebuild`, `vector-index-remove`, and `vector-index-update` hosted Edge Functions.

## Findings

- All three functions used request-aware response helpers with the old argument shape. Any success or error response could throw while resolving CORS headers.
- `vector-index-update` validated that a caller was internal staff but, unlike the matching destructive rebuild/remove operations, did not require `admin.vector.manage`. An internal staff user without that permission could update or delete a record's embeddings.

## Remediation

- Pass the inbound `Request` to each shared JSON response helper.
- Require `admin.vector.manage` in `vector-index-update`, matching the other vector administration functions.

## Deployment verification

- PR #318 was created before deployment. The exact committed bundles were deployed to hosted `vector-index-rebuild`, `vector-index-remove`, and `vector-index-update`, all at version 527 on 2026-08-17. Their existing `verify_jwt: false` settings were preserved because each validates the caller in its handler.
- Retrieved each hosted source after deployment. All shared JSON responses receive the inbound request; `vector-index-update` contains the `FeatureKeys.adminVector` permission gate.
- Local verification passed: `node supabase/functions/vector-index-response-auth.test.mjs` and `npx tsc --noEmit`.
