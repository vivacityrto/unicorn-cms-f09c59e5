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

- Pending PR creation, deployment of the exact committed bundle, and hosted-source verification.
