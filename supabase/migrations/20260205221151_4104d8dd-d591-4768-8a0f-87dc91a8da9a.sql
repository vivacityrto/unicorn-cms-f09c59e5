-- Fix Missing Recurring L10 Meetings - Data Fix
-- Step 1: Fix the completed meeting's status
UPDATE public.eos_meetings 
SET status = 'completed'
WHERE id = '64a80954-66e0-40b6-b595-0fa68a1ec4bb'
  AND is_complete = true
  AND status = 'scheduled';

-- Step 2: Generate 12 weeks of L10 meetings for the active series
SELECT * FROM public.generate_series_instances(
  '7ba1d1e6-189d-4814-9c91-9cd1549895c6'::uuid,
  12
);

-- Step 3: Ensure all generated meetings have the correct workspace_id and meeting_scope
UPDATE public.eos_meetings m
SET 
  workspace_id = s.workspace_id,
  meeting_scope = 'vivacity_team'
FROM public.eos_meeting_series s
WHERE m.series_id = s.id
  AND m.workspace_id IS NULL
  AND s.workspace_id IS NOT NULL;

-- Step 4: Fix any meetings with workspace_id but missing meeting_scope
UPDATE public.eos_meetings
SET meeting_scope = 'vivacity_team'
WHERE workspace_id = (SELECT id FROM public.eos_workspaces WHERE slug = 'vivacity' LIMIT 1)
  AND (meeting_scope IS NULL OR meeting_scope = '');