-- Add total_hours column to packages for hour-based tracking
ALTER TABLE public.packages 
ADD COLUMN total_hours integer DEFAULT 0;

-- Add a comment explaining the column
COMMENT ON COLUMN public.packages.total_hours IS 'Total allocated hours for this package. Used to calculate hours remaining.';

-- Set example values (adjust as needed)
-- KS-RTO packages typically have 40 hours
UPDATE public.packages SET total_hours = 40 WHERE slug LIKE '%ks-%';

-- Membership packages typically have different hour allocations
UPDATE public.packages SET total_hours = 20 WHERE slug LIKE '%m-%';

-- CHC package
UPDATE public.packages SET total_hours = 30 WHERE slug = '/package-chc';