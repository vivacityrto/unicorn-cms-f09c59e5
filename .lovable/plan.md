# Fix: Auto-generated L10 meetings missing agendas

## Investigation findings

**Trigger** `public.auto_generate_next_meeting()` (AFTER UPDATE on `eos_meetings`, SECURITY DEFINER, `search_path = public`):
- Confirmed: INSERT into `eos_meetings` omits `template_id` and `template_version_id`.
- Confirmed: no copy of `eos_meeting_segments` rows for the new occurrence.
- Idempotency on the meeting itself is already handled by an `EXISTS` check on `(series_id, scheduled_date::date)`.
- Logs to `audit_eos_events` — will keep as-is and add a second audit entry for the segment copy.

**`eos_meeting_segments`** columns: `id, meeting_id, segment_name, duration_minutes, sequence_order, started_at, completed_at, notes, created_at`. Copy only the first four (excluding id); leave runtime fields null.

**Critical finding on the backfill — all 5 target meetings already have 7 segments and `template_id` set:**

| Meeting | Date | seg_count | template_id |
|---|---|---|---|
| a0cde66b (Jun 29) | 2026-06-29 | 7 | set |
| 34637a44 (Jul 6) | 2026-07-06 | 7 | set |
| c7eb06a1 (Jul 13) | 2026-07-13 | 7 | set |
| a1213f35 (Jul 20) | 2026-07-20 | 7 | set |
| 9637d1b3 (Jun 30, series 29ce0807) | 2026-06-30 | 7 | set |

This means someone (Angela / a prior fix attempt) has already populated segments on these meetings. The user's spec mandates the idempotency guard `COUNT(*) = 0 before insert`, so the backfill statements will be **no-ops** — which is the correct, safe outcome. The plan keeps the backfill block in place as documentation and a safety net but it will not modify rows. Will surface this clearly to the user after running.

Also resolved the Jun 30 meeting ID for series `29ce0807-5492-4d27-b301-c87cc70f2b10`: **`9637d1b3-4b55-4519-b65a-13b4369c55d6`**.

## Part 1 — Trigger function update (migration)

Replace `public.auto_generate_next_meeting()` with a version that:

1. Keeps all existing guards (status transition, series_id present, active series, recurrence calc, duplicate-meeting check, next-meeting linking, audit event).
2. Adds `template_id` and `template_version_id` to the `INSERT` column list and VALUES (copied from `NEW`).
3. After the INSERT, conditionally copies segments:
   - If `NEW.template_id IS NULL` → skip (per spec: don't error).
   - Else, guarded by `IF (SELECT COUNT(*) FROM public.eos_meeting_segments WHERE meeting_id = v_next_meeting_id) = 0 THEN ... END IF;` — idempotent.
   - `INSERT INTO public.eos_meeting_segments (meeting_id, segment_name, duration_minutes, sequence_order) SELECT v_next_meeting_id, segment_name, duration_minutes, sequence_order FROM public.eos_meeting_segments WHERE meeting_id = NEW.id;`
4. Adds an `audit_eos_events` entry with action `meeting_segments_copied` recording source meeting, target meeting, and segment count copied — preserves audit trail.
5. Preserves `SECURITY DEFINER`, `SET search_path = ''` per project rule, and fully qualifies every object reference (`public.eos_meetings`, `public.eos_meeting_series`, `public.eos_meeting_segments`, `public.audit_eos_events`, `auth.uid()`).
   - Note: current function uses `SET search_path TO 'public'`. Per project guideline ("All PostgreSQL functions must set search_path = '' and fully qualify"), this fix will also tighten that — small, contained improvement to the function we are already rewriting. Will mention this in chat so it isn't a silent change.
6. Does **not** touch trigger bindings (`trg_auto_generate_next_meeting`), `trg_seed_meeting_attendees`, `trg_set_fiscal_quarter`, or any RLS.

## Part 2 — Backfill (data migration via insert tool)

Wrapped in a single transaction with a per-meeting savepoint so one failure rolls back only that meeting (per spec):

```sql
BEGIN;
DO $$
DECLARE
  r RECORD;
  pairs CONSTANT jsonb := '[
    {"target":"a0cde66b-7f8d-42a8-9643-b96471783bf0","source":"3afe54e8-9e88-4ec7-be04-9754e3b545e7"},
    {"target":"34637a44-88c9-406f-b602-3d62acc3b8f3","source":"3afe54e8-9e88-4ec7-be04-9754e3b545e7"},
    {"target":"c7eb06a1-060f-4825-840a-8b1c261a147a","source":"3afe54e8-9e88-4ec7-be04-9754e3b545e7"},
    {"target":"a1213f35-788e-4eac-a2ed-0cec0f78e496","source":"3afe54e8-9e88-4ec7-be04-9754e3b545e7"},
    {"target":"9637d1b3-4b55-4519-b65a-13b4369c55d6","source":"1b89f581-8239-462d-b50d-5431e17a8fc8"}
  ]'::jsonb;
BEGIN
  FOR r IN SELECT * FROM jsonb_to_recordset(pairs) AS x(target uuid, source uuid) LOOP
    BEGIN
      IF (SELECT COUNT(*) FROM public.eos_meeting_segments WHERE meeting_id = r.target) = 0 THEN
        INSERT INTO public.eos_meeting_segments (meeting_id, segment_name, duration_minutes, sequence_order)
        SELECT r.target, segment_name, duration_minutes, sequence_order
        FROM public.eos_meeting_segments WHERE meeting_id = r.source;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Backfill failed for %: %', r.target, SQLERRM;
    END;
  END LOOP;
END $$;
COMMIT;
```

Expected outcome on this database: zero rows inserted (all targets already have 7 segments). Will confirm with a verification SELECT after.

## Untouched (verified)
- `3afe54e8` (Jun 22) — not in target list.
- Series `4d6dfb6a`, `833d7f58` — not referenced anywhere in the fix.
- All RLS policies, other triggers, non-EOS tables, client-facing tables.

## Verification
After migration approval:
1. `SELECT pg_get_functiondef(...)` to confirm new function body.
2. Re-run the seg_count query on the 5 target meetings (expect 7 each, unchanged).
3. Spot-check: simulate by reading the function and tracing logic against an `eos_meetings` row with `template_id IS NULL` → confirm graceful skip.

## Risk assessment
- **Low.** Trigger change is additive (two more INSERT columns + a conditional segment copy guarded by idempotency and null-check). All existing call paths continue to work. No RLS, schema, or other trigger touched. Backfill is a no-op on current data and includes per-row exception handling.
- **Backward compatibility:** Existing meetings with already-populated segments are untouched. Future auto-generated meetings will inherit template + segments from the closing meeting.
- **Audit completeness:** Original `meeting_auto_generated` event preserved; new `meeting_segments_copied` event added when segments are copied.

## Summary of changes
1. One migration: `CREATE OR REPLACE FUNCTION public.auto_generate_next_meeting()` with template fields + idempotent segment copy + tightened `search_path = ''`.
2. One data operation: idempotent backfill DO block (no-op on current data; protective for any future re-run).
3. No frontend code changes — `WorkMeetings.tsx` / `useEosMeetingRecurrences` consume the same schema; the live-view "No Agenda Loaded" message will simply stop firing for newly generated meetings.
