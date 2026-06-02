Surgical edit to `supabase/functions/activate-ghost-user/index.ts` only.

1. After the Mailgun fetch, read the JSON response body when `mg.ok` is true and extract the `id` field into a local variable.
2. Declare that variable (`mailgunMessageId`) before the Mailgun fetch block.
3. Include `mailgun_message_id: mailgunMessageId` in the `user_invitations` insert so the mailgun-webhook can match delivery events back to this invitation.

No other logic changes. No auth, ghost lookup, UUID creation, recovery link generation, audit logging, or response shape changes. No database migrations — the `mailgun_message_id` column already exists on `user_invitations`.