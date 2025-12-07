-- Create enum type for Australian states
CREATE TYPE australian_state AS ENUM ('NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT');

-- Add state column to tenants table
ALTER TABLE tenants
ADD COLUMN state australian_state;

-- Add comment for documentation
COMMENT ON COLUMN tenants.state IS 'Australian state or territory where the tenant is located';