# Phase 2 — Column type migration, FKs, RPC signature

Scope: switch the three enum-typed columns to `text` referencing `public.dd_notification_event(value)`, and rewrite `public.emit_notification` to accept `text`. No application code changes in this phase. The enum type itself is **not** dropped here — that is Phase 3.

## Affected database objects

Columns currently typed `public.notification_event_type`:
1. `public.notification_rules.event_type` (NOT NULL, part of `unique_user_event` UNIQUE constraint)
2. `public.notification_outbox.event_type` (NOT NULL)
3. `public.notification_audit_log.event_type` (NOT NULL)

Function:
- `public.emit_notification(p_event_type public.notification_event_type, p_recipient_user_uuid uuid, p_record_type text, p_record_id uuid, p_payload jsonb, p_tenant_id integer, p_client_id integer)`

## Migration steps (single migration file)

1. **Pre-flight integrity check** — assert every distinct `event_type` value across the three tables exists in `dd_notification_event.value`. Fail loudly if not (RAISE EXCEPTION). All 10 enum values are already seeded, so this should pass; the check protects against any unseen value.

2. **Drop the existing function signature**
   ```
   DROP FUNCTION public.emit_notification(
     public.notification_event_type, uuid, text, uuid, jsonb, integer, integer
   );
   ```
   Required because Postgres won't let us change a parameter type in place, and because the enum type cannot be dropped later while a function depends on it.

3. **Alter columns from enum to text** (cast is implicit-safe: `enum::text` yields the label)
   ```
   ALTER TABLE public.notification_rules
     ALTER COLUMN event_type TYPE text USING event_type::text;
   ALTER TABLE public.notification_outbox
     ALTER COLUMN event_type TYPE text USING event_type::text;
   ALTER TABLE public.notification_audit_log
     ALTER COLUMN event_type TYPE text USING event_type::text;
   ```
   The `unique_user_event` UNIQUE constraint on `notification_rules(user_uuid, event_type)` survives a TYPE change of one of its columns automatically.

4. **Add FKs to `dd_notification_event(value)`**
   - `notification_rules.event_type` → `dd_notification_event(value)` ON UPDATE CASCADE ON DELETE RESTRICT
   - `notification_outbox.event_type` → same
   - `notification_audit_log.event_type` → same
   Named `fk_<table>_event_type` for clarity.

5. **Recreate `emit_notification` with `text` signature**
   - Same body as today, only `p_event_type` is now `text`.
   - Keep `SECURITY DEFINER`, `SET search_path = ''`, fully qualify all objects per project standard.
   - Add a defensive lookup at the top: `IF NOT EXISTS (SELECT 1 FROM public.dd_notification_event WHERE value = p_event_type AND is_active) THEN RAISE EXCEPTION 'Unknown or inactive notification event_type: %', p_event_type; END IF;`
   - Behaviour preserved: default-enabled when no rule row exists, returns inserted outbox `id` or `NULL` when disabled.

6. **Re-grant EXECUTE** on the new function to the same roles the old one had (`authenticated`, `service_role` — confirm via `pg_proc`/`information_schema.routine_privileges` before writing the GRANT).

## Out of scope for Phase 2
- Dropping `public.notification_event_type` enum (Phase 3, after types regenerate and any straggler refs are gone).
- Updating `src/integrations/supabase/types.ts` — auto-regenerated post-migration.
- Updating callers of `emit_notification` — the only callers pass enum literals/strings; with text + FK validation, behaviour is identical. No app code edits needed.
- The three known incomplete-wiring files (`useTeamsNotifications.tsx`, `process-notification-outbox/index.ts`, `NotificationRulesCard.tsx`) — explicitly left alone per earlier instruction.

## Verification after migration
- `\d+ public.notification_rules`, `notification_outbox`, `notification_audit_log` show `event_type text` with FK to `dd_notification_event(value)`.
- `SELECT pg_get_functiondef('public.emit_notification'::regproc)` shows `p_event_type text`.
- Row counts in all three tables unchanged; spot-check `event_type` values are intact strings.
- `SELECT public.emit_notification('task_assigned', <some user_uuid>, 'task', gen_random_uuid(), '{}'::jsonb)` succeeds; passing `'bogus_value'` raises.
- Supabase linter shows no new findings attributable to this migration.

Awaiting approval to generate the SQL.
