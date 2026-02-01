

# Fix "Apply Agenda Template" Error

## Problem

When clicking "Apply Template" on an EOS meeting, the error occurs:

```
null value in column "segment_name" of relation "eos_meeting_segments" violates not-null constraint
```

## Root Cause

There is a key name mismatch between template data and the RPC functions:

| What Templates Store | What RPC Expects |
|---------------------|------------------|
| `name` | `segment_name` |
| `duration` | `duration_minutes` |

**Template Data (actual):**
```json
[
  { "name": "Segue", "duration": 5 },
  { "name": "Scorecard", "duration": 5 }
]
```

**RPC expects:**
```json
[
  { "segment_name": "Segue", "duration_minutes": 5 }
]
```

The `apply_template_to_meeting` and `create_meeting_from_template` functions both try to access `segment_name` and `duration_minutes`, which returns NULL because those keys do not exist.

## Solution

Update both RPC functions to use `COALESCE` for backward compatibility, handling both old keys (`name`, `duration`) and new keys (`segment_name`, `duration_minutes`).

### Changes Required

**1. Fix `apply_template_to_meeting` RPC**

Update the INSERT statement to handle both key formats:

```sql
-- Before (broken)
segment_name = v_segment->>'segment_name'
duration_minutes = (v_segment->>'duration_minutes')::INT

-- After (fixed)
segment_name = COALESCE(v_segment->>'segment_name', v_segment->>'name')
duration_minutes = COALESCE((v_segment->>'duration_minutes')::INT, (v_segment->>'duration')::INT)
```

**2. Fix `create_meeting_from_template` RPC**

Apply the same COALESCE pattern to ensure new meetings created from templates also work.

### Files to Create

| File | Purpose |
|------|---------|
| `supabase/migrations/[timestamp]_fix_template_segment_keys.sql` | Update both RPC functions with COALESCE |

### Migration SQL

```sql
-- Fix apply_template_to_meeting to handle both key formats
CREATE OR REPLACE FUNCTION public.apply_template_to_meeting(
  p_meeting_id UUID,
  p_template_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_template RECORD;
  v_segment JSONB;
  v_sequence INT := 1;
  v_total_duration INT := 0;
  v_segment_name TEXT;
  v_duration INT;
BEGIN
  SELECT * INTO v_template
  FROM public.eos_agenda_templates
  WHERE id = p_template_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Template not found';
  END IF;

  DELETE FROM public.eos_meeting_segments
  WHERE meeting_id = p_meeting_id;

  FOR v_segment IN SELECT * FROM jsonb_array_elements(v_template.segments)
  LOOP
    -- Handle both old (name/duration) and new (segment_name/duration_minutes) keys
    v_segment_name := COALESCE(v_segment->>'segment_name', v_segment->>'name');
    v_duration := COALESCE(
      (v_segment->>'duration_minutes')::INT, 
      (v_segment->>'duration')::INT
    );
    
    INSERT INTO public.eos_meeting_segments (
      meeting_id, segment_name, duration_minutes, sequence_order
    ) VALUES (
      p_meeting_id, v_segment_name, v_duration, v_sequence
    );
    
    v_total_duration := v_total_duration + v_duration;
    v_sequence := v_sequence + 1;
  END LOOP;

  UPDATE public.eos_meetings
  SET duration_minutes = v_total_duration,
      template_id = p_template_id,
      template_version_id = v_template.current_version_id,
      updated_at = NOW()
  WHERE id = p_meeting_id;
END;
$$;
```

The same pattern will be applied to `create_meeting_from_template`.

### Frontend Fix

The `ApplyTemplateDialog.tsx` also needs updates to display segment previews correctly:

| Current (broken) | Fixed |
|-----------------|-------|
| `seg.segment_name` | `seg.segment_name \|\| seg.name` |
| `seg.duration_minutes` | `seg.duration_minutes \|\| seg.duration` |

### Expected Outcome

After this fix:
- Applying templates to existing meetings will work
- Creating new meetings from templates will work
- The dialog will correctly display segment names and durations
- Both old and new template formats are supported

