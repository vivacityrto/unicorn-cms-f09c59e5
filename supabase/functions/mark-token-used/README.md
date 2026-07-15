# mark-token-used (historical / still-hosted)

Still ACTIVE on production (`yxkgdalkbrriasiyyrwk`). Finalizes an `auth_tokens`
row after the caller completes the action the token authorized.

Vendored into the keeper repo as part of closing **H4** from the 14 Jul 2026
Unicorn security audit follow-up:

- Request body must include both `token` (raw opaque string) and `token_id`.
- Server re-hashes `token` (SHA-256) and requires it to match the row's
  `token_hash` before setting `used_at` — proves possession, not merely
  knowledge of the uuid primary key.
- Note: `auth_tokens.id` is `uuid` / `gen_random_uuid()` (not serial); the
  residual risk is leak-then-invalidate, not brute-force guessing.

No in-repo callers of this function were found (frontend or edge). Any live
out-of-repo client that still posts `{ token_id }` only must be updated to
also send `token` before deploy. Do **not** stub-redeploy a 410.
