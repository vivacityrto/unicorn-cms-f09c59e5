# Audit: 2026-05-15 — enum-to-dd Phase 3B + notification cron fixes (BUG-036, BUG-037)

**Trigger:** Lovable production DB change session — Phase 3B of the enum-to-`dd_` rollout, plus two follow-on production bugs surfaced during the Phase 3B audit.
**Author:** Khian (Brian)
**Scope:** Phase 3B (`notification_status` enum migration) and the two cron/notification bugs discovered while running the Phase 3B discovery snapshot. Out of scope: Phase 3C–3D (not started), Phase 4–5 (blocked pending Carl + Dave sign-off), BUG-020 cron JWT rotation (related but distinct cluster).
**Supabase project:** `yxkgdalkbrriasiyyrwk` — Unicorn 2.0-dev

---

## Findings

### Phase 3B — `notification_status` → `dd_notification_status` (complete)

Full enumtodd skill run completed across all 8 phases (Orientation → Migration-Ready Handoff). Carl + Dave sign-off confirmed before Phase 7.

**DB changes delivered (single migration `20260514233447_*` via Lovable Prompt C):**

- `public.dd_notification_status` created using the `dd_accounting_system` standard shape (`serial` id, `value text NOT NULL UNIQUE`, `label text NOT NULL`, `sort_order integer NOT NULL DEFAULT 0`, `is_active boolean NOT NULL DEFAULT true`, `created_at timestamptz NOT NULL DEFAULT now()`).
- Seeded with all 4 values byte-identical to enum labels: `queued`, `sent`, `failed`, `skipped`.
- RLS enabled with SELECT policy open to `authenticated`.
- `notification_outbox.status` column changed from `public.notification_status` enum to `text NOT NULL` via `USING status::text`. Default reset to plain text `'queued'` (PostgreSQL drops the default on type change — must be re-applied explicitly).
- FK `notification_outbox_status_fk` added referencing `dd_notification_status(value)` (no cascade modifiers).
- Both partial indexes on `notification_outbox` dropped and recreated without enum cast:
  - `idx_notification_outbox_status` — `WHERE (status = 'queued')` (was `'queued'::notification_status`)
  - `idx_notification_outbox_next_retry` — `WHERE (status = 'queued')` (was `'queued'::notification_status`)
- Index drop placed **before** the type change in Lovable's revised SQL, defensively avoiding any predicate-resolution issue during `ALTER COLUMN`.
- `COMMENT ON TYPE public.notification_status` added with retention notice: do not drop until Phase 3C and 3D complete. Legacy enum retained for rollback safety.

**Codebase changes:**

- TypeScript types regenerated post-migration (`src/integrations/supabase/types.ts`, 301-line diff). `notification_outbox.status` now typed as `string` with FK relationship to `dd_notification_status`. Legacy `notification_status: "queued" | "sent" | "failed" | "skipped"` entry still present in the `Enums` block — expected, will remain until Phase 3D and legacy enum archive.
- No `as any` casts to clean up — `process-notification-outbox` edge function already used `string` for its outbox interface; frontend `STATUS_CONFIG` in `RecentNotificationsCard.tsx` already used plain string keys; hand-written union type in `useTeamsNotifications.tsx` was already byte-identical to the four values.

**Post-deploy verification:** All 9 checks passed:
- `dd_notification_status` has 4 rows.
- All 4 values seeded correctly (`queued`/`Queued`/1, `sent`/`Sent`/2, `failed`/`Failed`/3, `skipped`/`Skipped`/4), all active.
- `notification_outbox.status` reports `data_type = text`, default `'queued'::text`.
- FK constraint `notification_outbox_status_fk` confirmed present via `pg_constraint` (information_schema query returned empty initially — `pg_constraint` is the authoritative source for non-standard constraint names).
- 0 NULL values in `notification_outbox.status`.
- 0 rows with values not in `dd_notification_status`.
- Row count 240 → 242 between pre-flight and post-deploy (two new rows inserted during the migration; confirms the new `'queued'` text default works for live inserts).
- Both partial indexes confirmed present with text predicates, no enum cast.
- Legacy `public.notification_status` enum still exists.

### BUG-036 — Notification outbox processor never running (resolved)

**Discovered:** Phase 3B Discovery Snapshot. Live DB scan showed 240 rows in `notification_outbox` all stuck at `status = 'queued'`, `attempt_count = 0`. Oldest row dated 25 March 2026 — nearly 7 weeks of undelivered Teams notifications. No `sent_at`, no `next_retry_at`, no `last_error` — meaning `process-notification-outbox` edge function had never run against any row.

