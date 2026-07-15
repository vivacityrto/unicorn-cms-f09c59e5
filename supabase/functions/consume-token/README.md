# consume-token (historical / still-hosted)

Still ACTIVE on production (`yxkgdalkbrriasiyyrwk`). Validates an opaque
HMAC-signed token and returns `{ user_id, email, type, meta, token_id }`
without marking the row used.

Vendored alongside `issue-token` / `mark-token-used` for H3/H4 keeper-repo
reconciliation (function id a052c3a1-d965-447f-83a9-2abb2ae55dee, version 89).
No authorization change in this pass — possession of the signed token is the
gate. No in-repo callers were found.
