-- Step 1: Add 'Same_Page' to the eos_meeting_type enum
ALTER TYPE public.eos_meeting_type ADD VALUE IF NOT EXISTS 'Same_Page';

-- Step 2: Clean up duplicate templates - archive all but the oldest per meeting type

-- Archive duplicate L10 system templates (keep the oldest one)
WITH ranked_l10 AS (
  SELECT id,
    ROW_NUMBER() OVER (ORDER BY created_at ASC) as rn
  FROM public.eos_agenda_templates
  WHERE meeting_type = 'L10' AND is_system = true AND is_archived = false
)
UPDATE public.eos_agenda_templates
SET is_archived = true
WHERE id IN (
  SELECT id FROM ranked_l10 WHERE rn > 1
);

-- Archive duplicate Quarterly system templates
WITH ranked_quarterly AS (
  SELECT id,
    ROW_NUMBER() OVER (ORDER BY created_at ASC) as rn
  FROM public.eos_agenda_templates
  WHERE meeting_type = 'Quarterly' AND is_system = true AND is_archived = false
)
UPDATE public.eos_agenda_templates
SET is_archived = true
WHERE id IN (
  SELECT id FROM ranked_quarterly WHERE rn > 1
);

-- Archive duplicate Annual system templates
WITH ranked_annual AS (
  SELECT id,
    ROW_NUMBER() OVER (ORDER BY created_at ASC) as rn
  FROM public.eos_agenda_templates
  WHERE meeting_type = 'Annual' AND is_system = true AND is_archived = false
)
UPDATE public.eos_agenda_templates
SET is_archived = true
WHERE id IN (
  SELECT id FROM ranked_annual WHERE rn > 1
);

-- Step 3: Update the canonical EOS agendas with correct segments

-- Update Level 10 Meeting template (90 minutes total)
UPDATE public.eos_agenda_templates
SET 
  template_name = 'Level 10 Meeting',
  description = 'EOS canonical 90-minute weekly execution meeting. Follows exact EOS Level 10 agenda structure.',
  segments = '[
    {"name": "Segue", "duration": 5, "description": "Personal and business check-in. Share good news."},
    {"name": "Scorecard", "duration": 5, "description": "Review weekly metrics. Flag any out-of-range numbers."},
    {"name": "Rock Review", "duration": 5, "description": "Quick On-Track/Off-Track status for each Rock. No discussion."},
    {"name": "Headlines", "duration": 5, "description": "Customer/Employee headlines. Good news and FYIs."},
    {"name": "To-Do List", "duration": 5, "description": "Review last week To-Dos. Mark complete or carry forward."},
    {"name": "IDS", "duration": 60, "description": "Identify, Discuss, Solve. Work through prioritised issues one at a time."},
    {"name": "Conclude", "duration": 5, "description": "Recap To-Dos and cascading messages. Rate meeting 1-10."}
  ]'::jsonb
WHERE meeting_type = 'L10' AND is_system = true AND is_archived = false;

-- Update Quarterly Meeting template (6h 45m = 405 minutes)
UPDATE public.eos_agenda_templates
SET 
  template_name = 'Quarterly Meeting',
  description = 'EOS canonical Quarterly planning and review meeting.',
  segments = '[
    {"name": "Segue", "duration": 15, "description": "Check-in. Share personal and professional updates."},
    {"name": "Review Previous Flight Plan", "duration": 60, "description": "Review previous quarter Rocks. Score as complete or incomplete."},
    {"name": "Review Mission Control", "duration": 45, "description": "Review V/TO. Confirm vision, values, and targets."},
    {"name": "Establish Next Quarter Rocks", "duration": 90, "description": "Set 3-7 company Rocks for the upcoming quarter."},
    {"name": "Tackle Key Issues", "duration": 120, "description": "IDS on quarterly-level issues. Strategic problem solving."},
    {"name": "Next Steps", "duration": 45, "description": "Cascade messages, assign action items, confirm accountability."},
    {"name": "Conclude", "duration": 30, "description": "Summarise decisions. Rate the meeting. Schedule next quarterly."}
  ]'::jsonb
WHERE meeting_type = 'Quarterly' AND is_system = true AND is_archived = false;

-- Update Annual Strategic Planning template
UPDATE public.eos_agenda_templates
SET 
  template_name = 'Annual Strategic Planning',
  description = 'EOS canonical Annual Planning meeting. Two-day strategic planning session.',
  segments = '[
    {"name": "Day 1: Segue", "duration": 30, "description": "Check-in. Share personal and professional updates."},
    {"name": "Day 1: Review Previous Mission Control", "duration": 60, "description": "Review last year V/TO. Score annual goals."},
    {"name": "Day 1: Team Health", "duration": 90, "description": "Right People Right Seats. Address team dynamics."},
    {"name": "Day 1: SWOT/Issues List", "duration": 120, "description": "Strategic SWOT analysis. Build annual issues list."},
    {"name": "Day 1: Review Mission Control", "duration": 60, "description": "Update V/TO. Confirm 10-year target, 3-year picture."},
    {"name": "Day 2: Establish Next Quarter Rocks", "duration": 120, "description": "Set Q1 Rocks aligned with annual priorities."},
    {"name": "Day 2: Tackle Key Issues", "duration": 120, "description": "IDS on annual-level strategic issues."},
    {"name": "Day 2: Conclude", "duration": 30, "description": "Cascade messages. Rate meeting. Confirm next steps."}
  ]'::jsonb
WHERE meeting_type = 'Annual' AND is_system = true AND is_archived = false;

-- Step 4: Ensure only one system template is marked as default per meeting type
UPDATE public.eos_agenda_templates
SET is_default = false
WHERE is_system = true;

UPDATE public.eos_agenda_templates
SET is_default = true
WHERE is_system = true 
  AND is_archived = false
  AND id IN (
    SELECT DISTINCT ON (meeting_type) id
    FROM public.eos_agenda_templates
    WHERE is_system = true AND is_archived = false
    ORDER BY meeting_type, created_at ASC
  );