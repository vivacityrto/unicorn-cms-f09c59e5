# auth-generate-password-reset (historical / orphan)

Still ACTIVE on production (`yxkgdalkbrriasiyyrwk`) with `verify_jwt = false`.
**No in-repo frontend callers** — the Login “Forgot Password” flow invokes
`send-self-password-reset` only (`src/pages/Login.tsx`).

## Why this file exists

The live edge function was missing from the keeper repo. Live probes (18 Jul 2026)
showed account enumeration:

| Condition | Live response |
|-----------|---------------|
| Missing / invalid email | `400 {"error":"Valid email is required"}` |
| Unknown email | `500 {"error":"Failed to create reset link"}` |
| Known email | `200 {"ok":true}` |

This vendored source ports `send-self-password-reset`’s anti-enumeration
response (always the same generic 200 message), its `users.disabled` gate, and
shared per-email / per-IP rate limiting (`_shared/password-reset-rate-limit.ts`,
invite-user-style 5/email/hour plus 20/IP/hour).

Deploy this patched source when ready. Prefer routing new clients to
`send-self-password-reset`; keep this endpoint hardened while anything external
may still call it.
