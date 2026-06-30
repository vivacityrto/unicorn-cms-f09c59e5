# Implementation Plan: PDP `academy_completion` duration_minutes auto-fill

Design decisions confirmed:
- Lesson sum (published only) is primary; `academy_courses.estimated_minutes` is fallback when sum is 0/null; NULL when both are 0/null
- Same `is_published = true` filter in both edge function and trigger
- Trigger is `BEFORE INSERT` only; no UPDATE coverage
- Zero lesson sum → NULL, not 0

---

## 1. Database migration — safety-net trigger

Single migration, idempotent, with hardened function:

```sql
CREATE OR REPLACE FUNCTION public.pdp_evidence_items_fill_academy_duration()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_lesson_minutes int;
  v_course_minutes int;
BEGIN
  IF NEW.evidence_type = 'academy_completion'
     AND NEW.source_enrollment_id IS NOT NULL
     AND NEW.duration_minutes IS NULL THEN

    -- Primary: sum of published lesson minutes for the enrolled course
    SELECT COALESCE(SUM(l.estimated_minutes), 0)::int
      INTO v_lesson_minutes
      FROM public.academy_lessons l
      JOIN public.academy_enrollments e ON e.course_id = l.course_id
     WHERE e.id = NEW.source_enrollment_id
       AND l.is_published = true;

    IF v_lesson_minutes > 0 THEN
      NEW.duration_minutes := v_lesson_minutes;
    ELSE
      -- Fallback: course-level estimate
      SELECT c.estimated_minutes
        INTO v_course_minutes
        FROM public.academy_courses c
        JOIN public.academy_enrollments e ON e.course_id = c.id
       WHERE e.id = NEW.source_enrollment_id;

      IF v_course_minutes IS NOT NULL AND v_course_minutes > 0 THEN
        NEW.duration_minutes := v_course_minutes;
      END IF;
      -- else: leave NULL
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.pdp_evidence_items_fill_academy_duration() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pdp_evidence_items_fill_academy_duration() TO service_role;

DROP TRIGGER IF EXISTS trg_pdp_evidence_fill_academy_duration ON public.pdp_evidence_items;

CREATE TRIGGER trg_pdp_evidence_fill_academy_duration
  BEFORE INSERT ON public.pdp_evidence_items
  FOR EACH ROW
  EXECUTE FUNCTION public.pdp_evidence_items_fill_academy_duration();
```

Notes:
- `SECURITY DEFINER` + empty `search_path` + fully schema-qualified references — matches project hardening standard
- `REVOKE … FROM PUBLIC` then explicit `GRANT EXECUTE` to `service_role` only (triggers fire regardless of grants; this is defence-in-depth against direct invocation)
- No table/column changes; no RLS changes; no FK changes
- No backfill — existing rows are already populated (verified: 0 NULL durations across 14 academy_completion rows)

---

## 2. Edge function changes — `supabase/functions/pdp-auto-evidence/index.ts`

Replace the duration-resolution block (~lines 297–315). Current logic prefers `academy_courses.estimated_minutes` and falls back to an unfiltered lesson sum. New logic inverts precedence and adds the `is_published` filter.

Pseudo-diff:

```ts
// BEFORE
const courseMinutes = course.estimated_minutes ?? null;
let durationMinutes: number | null = courseMinutes;
if (durationMinutes == null) {
  const { data: lessons } = await service
    .from("academy_lessons")
    .select("estimated_minutes")
    .eq("course_id", course.id);
  const sum = (lessons ?? []).reduce((a, l) => a + (l.estimated_minutes ?? 0), 0);
  durationMinutes = sum > 0 ? sum : null;
}

// AFTER
const { data: lessons } = await service
  .from("academy_lessons")
  .select("estimated_minutes")
  .eq("course_id", course.id)
  .eq("is_published", true);
const lessonSum = (lessons ?? []).reduce((a, l) => a + (l.estimated_minutes ?? 0), 0);
let durationMinutes: number | null = null;
if (lessonSum > 0) {
  durationMinutes = lessonSum;
} else if (course.estimated_minutes && course.estimated_minutes > 0) {
  durationMinutes = course.estimated_minutes;
}
// else: stays null
```