**Root cause:** Live `cron.job` inventory showed jobs 3, 4, 5, 6, 8, 9 active — **no job 7**. The gap is where the `process-notification-outbox` cron job used to sit. Carl confirmed he had tinkered with cron jobs at some prior point. No scheduler existed for the outbox processor.

**DB changes delivered (migration `20260514233447_c6354641-3932-40da-90b6-716df2d99a3a.sql`):**

- Step 1: One-time backlog clear — 242 currently-queued rows set to `status = 'skipped'`, `sent_at = now()`, `last_error = 'Backlog cleared before cron activation (15 May 2026)'`. Filtered on `WHERE status = 'queued'` so any future row inserted as `'queued'` is unaffected.
- Step 2: `cron.schedule('process-notification-outbox', '*/5 * * * *', ...)` — calls the edge function via `net.http_post` using `private.cron_function_jwt()` for the Authorization header. Pattern mirrors working jobs 8 and 9 exactly.

**Decision recorded:** Backlog cleared rather than delivered. 7-week-old test notifications from Dave's earlier system testing — many referenced a stale Lovable preview URL in `base_url`. Delivering them to live Teams would have been operationally noisy.

**Post-deploy verification:**
- 0 rows in `notification_outbox` with `status = 'queued'` (all cleared).
- 242 rows with `status = 'skipped'`.
- New job 10 `process-notification-outbox` confirmed in `cron.job`, active, schedule `*/5 * * * *`.

### BUG-037 — Audit email automation broken across three functions (resolved)

**Discovered:** BUG-036 cron job audit. While inspecting `cron.job_run_details`, found that job 4 (`audit-24hr-confirmation`) had failed once — 14 May 2026 at 9pm UTC — with `function net.http_post(url => unknown, body => text, headers => jsonb) does not exist`. All previous runs of job 4 were `succeeded` not because the code worked, but because the inner `FOR r IN ... LOOP` had no matching rows (no opening meetings scheduled for the following day), so the broken `net.http_post` call was never reached.

**Root cause — two distinct bugs in three functions:**

1. `body := v_payload::text` passed to `net.http_post`. The actual function signature (`net.http_post(url text, params jsonb, headers jsonb, body jsonb, timeout_milliseconds int4)`) requires `body` as `jsonb`. The `::text` cast was incorrect from the day the functions were originally written.
2. `'Bearer ' || current_setting('app.supabase_service_key', true)` — the GUC `app.supabase_service_key` returns `NULL` in this database (verified via direct `current_setting` query). Even after the cast fix, the Authorization header would be `'Bearer '` with no token. Working cron jobs 8, 9, 10 use `private.cron_function_jwt()` instead, which reads from `vault.decrypted_secrets`.

Three affected functions, identical fix in each:
- `public.audit_send_24hr_confirmation()` — cron job 4 (RETURNS void)
- `public.audit_send_evidence_reminders()` — cron job 5 (RETURNS void)
- `public.audit_notify_docs_ready()` — trigger on `evidence_request_items` (RETURNS trigger)

**Origin of bug:** Functions were broken from when originally written (pre-12 May 2026). The 12 May search_path hardening migration (`20260512051450_4f4515c6-ee7f-471b-8b48-0e1fde41ce60.sql`, part of BUG-014 work) faithfully copied the broken bodies verbatim — its own comment states *"bodies copied verbatim from pg_get_functiondef"*. **The 12 May migration did not introduce the bug — it preserved it in migration history.** No correction to that migration is required; migration files are immutable.

**DB changes delivered (migration `20260515021328_30a57aef-fbf3-4960-aa0f-bdcc8040b98e.sql`):**

Single migration with three `CREATE OR REPLACE FUNCTION` blocks. In each function:
- `body := v_payload::text` → `body := v_payload`
- `'Bearer ' || current_setting('app.supabase_service_key', true)` → `'Bearer ' || private.cron_function_jwt()`

All other content preserved verbatim: `LANGUAGE plpgsql`, `SECURITY DEFINER`, `SET search_path = 'public'`, return types, DECLARE blocks, loop/trigger guard logic, payload construction, `INSERT INTO public.notification_schedule` in function 1, `UPDATE public.client_audits SET ai_analysis_status = 'pending'` and `RETURN NEW` in function 3.

