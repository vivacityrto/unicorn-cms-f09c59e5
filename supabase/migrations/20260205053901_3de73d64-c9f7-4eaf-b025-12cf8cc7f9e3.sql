-- Drop the remaining integer overload with different parameter signature
DROP FUNCTION IF EXISTS public.create_meeting_from_template(
  integer,      -- p_tenant_id
  text,         -- p_title
  text,         -- p_meeting_type
  timestamp with time zone,  -- p_scheduled_at
  uuid,         -- p_template_id
  uuid          -- p_created_by
);