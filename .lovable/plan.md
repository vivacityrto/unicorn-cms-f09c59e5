
## Scope

Additive changes to the client-portal Users page (`/client/users`). No new edge functions, no RLS changes, no changes to invite/reset edge functions or `generate-recovery-link` (stays Super-Admin-only).

## 1. Migration — extend `v_client_tenant_users`

`CREATE OR REPLACE VIEW public.v_client_tenant_users` reproducing the current definition verbatim, with only these additions:

- **`active_users` CTE**: append six NULL literals (`delivery_status text`, `delivery_event_at timestamptz`, `open_count integer`, `first_opened_at timestamptz`, `click_count integer`, `first_clicked_at timestamptz`).
- **`pending_invites` CTE**: select the corresponding real columns from `user_invitations`.
- **Both branches of the outer `UNION ALL`**: add the same six column names, in the same position (right after `mailgun_message_id`).

No other change to filters, joins, WHERE clauses, or security-invoker attribute. Follow with `NOTIFY pgrst, 'reload schema';`.

## 2. Type — `src/hooks/use-client-tenant-users.ts`

Extend `ClientTenantUserRow` with the six optional/nullable fields (`delivery_status` narrowed to `'delivered' | 'bounced' | 'failed' | 'complained' | null`, timestamps as `string | null`, counts as `number | null`). Query already uses `select("*")` — no query change needed.

## 3. Mutations — `src/components/client/users/useInviteMutations.ts`

Add two mutations mirroring the existing `resend`/`revoke` pattern (same `useMutation` shape, same `invalidate()` call reusing the `client_tenant_users` + `userCapacityKeys` query keys):

- **`copyLink`** — invokes `resend-invite` with `{ invitation_id, skip_email: true }`. On success, `navigator.clipboard.writeText(data.action_link)` inside a try/catch; fallback toast shows the raw link. Success toast: "Link copied — paste it into Teams, email, or WhatsApp." Invalidates same keys as `resend`.
- **`resetPassword`** — invokes `send-password-reset` with `{ user_uuid }`. Uses existing `extractEdgeError` helper to unwrap `code`/`detail`; specifically surfaces `AUTH_USER_NOT_FOUND` with the "hasn't activated yet" message (mirroring `TenantUsersTab.tsx`). Success toast confirms email address from response body.

Both returned from `useInviteMutations()` alongside `invite`, `resend`, `revoke`.

## 4. UI — `src/components/client/ClientUsersPage.tsx`

- Import `Eye`, `MousePointerClick`, `Link as LinkIcon`, `KeyRound` from `lucide-react`.
- **StatusDot** (invited rows only): render the two-badge pattern from `ManageInvites.tsx` — destructive/warning badge for `delivery_status ∈ {bounced, failed, complained}` with the same label mapping, plus outline badge with Eye/MousePointerClick when `first_opened_at`/`first_clicked_at` present (clicked > opened), with the same tooltip format.
- **Invited-row dropdown** (`canManagePortalUsers` gate unchanged): insert a "Copy invite link" item between Resend and Revoke, wired to `copyLink.mutate(row.row_key)`.
- **Active-row dropdown** (new): when `row.row_type === "active" && row.user_id && canManagePortalUsers`, render a dropdown with a single "Reset password" item wired to `resetPassword.mutate(row.user_id!)`. Mirror any self-exclusion pattern already used elsewhere in the file if present.

## 5. Out of scope

No changes to `generate-recovery-link` exposure, `invite-user`, `resend-invite`, `cancel-invite`, `send-password-reset`, `InviteUserDialog`, or any RLS policy.

## Verification

- Diff view definition — only 6 columns added.
- As tenant admin: bounced invite shows Bounced badge; opened invite shows Opened badge.
- Copy Link writes a working `/accept-invitation?token=...` URL to clipboard; row's `last_sent_at`/`expires_at` refresh.
- Reset Password fires `send-password-reset` and toasts success (or friendly `AUTH_USER_NOT_FOUND` message).
- Actions hidden for `user`/`academy_user` rows (existing `canManagePortalUsers` gate).
- `rg generate-recovery-link src/components/client src/pages/client` returns nothing.