**Post-deploy verification:** All three functions in live DB confirmed via `pg_get_functiondef`:
- No `::text` cast on `v_payload` in any function.
- All three use `private.cron_function_jwt()`.
- No remaining references to `app.supabase_service_key` in any of the three function bodies.

**Operational impact flagged for Angela:** The Dijan Training Program Limited opening meeting (audit `694047f0-...`, scheduled 15 May 2026 at 11:00am AEST, online Teams meeting) was booked by Angela on 30 April 2026. The 24-hour confirmation email to `rebecca.bond@sunrise.org.au` should have sent 14 May 2026 at 9pm UTC but didn't due to BUG-037. Manual follow-up required to confirm Rebecca has the Teams join link. Message to Angela drafted in-session for Khian to send.

---

## KB changes shipped

None this session. `EnumToDdInventory.md` and `BugOrganisation.md` live at the workspace root (not in `unicorn-kb/`) and were updated in place — Phase 3B marked `implemented (15 May 2026)`, BUG-036 and BUG-037 marked resolved with migration filenames and verification evidence.

---

## Codebase observations (read-only)

`unicorn-cms-f09c59e5` — three Lovable apply commits during this session:

- `bd01b55d` (pull at Phase 3B verification) — Phase 3B migration `20260514230627_*` plus the dd_notification_event Phase 3A follow-on migration `20260514053941_*` were already pulled prior to this session. Phase 3B specific migration applied via Lovable in-session.
- `a57437a2` (pull at BUG-036 verification) — `20260514233447_c6354641-3932-40da-90b6-716df2d99a3a.sql` — backlog clear + cron job activation.
- `7b500174` (pull at BUG-037 verification) — `20260515021328_30a57aef-fbf3-4960-aa0f-bdcc8040b98e.sql` — three function bodies updated. Same pull also brought in unrelated UI changes (ClientDocumentRequests, ClientDocumentsPage, ClientHomePage, ClientLayout, ClientTgaDetailsPage) — not part of this session's work, flagged here for traceability only.

All commits are gpt-engineer-app[bot] Lovable apply commits, no manual edits to the codebase from this session.

---

## Source precedence reconciliation

- Codebase ↔ live DB: aligned after the three migrations. `pg_proc` definitions, `pg_indexes`, `cron.job`, and `pg_constraint` all match what the migration files specify.
- KB ↔ live DB: `EnumToDdInventory.md` Phase 3B status reflects live state. `BugOrganisation.md` BUG-036 and BUG-037 clusters reflect live state.
- Memory ↔ KB: n/a — no memory updates needed; all findings are workflow-level facts captured in `BugOrganisation.md` and `EnumToDdInventory.md`.

---

## Open items / follow-ups

- **Send the Dijan / Rebecca Bond notification message to Angela.** Drafted in-session, not yet sent. Time-sensitive — opening meeting is today at 11:00am AEST.
- **BUG-020** (cron job JWT rotation, P0 SECURITY) remains open. Related to BUG-037 in that both touch cron auth, but distinct cluster — BUG-020 is about *hard-coded JWTs in jobs 1 & 2*, BUG-037 was about a *NULL GUC reference* in three SQL functions.
- **Phase 3C** (`notification_delivery_target` → `dd_notification_delivery_target`) next in the enum-to-dd stream. Two values (`dm`, `channel`), single column (`notification_rules.delivery_target`). Carl + Dave sign-off still required before Phase 6 of the enumtodd skill.
- **Drift signal worth noting:** the search_path hardening batch on 12 May 2026 (BUG-014 work) used `pg_get_functiondef` as its source of truth and faithfully copied broken function bodies. This is not a bug in the hardening migration itself — it did exactly what it was scoped to do — but it is a reminder that hardening batches do not catch logic bugs. Future hardening sweeps should be paired with an "are these functions actually working" check, not just an "are they search-path safe" check.

---

## Decisions recorded

- BUG-036: backlog of 242 stale queued rows marked `skipped` rather than delivered. Reason: 7-week-old test data with stale `base_url` references; delivery would have been operationally noisy with no business value.
- BUG-037: legacy `app.supabase_service_key` GUC reference removed from the three audit-email functions and replaced with `private.cron_function_jwt()`. The GUC itself is left in place (it returns NULL for these functions, so no other automation is currently relying on it being set). Future audit recommended on whether any other function in the schema still references this GUC.
- 12 May 2026 hardening migration left as-is. Migration files are immutable history; the live DB state is now correct via the new `CREATE OR REPLACE FUNCTION` migration. Replaying migrations from scratch would briefly apply the broken version then immediately overwrite it.
