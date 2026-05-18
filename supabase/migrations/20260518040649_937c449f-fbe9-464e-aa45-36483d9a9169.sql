
-- Step 1: eos_agenda_templates
WITH src AS (
  SELECT id, segments,
    (SELECT (ord-1)::int FROM jsonb_array_elements(segments) WITH ORDINALITY a(elem,ord)
      WHERE elem->>'name'='To-Do List' LIMIT 1) AS tod_idx,
    (SELECT (ord-1)::int FROM jsonb_array_elements(segments) WITH ORDINALITY a(elem,ord)
      WHERE elem->>'name'='IDS (Identify, Discuss, Solve)' LIMIT 1) AS ids_idx
  FROM public.eos_agenda_templates
  WHERE meeting_type::text='L10'
),
swapped AS (
  SELECT s.id,
    jsonb_agg(
      CASE
        WHEN (ord-1)::int = s.tod_idx THEN s.segments -> s.ids_idx
        WHEN (ord-1)::int = s.ids_idx THEN s.segments -> s.tod_idx
        ELSE elem
      END
      ORDER BY ord
    ) AS new_segments
  FROM src s,
       LATERAL jsonb_array_elements(s.segments) WITH ORDINALITY arr(elem, ord)
  WHERE s.tod_idx IS NOT NULL AND s.ids_idx IS NOT NULL AND s.tod_idx < s.ids_idx
  GROUP BY s.id
)
UPDATE public.eos_agenda_templates t
SET segments = sw.new_segments, updated_at = now()
FROM swapped sw WHERE t.id = sw.id;

-- Step 2: eos_agenda_template_versions
WITH src AS (
  SELECT v.id, v.segments_snapshot AS segments,
    (SELECT (ord-1)::int FROM jsonb_array_elements(v.segments_snapshot) WITH ORDINALITY a(elem,ord)
      WHERE elem->>'name'='To-Do List' LIMIT 1) AS tod_idx,
    (SELECT (ord-1)::int FROM jsonb_array_elements(v.segments_snapshot) WITH ORDINALITY a(elem,ord)
      WHERE elem->>'name'='IDS (Identify, Discuss, Solve)' LIMIT 1) AS ids_idx
  FROM public.eos_agenda_template_versions v
  JOIN public.eos_agenda_templates t ON t.id = v.template_id
  WHERE t.meeting_type::text='L10'
    AND jsonb_typeof(v.segments_snapshot)='array'
),
swapped AS (
  SELECT s.id,
    jsonb_agg(
      CASE
        WHEN (ord-1)::int = s.tod_idx THEN s.segments -> s.ids_idx
        WHEN (ord-1)::int = s.ids_idx THEN s.segments -> s.tod_idx
        ELSE elem
      END
      ORDER BY ord
    ) AS new_segments
  FROM src s,
       LATERAL jsonb_array_elements(s.segments) WITH ORDINALITY arr(elem, ord)
  WHERE s.tod_idx IS NOT NULL AND s.ids_idx IS NOT NULL AND s.tod_idx < s.ids_idx
  GROUP BY s.id
)
UPDATE public.eos_agenda_template_versions v
SET segments_snapshot = sw.new_segments
FROM swapped sw WHERE v.id = sw.id;

-- Step 3: eos_meeting_segments swap
DO $$
DECLARE
  r RECORD;
  v_tod_id uuid; v_ids_id uuid; v_tod_ord int; v_ids_ord int;
BEGIN
  FOR r IN
    SELECT meeting_id FROM public.eos_meeting_segments
    GROUP BY meeting_id
    HAVING COUNT(*) FILTER (WHERE segment_name='To-Do List') > 0
       AND COUNT(*) FILTER (WHERE segment_name='IDS (Identify, Discuss, Solve)') > 0
       AND MIN(sequence_order) FILTER (WHERE segment_name='To-Do List')
         < MIN(sequence_order) FILTER (WHERE segment_name='IDS (Identify, Discuss, Solve)')
  LOOP
    SELECT id, sequence_order INTO v_tod_id, v_tod_ord
      FROM public.eos_meeting_segments
      WHERE meeting_id = r.meeting_id AND segment_name='To-Do List'
      ORDER BY sequence_order LIMIT 1;
    SELECT id, sequence_order INTO v_ids_id, v_ids_ord
      FROM public.eos_meeting_segments
      WHERE meeting_id = r.meeting_id AND segment_name='IDS (Identify, Discuss, Solve)'
      ORDER BY sequence_order LIMIT 1;

    UPDATE public.eos_meeting_segments SET sequence_order = -1 WHERE id = v_tod_id;
    UPDATE public.eos_meeting_segments SET sequence_order = v_tod_ord WHERE id = v_ids_id;
    UPDATE public.eos_meeting_segments SET sequence_order = v_ids_ord WHERE id = v_tod_id;
  END LOOP;
END $$;

-- Step 4: audit trail
INSERT INTO public.audit_events (entity, entity_id, action, user_id, details)
VALUES (
  'eos_agenda_templates',
  gen_random_uuid(),
  'eos.segment_order.fix_tod_after_ids',
  NULL,
  jsonb_build_object(
    'description', 'Swapped To-Do List and IDS positions for L10 templates, versions, and meetings',
    'scope', 'L10 only',
    'segments', jsonb_build_array('To-Do List', 'IDS (Identify, Discuss, Solve)'),
    'applied_at', now()
  )
);
