# Audit: 2026-05-12 — academy-notification-bug-fix

**Trigger:** ad-hoc — bug investigation requested; fix confirmed live; recording closure
**Author:** Khian (Brian)
**Scope:** Academy-only users receiving `message`-type notifications they should never see. Full DB investigation covering both message pipelines, all notification trigger functions, migration history, and live data state.

---

## Findings

- **Root cause confirmed:** `fn_tm_on_message_insert` (on `public.tenant_messages`) originally iterated all conversation participants and inserted `user_notifications` rows without checking `access_scope`. Academy-only users (`access_scope = 'academy_only'`, `relationship_role = 'academy_user'`) were included in every loop iteration.

- **Fix already live:** Migration `20260511071820` (unnamed MCP migration, applied 11 May 2026 07:18 UTC) patched `fn_tm_on_message_insert` with an INNER JOIN to `tenant_users` that filters out any participant where `COALESCE(tu.access_scope, '') = 'academy_only'`. This is the real fix — this is the live pipeline.

- **Backfill ran:** The same migration deleted 27 contaminated `user_notifications` rows for academy users. As of 12 May 2026, the academy user (`d695317e`, tenant 7517) has zero `message`-type notifications.

- **Wrong function originally targeted:** The original bug report described fixing `fn_notify_conversation_participants`. That function lives on the `public.messages` table, which is explicitly **deprecated** (table comment: "DEPRECATED: superseded by public.tenant_messages as of the messaging cutover sprint"). The `messages` table has 0 rows; that trigger has never fired in production. Any fix applied there alone would have been applied to dead code.

- **Both functions patched:** Migration `20260511071820` correctly patched both `fn_tm_on_message_insert` (the live one) and `fn_notify_conversation_participants` (the deprecated one). The `messages` table will be hard-dropped in a future sprint; its trigger is irrelevant until then.

- **Migration is unnamed:** The fix was applied as a direct MCP migration with no name in `schema_migrations`. It is present in the DB's migration registry (`version = 20260511071820`) but has no corresponding file in the codebase's `supabase/migrations/` directory. This is a known gap in the dev workflow — tracked below under Open questions.

- **Portal users unaffected:** Primary and secondary contact users with `access_scope = 'full'` (e.g. tenant 7533) receive message notifications correctly. The INNER JOIN and filter do not affect them.

- **Staff exclusion by design:** Vivacity staff (AJ, Carl) are in `conversation_participants` for client conversations but have no `tenant_users` row for the client's tenant. The INNER JOIN silently excludes them from message notifications. This is consistent with staff using a separate internal inbox path — not a bug.

- **Edge cases all handled correctly:**
  - Multiple `tenant_users` rows across tenants: only the row matching `_tenant_id` is evaluated ✅
  - No `tenant_users` row at all: excluded by INNER JOIN, no error ✅
  - Duplicate notification events: `ON CONFLICT (dedupe_key) DO NOTHING` ✅
  - Notification failure blocking message save: wrapped in `EXCEPTION WHEN OTHERS → RAISE WARNING` ✅

---

## KB changes shipped

- unicorn-kb @ `07de819`: `codebase-state/messaging-pipeline.md` — new file documenting the two-table message pipeline, live trigger chain, academy_only filter logic, staff exclusion behaviour, and bug resolution history.

---

## Codebase observations (read-only)

- `unicorn-cms-f09c59e5@2ac73d59` — local HEAD at time of investigation ("Enabled security invoker on both"). Origin HEAD is `aa81aab0` ("Unscheduled legacy cron jobs") — 2 commits ahead. No messaging-related changes in those 2 commits.
- Migration `20260511071820` is present in the DB's `supabase_migrations.schema_migrations` but has no name field populated and no corresponding file in `supabase/migrations/`. Fix is live but not tracked in the codebase migration directory.
- `public.messages` table has 0 rows and a deprecation comment. The trigger `trg_notify_conversation_participants` is still attached but has never fired. Scheduled for hard-drop in a future sprint.

---

## Decisions

- No ADRs drafted.

---

## Open questions parked

- Should direct MCP migrations (like `20260511071820`) be back-filled into the codebase as named migration files? There is a drift risk: if Lovable ever ships a new migration that explicitly redefines `fn_tm_on_message_insert` without the academy filter, the fix would be silently overwritten. Low probability, high consequence. Recommend: add a named migration file in `supabase/migrations/` as a guard.

---

## Tag

`audit-2026-05-12-academy-notification-bug-fix`
