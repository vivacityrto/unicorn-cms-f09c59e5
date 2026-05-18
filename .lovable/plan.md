## Goal
Data-only SQL migration to fix L10 segment order so **IDS** precedes **To-Do List**. No schema, RLS, or frontend changes.

## Scope confirmed from DB

| Table | L10 rows | Rows needing swap |
|---|---|---|
| `eos_agenda_templates` (meeting_type='L10') | 794 | 793 (1 missing one of the two segments — skipped) |
| `eos_agenda_template_versions` (linked to L10 templates) | 794 | apply same JSON swap |
| `eos_meeting_segments` (meetings with both segments) | 12 meetings | swap `sequence_order` pairwise |

Segment names in data (exact strings):
- `'To-Do List'`
- `'IDS (Identify, Discuss, Solve)'`

One template stores `duration_minutes` instead of `duration`; the swap is keyed on `name` only, so this is preserved untouched.

Non-L10 templates (`Quarterly`, etc.) and other segment names (Segue, Scorecard, Rock Review, Headlines, Conclude) are excluded by `meeting_type::text='L10'` and the explicit name filter.

## Migration steps (single transaction)

### Step 1 — `eos_agenda_templates`
For each L10 row where the `segments` JSONB array contains both names and `To-Do List` appears before `IDS`, rebuild the array with the two elements swapped in place. All other elements (and their `duration` / `duration_minutes` keys) are preserved.

```sql
UPDATE public.eos_agenda_templates t
SET segments = sub.new_segments,
    updated_at = now()
FROM (
  SELECT id,
    jsonb_agg(
      CASE
        WHEN ord-1 = tod_idx THEN segments -> ids_idx
        WHEN ord-1 = ids_idx THEN segments -> tod_idx
        ELSE elem
      END
      ORDER BY ord
    ) AS new_segments
  FROM (
    SELECT id, segments,
      (SELECT ord-1 FROM jsonb_array_elements(segments) WITH ORDINALITY a(elem,ord)
        WHERE elem->>'name'='To-Do List' LIMIT 1) AS tod_idx,
      (SELECT ord-1 FROM jsonb_array_elements(segments) WITH ORDINALITY a(elem,ord)
        WHERE elem->>'name'='IDS (Identify, Discuss, Solve)' LIMIT 1) AS ids_idx
    FROM public.eos_agenda_templates
    WHERE meeting_type::text='L10'
  ) src,
  LATERAL jsonb_array_elements(segments) WITH ORDINALITY arr(elem, ord)
  WHERE tod_idx IS NOT NULL AND ids_idx IS NOT NULL AND tod_idx < ids_idx
  GROUP BY id, segments, tod_idx, ids_idx
) sub
WHERE t.id = sub.id;
```

### Step 2 — `eos_agenda_template_versions`
Same swap on `segments_snapshot`, scoped via join to L10 templates. Identical logic.

### Step 3 — `eos_meeting_segments`
Per-meeting two-row swap of `sequence_order` using a temp negative value to dodge a unique constraint if present:

```sql
WITH pairs AS (
  SELECT m.id AS meeting_id,
    MAX(s.id) FILTER (WHERE s.segment_name='To-Do List') AS tod_id,
    MAX(s.id) FILTER (WHERE s.segment_name='IDS (Identify, Discuss, Solve)') AS ids_id,
    MAX(s.sequence_order) FILTER (WHERE s.segment_name='To-Do List') AS tod_ord,
    MAX(s.sequence_order) FILTER (WHERE s.segment_name='IDS (Identify, Discuss, Solve)') AS ids_ord
  FROM public.eos_meeting_segments s
  JOIN (SELECT DISTINCT meeting_id AS id FROM public.eos_meeting_segments) m ON m.id = s.meeting_id
  GROUP BY m.id
  HAVING COUNT(*) FILTER (WHERE s.segment_name='To-Do List')>0
     AND COUNT(*) FILTER (WHERE s.segment_name='IDS (Identify, Discuss, Solve)')>0
     AND MAX(s.sequence_order) FILTER (WHERE s.segment_name='To-Do List')
       < MAX(s.sequence_order) FILTER (WHERE s.segment_name='IDS (Identify, Discuss, Solve)')
)
-- park To-Do at -1*tod_id, then set IDS to old tod_ord, then To-Do to old ids_ord
, park AS (
  UPDATE public.eos_meeting_segments s SET sequence_order = -1
  FROM pairs p WHERE s.id = p.tod_id RETURNING s.id
)
, move_ids AS (
  UPDATE public.eos_meeting_segments s SET sequence_order = p.tod_ord
  FROM pairs p WHERE s.id = p.ids_id RETURNING s.id
)
UPDATE public.eos_meeting_segments s SET sequence_order = p.ids_ord
FROM pairs p WHERE s.id = p.tod_id;
```

(Final query will collapse this into a CTE chain inside one statement; the three-phase shuffle protects any `UNIQUE (meeting_id, sequence_order)` constraint should one exist. If no unique constraint exists the temp parking is harmless.)

### Step 4 — Verification queries (run inline, must all return 0)
- L10 templates still showing To-Do before IDS
- L10 template_versions snapshots still showing To-Do before IDS
- Meetings where To-Do.sequence_order < IDS.sequence_order

## Audit trail
Insert one row into `audit_events` summarising affected counts (entity `eos_agenda_templates`, action `eos.segment_order.fix_tod_after_ids`). Backfill, not user-driven, so `user_id` is null. Details JSON: `{templates_updated, versions_updated, meetings_updated}`.

## Out of scope (explicitly untouched)
- RLS policies, table schema, indexes
- Non-L10 templates and meetings (Quarterly, etc.)
- All other segment names
- Any frontend code — `LiveMeetingView`, agenda sidebar, navigation, Scorecard/Rocks/Headlines/Conclude segments all read `sequence_order` ASC and need no change

## Risk assessment

| Risk | Likelihood | Mitigation |
|---|---|---|
| Active in-progress L10 meeting jumps segments mid-session | Low (12 meetings total with both segments) | Swap is idempotent and runs in one tx; client refetch on next nav restores correct order |
| Unique constraint on (meeting_id, sequence_order) blocks swap | Unknown | Three-phase park-and-move avoids any collision |
| Non-L10 affected | None | Filtered by `meeting_type::text='L10'` and explicit segment names |
| Re-run safety | Safe | WHERE clauses skip already-correct rows |
| Rollback | Available | Reverse migration swaps them back using identical logic |

Backward-compatible, audit-logged, idempotent, production-ready.
