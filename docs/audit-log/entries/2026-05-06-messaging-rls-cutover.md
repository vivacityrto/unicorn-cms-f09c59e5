# Audit: 2026-05-06 — messaging-rls-cutover

**Trigger:** ad-hoc — RLS vulnerability surfaced during codebase review of `tenant_messages`
**Scope:** Full messaging schema audit, RLS hardening, Help Center CSC unification, audit logging, realtime enablement, CI test suite. Did not touch `help_threads`/`help_messages` (chatbot/support channels), auth flow, or any non-messaging tables.

## Findings

- `public.messages` was the live operational table for client↔CSC messaging; `public.tenant_messages` existed in schema since 2026-02-10 but was never wired to any UI code — dead schema from an incomplete Feb 10 migration batch.
- `messages_select_tenant` policy on `public.messages` used `tenant_users` (no `status` filter) producing a tenant-wide SELECT — any tenant member could read every conversation in their tenant regardless of participation.
- `messages_update_tenant` had no `WITH CHECK` clause — any tenant member could rewrite `body`, `sender_id`, and `tenant_id` on any message in their tenant, including cross-tenant injection for users in multiple tenants.
- `messages_insert_participant` called deprecated `is_super_admin()` (no-arg wrapper) — latent breakage if the wrapper is ever dropped.
- `conversation_participants` controlled write access but not read access — the participant model was decorative for reads.
- `tenant_messages` had correct `has_tenant_access_safe`-based RLS but was never queried by any application code.
- Help Center CSC tab (`MessageTab.tsx`, channel=csc) wrote to `help_threads`/`help_messages` with no staff-side reader, no notification, and no link to `tenant_csc_assignments`. Messages were delivered to a black hole — confirmed by live data: 3 threads, all `channel='chatbot'`, zero CSC threads.
- `isolation.test.tsx` contained 13 tests all asserting `expect(true).toBe(true)` — no real RLS coverage in CI.
- `audit_events` had no entries for message send or read events.
- Sign-off document from Lovable incorrectly flagged §6.1 as "tm_select_staff missing" — live DB query confirmed `tm_select_staff` and `tm_insert_staff` are present and untouched; §6.1 was a false alarm.

## KB changes shipped

- No KB changes this session. Insights recommended for KB below (§ Open questions).

## Codebase observations

- unicorn-cms-f09c59e5 @ `c1dfd69d3ef3de2c05429e6355cce8e5bf60a5a2`: HEAD at time of audit. Codebase was behind origin by one commit at session start (local `bb9fcc51` vs origin `c1dfd69d`); session proceeded read-only on codebase, all changes applied via Lovable.

## Changes applied via Lovable (single sprint)

**Migration** `20260506045321_04d30627-a619-42f6-864b-c85bee117f5b.sql` — M1–M5 in one transaction:

- **M1** — Replaced `tm_select_tenant` (tenant-wide) with `tm_select_participant` (participant-scoped EXISTS on `conversation_participants`). Tightened `tm_insert_tenant` WITH CHECK to require participant membership in addition to tenant access. Added missing `tm_update_participant` policy (no UPDATE policy existed; silent fail for everyone). `tm_select_staff`, `tm_insert_staff`, `tm_delete_staff` left untouched.
- **M2** — Added `AFTER INSERT` audit trigger `trg_audit_tenant_message_send` → `fn_audit_tenant_message_send()` writing to `audit_events` (`entity='tenant_message'`, `entity_id=NEW.id`, `action='message_sent'`, `body_length` not body).
- **M3** — Added `AFTER INSERT` orchestration trigger `trg_tm_on_message_insert` → `fn_tm_on_message_insert()` that (a) touches `tenant_conversations.last_message_at`/`last_message_preview`, (b) fans out idempotent `user_notifications` rows per participant with `dedupe_key='tm:<message_id>:<user_id>'` enforced by partial unique index `user_notifications_dedupe_key_idx`. Notification loop wrapped in `EXCEPTION WHEN OTHERS THEN RAISE WARNING` — notification failure never blocks a send.
- **M4** — `COMMENT ON TABLE public.messages` marking it deprecated. Hard-drop deferred to follow-up sprint.
- **M5** — `REPLICA IDENTITY FULL` on `tenant_messages` and `tenant_conversations`. Both tables added to `supabase_realtime` publication via idempotent `DO $$` guards.

