-- Add package_added_at column to track when tenant was added to a package
ALTER TABLE tenants
ADD COLUMN package_added_at timestamp with time zone;

-- Set package_added_at to created_at for existing tenants that have a package
UPDATE tenants
SET package_added_at = created_at
WHERE package_id IS NOT NULL AND package_added_at IS NULL;

-- Create a trigger to automatically set package_added_at when package_id is updated
CREATE OR REPLACE FUNCTION update_package_added_at()
RETURNS TRIGGER AS $$
BEGIN
  -- If package_id is being set (not null) and was previously null or different
  IF NEW.package_id IS NOT NULL AND (OLD.package_id IS NULL OR OLD.package_id != NEW.package_id) THEN
    NEW.package_added_at = now();
  END IF;
  
  -- If package_id is being cleared, also clear package_added_at
  IF NEW.package_id IS NULL THEN
    NEW.package_added_at = NULL;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger
CREATE TRIGGER set_package_added_at
BEFORE UPDATE ON tenants
FOR EACH ROW
EXECUTE FUNCTION update_package_added_at();

-- Add comment for documentation
COMMENT ON COLUMN tenants.package_added_at IS 'Timestamp when the tenant was added to their current package';