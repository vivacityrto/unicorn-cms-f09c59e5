In `supabase/functions/invite-user/index.ts`, find the `skip_email` path where a new user is inserted into `public.users` (lines 428-440). The insert currently omits `tenant_id`.

Change:
- Add `tenant_id: payload.tenant_id` to the `.insert({...})` object on line 429.

Constraints:
- Do not modify the `update` path (existing user found by email, lines 421-423).
- Do not change anything else in this file.
- No other files need to change.

The `payload.tenant_id` is already validated earlier in the function and is available in scope.