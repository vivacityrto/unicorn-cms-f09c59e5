-- Add seat role columns to eos_meeting_series for EOS role linking
ALTER TABLE public.eos_meeting_series 
  ADD COLUMN IF NOT EXISTS facilitator_seat_id uuid REFERENCES public.accountability_seats(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS visionary_seat_id uuid REFERENCES public.accountability_seats(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS integrator_seat_id uuid REFERENCES public.accountability_seats(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS required_seat_ids uuid[] DEFAULT '{}';

-- Add is_required_for_quorum flag to accountability_seats if not exists
ALTER TABLE public.accountability_seats
  ADD COLUMN IF NOT EXISTS is_required_for_quorum boolean NOT NULL DEFAULT false;

-- Add seat_id to eos_meeting_attendees to track which seat they represent
ALTER TABLE public.eos_meeting_attendees
  ADD COLUMN IF NOT EXISTS seat_id uuid REFERENCES public.accountability_seats(id) ON DELETE SET NULL;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_meeting_series_seat_roles ON public.eos_meeting_series(visionary_seat_id, integrator_seat_id);
CREATE INDEX IF NOT EXISTS idx_seats_quorum_required ON public.accountability_seats(is_required_for_quorum) WHERE is_required_for_quorum = true;

-- Add comment for documentation
COMMENT ON COLUMN public.eos_meeting_series.facilitator_seat_id IS 'The seat responsible for facilitating this meeting series';
COMMENT ON COLUMN public.eos_meeting_series.visionary_seat_id IS 'The Visionary seat for this meeting series (derived from Accountability Chart)';
COMMENT ON COLUMN public.eos_meeting_series.integrator_seat_id IS 'The Integrator seat for this meeting series (derived from Accountability Chart)';
COMMENT ON COLUMN public.eos_meeting_series.required_seat_ids IS 'Array of seat IDs that are required for quorum in this meeting series';
COMMENT ON COLUMN public.accountability_seats.is_required_for_quorum IS 'If true, this seat owner must be present for meeting quorum';