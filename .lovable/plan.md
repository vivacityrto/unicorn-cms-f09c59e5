Update `supabase/functions/activate-ghost-user/index.ts` with two changes:

1. **Step 4 ghost lookup** — add `unicorn_role` to the `.select()`:
   - Change `.select("email, first_name, last_name")` to `.select("email, first_name, last_name, unicorn_role")`

2. **Insert into `user_invitations` after Step 9 (Mailgun)** — add a best-effort block before the audit insert (Step 10):
   - Insert a row with `email`, `status: "sent"`, `invited_by: caller.id`, `tenant_id: body.tenant_id`, `unicorn_role: ghost.unicorn_role ?? "User"`, `first_name`, `last_name`, and `last_sent_at`
   - Wrap in `try/catch` so a logging failure never blocks activation

No other files, edge functions, database objects, or UI components are touched.