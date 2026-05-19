# Migration 2: `eos_meeting_type` enum → `dd_eos_meeting_type` lookup FK

Single atomic migration file. All work captured from live DB definitions (pg_get_functiondef on the 7 functions, pg_get_indexdef on the partial index). Will be written as one `supabase/migrations/{timestamp}_phase5e_meeting_type_to_dd_fk.sql` on approval.

## Captured live state (verified now)

- `create_meeting_series` overload signature: `(bigint, eos_meeting_type, text, text, date, time without time zone, integer, text, uuid, uuid, integer)` — confirmed exists, will be DROPped and recreated with `p_meeting_type text`.
- 7 functions inspected. Findings vs. brief:
  - `create_meeting_basic(bigint, text, text, timestamptz, uuid)` — body has `p_meeting_type::eos_meeting_type` → recreated without cast.
  - `create_meeting_basic(integer, text, text, timestamptz, integer, uuid)` — body has `p_meeting_type::public.eos_meeting_type` → recreated without cast.
  - `create_meeting_from_template(uuid, timestamptz, ...)` — body has `v_meeting_type::eos_meeting_type` → recreated without cast.
  - `create_meeting_from_template(bigint, uuid, ...)` — **no** `::eos_meeting_type` cast in body (inserts `v_template.meeting_type` directly). Not touched.
  - `seed_system_agenda_templates()` (no-arg overload) — has 4 `'X'::eos_meeting_type` literal casts → recreated without casts.
  - `seed_system_agenda_templates(bigint)` — uses plain `'L10' / 'Quarterly' / 'Annual'` strings, no `::eos_meeting_type` casts. Not touched (still works against text column).
  - `start_meeting_with_validation(uuid)` — body contains only `meeting_type::TEXT` (cast TO text), **no** `::eos_meeting_type` cast. Brief asked for recreation; I'll still issue a byte-identical `CREATE OR REPLACE` to honour the brief's "all 7" instruction (no-op net effect).
  - `validate_meeting_agenda(uuid)` — same as above: only `meeting_type::TEXT`. Byte-identical CREATE OR REPLACE.

Net effect: post-flight assertion 8 ("zero `::eos_meeting_type` casts remain in any public function body") will pass.

- `idx_quarterly_meeting_unique` live definition: `WHERE ((meeting_type = 'Quarterly'::eos_meeting_type) AND (status <> 'cancelled'::meeting_status))`. Recreated with the enum cast dropped on `'Quarterly'` and `'cancelled'::meeting_status` preserved verbatim.

## File structure (in order)

1. Rollback SQL block as top-of-file comment.
2. `DO $preflight$` — 6 assertions (dd_ row count + values, 3 table row counts + null/value checks, index exists, enum-arg overload exists).
3. `DROP INDEX public.idx_quarterly_meeting_unique;`
4. `DROP FUNCTION IF EXISTS public.create_meeting_series(bigint, eos_meeting_type, text, text, date, time without time zone, integer, text, uuid, uuid, integer);`
5. Three `ALTER TABLE ... ALTER COLUMN meeting_type TYPE text USING meeting_type::text;` (templates / series / meetings).
6. Three FK `ADD CONSTRAINT fk_..._meeting_type FOREIGN KEY (meeting_type) REFERENCES public.dd_eos_meeting_type(value) ON UPDATE CASCADE ON DELETE RESTRICT;`.
7. `CREATE UNIQUE INDEX idx_quarterly_meeting_unique ON public.eos_meetings USING btree (tenant_id, fiscal_year, fiscal_quarter) WHERE ((meeting_type = 'Quarterly') AND (status <> 'cancelled'::meeting_status));`
8. Function recreations (preserving `SECURITY DEFINER`, `LANGUAGE plpgsql`, return type, and `SET search_path TO 'public'` byte-for-byte against captured definitions):
   - `CREATE OR REPLACE FUNCTION public.create_meeting_series(bigint, text, text, text, date, time, int, text, uuid, uuid, int)` — new text param; body identical except `p_meeting_type::eos_meeting_type` removed (the live body actually inserts `p_meeting_type` plain — only the parameter type changed; the audit `jsonb_build_object('meeting_type', p_meeting_type, ...)` is unchanged).
   - `CREATE OR REPLACE FUNCTION public.create_meeting_basic(bigint, text, text, timestamptz, uuid)` — cast removed.
   - `CREATE OR REPLACE FUNCTION public.create_meeting_basic(integer, text, text, timestamptz, integer, uuid)` — cast removed.
   - `CREATE OR REPLACE FUNCTION public.create_meeting_from_template(uuid, timestamptz, timestamptz, uuid, uuid, text, uuid[], text, uuid, bigint)` — cast removed.
   - `CREATE OR REPLACE FUNCTION public.seed_system_agenda_templates()` — 4 literal casts removed.
   - `CREATE OR REPLACE FUNCTION public.start_meeting_with_validation(uuid)` — byte-identical recreation (no enum casts present).
   - `CREATE OR REPLACE FUNCTION public.validate_meeting_agenda(uuid)` — byte-identical recreation (no enum casts present).
9. `COMMENT ON TYPE public.eos_meeting_type IS '... Retained for rollback safety ... Do NOT drop until Phase 5Z cleanup. Permanent DROP requires Carl/Dave sign-off.';`
10. `DO $postflight$` — 9 assertions (row counts, null check, FK value-set integrity, 3 FK constraints valid via `pg_constraint.convalidated`, index exists with no `::eos_meeting_type` and still contains `::meeting_status`, `create_meeting_series` arg list shows `p_meeting_type text` and not `eos_meeting_type`, `pg_proc.prosrc` scan for any remaining `::eos_meeting_type`, legacy enum still in `pg_type`).

## Explicitly NOT done

- No DROP of `public.eos_meeting_type`.
- No view modifications (`eos_past_meetings`, `eos_upcoming_meetings`, `eos_meeting_attendance_summary`, `v_client_decisions_approvals`).
- No frontend changes.
- No `::meeting_status` cast removed from the recreated index.
- No TypeScript regen bundled.

## Deviations from the brief (flagged)

1. Brief asserts all 7 functions contain `::eos_meeting_type` casts. Live capture shows only **5 of 7** do (`start_meeting_with_validation` and `validate_meeting_agenda` already use `meeting_type::TEXT`). I'll still recreate all 7 to match the brief's intent — the 2 unchanged ones are byte-identical replacements.
2. Brief lists `create_meeting_from_template` singular. There are 2 overloads in production; only the `(uuid, timestamptz, ...)` overload has an `::eos_meeting_type` cast. Only that overload is recreated. The `(bigint, uuid, ...)` overload survives unchanged (no cast to remove).
3. Brief lists `seed_system_agenda_templates` singular. There are 2 overloads; only the no-arg overload has `::eos_meeting_type` casts. Only that overload is recreated.

On approval I'll write the file at `supabase/migrations/{new-timestamp}_phase5e_meeting_type_to_dd_fk.sql` via the migration tool (which will execute it — pre-flight will pass only if Migration 1 has been applied first).
