-- Add why_it_matters column for impact justification
ALTER TABLE eos_issues 
ADD COLUMN IF NOT EXISTS why_it_matters TEXT;

-- Add comment for documentation
COMMENT ON COLUMN eos_issues.why_it_matters IS 'Explains the potential impact if this risk/opportunity is ignored';