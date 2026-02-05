-- Drop the BEFORE trigger and recreate as AFTER trigger to avoid row modification conflict
DROP TRIGGER IF EXISTS trg_auto_generate_next_meeting ON public.eos_meetings;

CREATE TRIGGER trg_auto_generate_next_meeting
AFTER UPDATE ON public.eos_meetings
FOR EACH ROW
EXECUTE FUNCTION public.auto_generate_next_meeting();