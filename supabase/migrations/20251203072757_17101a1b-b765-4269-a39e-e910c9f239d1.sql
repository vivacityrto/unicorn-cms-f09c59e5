-- Update KS-RTO package to 12 months (1 year) instead of 6 months
UPDATE public.packages 
SET duration_months = 12 
WHERE name = 'KS-RTO';