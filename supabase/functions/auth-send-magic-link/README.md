# auth-send-magic-link (retired)

Unauthenticated orphan on production (`yxkgdalkbrriasiyyrwk`). Anyone who could
hit the endpoint could call `admin.generateLink` + Mailgun for an arbitrary
email — no caller JWT required.

- **Callers:** none in this repo (Login uses `supabase.auth.signInWithOtp`)
- **Survivor:** `send-magic-link` (gated: self-service email match or
  `admin.team_users.manage` / `full`)
- **Neutralization:** HTTP `410` stub (`FUNCTION_RETIRED`), same pattern as
  `create-session` / C1

Do **not** restore the historical generateLink path.
