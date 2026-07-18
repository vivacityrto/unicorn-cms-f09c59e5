# auth-generate-password-reset (retired)

Unauthenticated orphan on production (`yxkgdalkbrriasiyyrwk`). Duplicated
`send-self-password-reset` with no in-repo callers — Login uses
`send-self-password-reset` only (`src/pages/Login.tsx`).

## Live probe (18 Jul 2026)

Anti-enumeration body was already deployed for known vs unknown emails, but
signals remained:

| Condition | Live response |
|-----------|---------------|
| Known active email | `200 {"ok":true,"message":"If an account exists…"}` |
| Nonexistent email | `200` same body |
| Malformed email (`not-an-email`) | `400 {"ok":false,"code":"MISSING_EMAIL",…}` |
| Timing | Known path ~2–3s (Mailgun); unknown ~0.9–1.4s |

`send-self-password-reset` returns the same generic `200` for malformed emails
(only empty/missing email → `400 MISSING_EMAIL`).

## Neutralization

- **Callers:** none in this repo
- **Survivor:** `send-self-password-reset`
- **Stub:** HTTP `410` (`FUNCTION_RETIRED`), same pattern as
  `auth-send-magic-link` / `create-session`

Do **not** restore the historical generateLink + Mailgun path.
