-- Drop the integer overload of create_meeting_from_template
-- This resolves the RPC ambiguity error when scheduling meetings
-- Keeping only the bigint version (canonical signature)

DROP FUNCTION IF EXISTS public.create_meeting_from_template(
  integer,      -- p_tenant_id
  uuid,         -- p_agenda_template_id
  text,         -- p_title
  timestamp with time zone,  -- p_scheduled_date
  integer,      -- p_duration_minutes
  uuid,         -- p_facilitator_id
  uuid,         -- p_scribe_id
  uuid[]        -- p_participant_ids
);