`academy_certificate` insert (~line 392) is unchanged — that path intentionally stores `duration_minutes: null`.

---

## 3. Frontend changes — `src/features/pdp/components/EvidenceSheet.tsx`

`handlePickEnrollment` (~line 259) currently sets duration solely from `match.course?.estimated_minutes`. Update to perform the same primary/fallback computation when the user selects an academy enrollment:

```ts
const handlePickEnrollment = async (enrollmentId: number) => {
  const match = enrollments.find(e => e.id === enrollmentId);
  if (!match) return;

  // Primary: sum of published lessons for this course
  const { data: lessons } = await supabase
    .from("academy_lessons")
    .select("estimated_minutes")
    .eq("course_id", match.course_id)
    .eq("is_published", true);
  const lessonSum = (lessons ?? []).reduce((a, l) => a + (l.estimated_minutes ?? 0), 0);

  let minutes: number | null = null;
  if (lessonSum > 0) minutes = lessonSum;
  else if (match.course?.estimated_minutes && match.course.estimated_minutes > 0) {
    minutes = match.course.estimated_minutes;
  }

  setValue("source_enrollment_id", enrollmentId);
  setValue("title", match.course?.title ?? "");
  setValue("duration_hours", minutes ? +(minutes / 60).toFixed(2) : 0);
  // user can still override before submit
};
```

The form-level duration field remains user-editable. If they leave it as 0/blank, the trigger acts as a safety net on insert.

---

## 4. Verification steps after deploy

1. **Trigger smoke test** via `supabase--read_query`-style insert: create a test `pdp_evidence_items` row with `evidence_type='academy_completion'`, valid `source_enrollment_id`, `duration_minutes=NULL` → confirm row reads back with computed minutes.
2. **Trigger no-op test**: insert with explicit `duration_minutes=42` → confirm value preserved.
3. **Trigger scope test**: insert with `evidence_type='reflection'` and NULL duration → confirm untouched.
4. **View test**: `SELECT actual_pd_hours FROM v_pdp_cycle_summary WHERE cycle_id = …` before vs after → reflects new evidence immediately.
5. **Edge function test**: trigger an academy course completion in a test enrollment → confirm the resulting evidence row has lesson-sum-derived duration and the cycle summary updates.
6. **Frontend test**: open EvidenceSheet, pick an academy enrollment → confirm duration prefills from lesson sum (not course-level value when they differ).
7. Clean up test rows.

---

## 5. Rollback plan

**Code rollback** (edge function + EvidenceSheet): revert the two file edits. No data fix needed; rows already inserted with computed durations stay correct.

**Trigger rollback** (one migration):
```sql
DROP TRIGGER IF EXISTS trg_pdp_evidence_fill_academy_duration ON public.pdp_evidence_items;
DROP FUNCTION IF EXISTS public.pdp_evidence_items_fill_academy_duration();
```
No data mutation occurs on rollback.

---

## 6. Risk summary

| Risk | Mitigation |
|---|---|
| Double-write between code and trigger | Trigger only fires when `duration_minutes IS NULL`; code always sets a value, so trigger no-ops |
| Lesson sum differs from course estimate | By design — lesson sum is the source of truth per agreed decision |
| RLS on `academy_lessons` blocks trigger read | `SECURITY DEFINER` bypasses caller RLS |
| Lock contention on `pdp_evidence_items` | `BEFORE INSERT` row-level only; existing table has zero triggers; low write volume |
| Existing NULL rows | None exist (verified); trigger is INSERT-only by design |
| `v_pdp_cycle_summary` lag | View is non-materialised — updates are immediate |

---

## 7. Execution order

1. Apply migration (creates function + trigger). Approve via the migration tool.
2. Deploy edge function changes (`supabase/functions/pdp-auto-evidence/index.ts`).
3. Ship frontend changes (`EvidenceSheet.tsx`).
4. Run verification steps 1–6.

No coordinated deploy needed — each layer is independently safe:
- Migration alone: trigger fills any NULL inserts going forward (covers old edge function builds).
- Edge function alone (without migration): writes correct durations directly.
- Frontend alone: prefills correct value; trigger absent means user-typed value still wins.
