
-- Add EOS scorecard metric management columns
ALTER TABLE public.eos_scorecard_metrics
  ADD COLUMN IF NOT EXISTS category text DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS direction text DEFAULT 'higher_is_better',
  ADD COLUMN IF NOT EXISTS is_archived boolean DEFAULT false;

-- Add check constraint for direction values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'eos_scorecard_metrics_direction_check'
  ) THEN
    ALTER TABLE public.eos_scorecard_metrics
      ADD CONSTRAINT eos_scorecard_metrics_direction_check
      CHECK (direction IN ('higher_is_better', 'lower_is_better', 'equals_target'));
  END IF;
END $$;

-- Index for filtering archived metrics
CREATE INDEX IF NOT EXISTS idx_eos_scorecard_metrics_archived
  ON public.eos_scorecard_metrics (is_archived, is_active);
