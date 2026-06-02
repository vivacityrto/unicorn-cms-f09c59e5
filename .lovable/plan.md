# Fix resend-invite edge function

Single-file edit: `supabase/functions/resend-invite/index.ts`. No migrations, no other files.

## Changes

**1. Payload type (line 71)** — add optional `skip_email`:
```ts
let payload: { invitation_id: string; skip_email?: boolean };
```

**2. Expiry (line 154)** — 24h → 7 days:
```ts
const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
```

**3. Update object (lines 159-164)** — also clear delivery fields:
```ts
.update({
  token_hash: newTokenHash,
  expires_at: newExpiresAt.toISOString(),
  last_sent_at: new Date().toISOString(),
  status: 'pending',
  delivery_status: null,
  delivery_event_at: null,
})
```

**4. VIVACITY_TENANT_ID (line 182)** — 319 → 6372. (Becomes dead since `userType` is no longer sent, but keep per the instruction to make minimal changes; remove only the usage in the send body.)

**5. skip_email branch** — after the update (step 8) and before email send, if `payload.skip_email === true`:
- Skip `send-invitation-email` invoke entirely
- Skip `audit_invites` insert
- Insert into `audit_eos_events` with `action: "copy_invite_link"` (same shape as resend log, no attempt count needed — use `attempt: null` or omit attempt; will omit attempt from details)
- Return:
  ```ts
  return jsonResponse(200, {
    ok: true,
    action_link: inviteUrl,
    detail: "Link generated without sending email",
    email: invitation.email,
  });
  ```

**6. send-invitation-email body (lines 187-193)** — replace with correct contract:
```ts
await supabase.functions.invoke('send-invitation-email', {
  body: {
    invitation_id: payload.invitation_id,
    token_plaintext: newToken,
  }
});
```

## Untouched

Auth/permission checks (1–5), token generation (7), accepted/revoked guard (6), normal-path `audit_invites` + `audit_eos_events` logging, all other files.
