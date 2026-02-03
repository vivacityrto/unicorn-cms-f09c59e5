-- Add severity and resolution_note columns to recommendations
ALTER TABLE public.seat_rebalancing_recommendations 
ADD COLUMN IF NOT EXISTS severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('high', 'medium')),
ADD COLUMN IF NOT EXISTS resolution_note TEXT;

-- Expand recommendation_type to include new types
ALTER TABLE public.seat_rebalancing_recommendations 
DROP CONSTRAINT IF EXISTS seat_rebalancing_recommendations_recommendation_type_check;

ALTER TABLE public.seat_rebalancing_recommendations 
ADD CONSTRAINT seat_rebalancing_recommendations_recommendation_type_check 
CHECK (recommendation_type IN (
  'reduce_rock_load',
  'move_rock',
  'add_backup',
  'split_seat',
  'seat_redesign',
  'people_review',
  'vacant_seat'
));

-- Create index for faster lookups by severity
CREATE INDEX IF NOT EXISTS idx_seat_recommendations_severity ON public.seat_rebalancing_recommendations(severity);