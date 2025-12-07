-- Add duration_months column to packages table for package-specific durations
ALTER TABLE public.packages 
ADD COLUMN duration_months integer DEFAULT 12;

-- Add a comment explaining the column
COMMENT ON COLUMN public.packages.duration_months IS 'Duration of the package in months. Used to calculate expiry dates.';

-- Update some example packages with different durations (you can adjust these as needed)
-- Kickstart packages typically have different durations
UPDATE public.packages SET duration_months = 6 WHERE slug LIKE '%ks-%';

-- Membership packages typically run for 12 months
UPDATE public.packages SET duration_months = 12 WHERE slug LIKE '%m-%';