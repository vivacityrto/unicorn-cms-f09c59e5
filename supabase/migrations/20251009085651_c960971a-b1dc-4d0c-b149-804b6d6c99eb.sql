-- Enable Realtime for Phase 2 EOS Tables

-- Set replica identity to capture all column changes
ALTER TABLE public.eos_meeting_segments REPLICA IDENTITY FULL;
ALTER TABLE public.eos_headlines REPLICA IDENTITY FULL;
ALTER TABLE public.eos_meeting_participants REPLICA IDENTITY FULL;

-- Add tables to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.eos_meeting_segments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.eos_headlines;
ALTER PUBLICATION supabase_realtime ADD TABLE public.eos_meeting_participants;