**UI rewire** (3 files):

- `useClientCommunications.ts` — switched to `tenant_messages`, `sender_user_uuid`/`sender_type` on INSERT, `sender_id` alias preserved for downstream consumers, fire-and-forget read-event audit, `useConversationRealtime` helper hook.
- `TeamCommunicationsPage.tsx` — same table/column swap, `sender_type:'staff'`, read-event audit, realtime subscription with cleanup.
- `MessageTab.tsx` (channel=csc only) — rewired from `help_threads`/`help_messages` to `tenant_conversations`/`tenant_messages`. Resolves or creates a `topic='csc'` conversation, upserts self and primary CSC as participants before first send. `cscInitFailed` state surfaces a user-facing toast and disables send if participant init fails. Support and chatbot channels untouched.

**CI tests** (`src/test/tenant/isolation.test.tsx`):

- 13 legacy placeholder tests preserved verbatim.
- 15 new live RLS tests added under `describe.sequential.skipIf(!SUPABASE_SERVICE_ROLE_KEY)`. Covers 4 personas (A1, A2, B1, S), 4 conversations (convA, convA2, convA_noStaff, convB), RLS violations asserted on error code `42501`, audit trigger verified via captured message UUID. `convA_noStaff` (no staff participant) proves `tm_select_staff` genuinely bypasses participant check. Run-namespaced via `RUN_ID` for safe concurrent runs.

## Decisions

- `public.messages` → `public.tenant_messages` as live messaging table. Decision: fix `messages` RLS in place was rejected in favour of completing the intended Feb 2026 design; zero data in either table eliminated migration risk.
- Help Center CSC tab unified into `tenant_conversations`/`tenant_messages` rather than removed or redirected. Product owner decision.
- RLS SELECT scope: participant-scoped (not tenant-wide). Conversations list remains tenant-wide via `tc_select_tenant` for admin oversight. Asymmetry intentional and documented.
- Membership check: `has_tenant_access_safe` (uses `tenant_members` with `status='active'`) — inherited from `tenant_messages` design, not retrofitted.
- Read-event audit: application-layer, fire-and-forget, one row per conversation fetch. Send-event audit: DB trigger.
- Realtime: enabled. `REPLICA IDENTITY FULL` required for full row diffs on `tenant_conversations` UPDATE payloads.
- CSC reassignment: add new participant, never remove prior (preserves audit trail).
- `user_notifications.dedupe_key` unique constraint added as partial index (`WHERE dedupe_key IS NOT NULL`) — caught during review; Lovable's plan claimed idempotency without the constraint, which was incorrect.

## Open questions parked

- **`public.messages` hard-drop**: schedule for next sprint after one release window of confirmed zero reads. Inventory at drop time: 5 indexes, 5 RLS policies, 0 triggers, 0 inbound FKs.
- **Notification fan-out reconciliation**: no retry mechanism exists for failed fan-outs (caught by `EXCEPTION WHEN OTHERS`). Recommend a periodic reconciliation job.
- **CI secret gate**: `SUPABASE_SERVICE_ROLE_KEY` must be present in CI for live RLS tests to execute; without it the suite skips cleanly. Add a CI job-level assertion that the secret is set on `main`-branch runs so a missing secret fails the build instead of silently skipping.
- **KB doc recommended**: the three-messaging-system landscape (`messages`, `tenant_messages`, `help_threads`) and the resolution warrant a `unicorn-kb/codebase-state/` entry documenting the final messaging architecture for future sessions. Not authored here — separate KB session.

## Tag

audit-2026-05-06-messaging-rls-cutover
