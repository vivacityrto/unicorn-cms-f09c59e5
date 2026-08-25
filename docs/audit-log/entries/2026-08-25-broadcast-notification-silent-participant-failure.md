# Audit: 2026-08-25 — broadcast notification silent participant failure

**Trigger:** ad-hoc — Carl reported the new client-portal "welcome" unread-
notification dialog (`ClientNotificationReview`, added in PR #400) never
appeared after logging into the Demo RTO account to test a broadcast Angela
had just sent.
**Scope:** `send-broadcast-campaign` edge function, the equivalent flow in
`TeamCommunicationsPage.tsx`, and a targeted data backfill for the one
affected campaign. No RLS or schema changes.

## Findings

- `ClientNotificationReview` (`src/components/client/ClientNotificationReview.tsx`)
  is correctly wired into `ClientLayout` and reads unread rows from
  `user_notifications` via `useClientNotifications` — working as designed.
  `useYouveGotMailToast` (the staff-only "You've got mail!" toast) was a red
  herring initially suspected — it's gated to `is_vivacity_internal` and was
  never meant to fire for a client account.
- `user_notifications` rows for message-type notifications are created by a
  trigger (`fn_tm_on_message_insert`, `AFTER INSERT ON tenant_messages`) that
  loops over `conversation_participants` for the message's conversation — not
  by any direct write from the app or edge function.
- `send-broadcast-campaign/index.ts` builds `tenant_conversations` +
  `conversation_participants` + `tenant_messages` per tenant. Its
  client-participant step (`conversation_participants` upsert sourced from
  `tenant_users`) had **no error check at all**. `conversation_participants.user_id`
  FKs to `auth.users(id)`, not `public.users` — so a `tenant_users` row whose
  `user_id` has no matching `auth.users` row makes the *entire batch upsert*
  fail with a foreign-key violation, per Postgres's normal batch-insert
  semantics.
- Confirmed via `postgres_logs`: two `insert or update on table
  "conversation_participants" violates foreign key constraint
  "conversation_participants_user_id_fkey"` errors at 2026-08-25 06:22:33 and
  06:22:37 UTC, exactly matching the "New AI Documents" campaign send.
- Of 44 tenants that campaign delivered to, exactly 2 ended up with zero
  `client`-role `conversation_participants` rows: tenant 7547 (Demo RTO) and
  tenant 7528 (a real, active client — "Melloz Services Training").
  - Tenant 7547's batch failed because of 3 seeded/fixture demo profiles
    (`Ella Fisher`, `Daniel Evans`, `Chloe Davis`, all `@demorto.example.com`)
    with no `auth.users` row — likely intentional decorative team members for
    demo screenshots, never meant to log in.
  - Tenant 7528's batch failed because of one real client contact ("Melissa
    Inunciaga", `melissa@mellozservicestraining.com.au`) with no matching
    `auth.users` row at all — parked as a separate follow-up (not a demo
    fixture; looks like a genuine broken/incomplete account provisioning).
- Because the batch failed silently (no error check), `total_sent` still
  counted these tenants as delivered, `broadcast_recipients.delivery_status`
  was still set to `"sent"`, and the message itself existed — the *only*
  symptom was the complete absence of `conversation_participants` (and
  therefore `user_notifications`) rows for every real user in both tenants,
  including Carl's own `carl+demo@vivacity.com.au` account.
- The identical pattern (unchecked batch upsert, same FK) exists in
  `src/pages/TeamCommunicationsPage.tsx`'s "start new conversation" flow —
  it does check the error, but throws immediately rather than falling back,
  so one bad `tenant_users` row would permanently block staff from ever
  starting a new conversation with that tenant.

## Code changes (this entry accompanies one)

- `supabase/functions/send-broadcast-campaign/index.ts`: client-participant
  upsert now checks its error and falls back to a row-by-row upsert on
  failure, logging (not swallowing) any row that's individually skipped.
  Deployed live via Supabase MCP (`send-broadcast-campaign` version 140).
- `src/pages/TeamCommunicationsPage.tsx`: identical row-by-row fallback
  applied to the "start new conversation" flow's client-participant upsert.
- `AGENTS.md`: added a guardrail — any batch upsert into a table with an FK
  to `auth.users` must check the error and retry row-by-row, since one
  orphaned `public.users`/`tenant_users` row otherwise silently sinks every
  other row in the same batch.

## Data backfill (same PR)

For the one affected campaign ("New AI Documents", `broadcast_campaigns.id =
a654d379-ca8e-46d4-98dd-45713e086481`), directly inserted the
`conversation_participants` + `user_notifications` rows that the trigger
would have created had the batch upsert not failed — scoped to real
(`auth.users`-having), non-`academy_only` `tenant_users` rows for tenants 7547
and 7528 only, mirroring `fn_tm_on_message_insert`'s exact shape (same title/
message/link/dedupe_key format) via `ON CONFLICT ... DO NOTHING` for safety.
Verified: `carl+demo@vivacity.com.au` and 6 other real users across the two
tenants now have the expected unread `type = 'message'` notification.

No other campaigns were swept for the same failure mode — this backfill is
scoped to the one campaign Carl was actively testing, not a general repair of
historical broadcasts.

## Decisions

- Did not delete or alter the 3 orphaned demo/fixture profiles in tenant
  7547 — they may be intentional decorative team members for Demo RTO
  screenshots, and the code fix means they no longer poison delivery to real
  participants regardless.
- Did not investigate tenant 7528's orphaned real client contact
  (Melissa Inunciaga) in this session — parked as a separate follow-up per
  Carl's explicit request, since it looks like a genuine account
  provisioning gap rather than deliberate fixture data.
- Did not sweep historical broadcast campaigns for the same silent-failure
  pattern — scoped this fix to the campaign actually being tested.

## Open questions parked

- Whether any other tenants across the platform have `tenant_users` rows
  with no matching `auth.users` row (the query used here — `left join
  auth.users` — would need to run platform-wide to know the true blast
  radius of this bug on other, older campaigns).
- Root cause of tenant 7528's Melissa Inunciaga having no auth account —
  incomplete invitation, deleted auth account, or a migration/import gap.
