Replace the single `ghost_activation` flag gate in `supabase/functions/set-invite-password/index.ts` with a two-condition check.

Current logic (lines 109-116):
- Rejects password reset if `ghost_activation` flag is missing.

New logic:
- Allow if `ghost_activation === true` (existing behaviour).
- If flag is missing, query the `users` table for `last_sign_in_at`.
- Allow if `last_sign_in_at` is null (user has never signed in and therefore has no known password).
- Reject only if both conditions fail.

This prevents blocking legacy ghost-activated accounts that predate the `ghost_activation` metadata flag.

No other changes to the file, edge function, or database.