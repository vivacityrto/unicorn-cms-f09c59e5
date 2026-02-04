-- EOS Rocks Hierarchy Migration
-- Adds support for Company → Team → Individual rock hierarchy

-- Add rock_level column (using existing 'level' column renamed/repurposed)
-- First check if rock_level exists, if not add it
ALTER TABLE eos_rocks 
  ADD COLUMN IF NOT EXISTS rock_level text DEFAULT 'company';

-- Add parent_rock_id for hierarchy linkage
ALTER TABLE eos_rocks 
  ADD COLUMN IF NOT EXISTS parent_rock_id uuid REFERENCES eos_rocks(id) ON DELETE SET NULL;

-- Add function_id for team rocks (links to accountability function)
ALTER TABLE eos_rocks 
  ADD COLUMN IF NOT EXISTS function_id uuid REFERENCES accountability_functions(id) ON DELETE SET NULL;

-- Add vto_id to link company rocks to the V/TO (mission alignment)
ALTER TABLE eos_rocks 
  ADD COLUMN IF NOT EXISTS vto_id uuid REFERENCES eos_vto(id) ON DELETE SET NULL;

-- Add archived_at for soft deletion/archiving
ALTER TABLE eos_rocks 
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- Add sort_order for ordering within level
ALTER TABLE eos_rocks 
  ADD COLUMN IF NOT EXISTS sort_order int DEFAULT 0;

-- Create indexes for efficient hierarchy queries
CREATE INDEX IF NOT EXISTS idx_eos_rocks_parent_rock_id ON eos_rocks(parent_rock_id);
CREATE INDEX IF NOT EXISTS idx_eos_rocks_rock_level ON eos_rocks(rock_level);
CREATE INDEX IF NOT EXISTS idx_eos_rocks_function_id ON eos_rocks(function_id);
CREATE INDEX IF NOT EXISTS idx_eos_rocks_vto_id ON eos_rocks(vto_id);
CREATE INDEX IF NOT EXISTS idx_eos_rocks_archived_at ON eos_rocks(archived_at);
CREATE INDEX IF NOT EXISTS idx_eos_rocks_quarter ON eos_rocks(quarter_year, quarter_number);

-- Migrate existing rocks: set all to company level
UPDATE eos_rocks 
SET rock_level = 'company' 
WHERE rock_level IS NULL OR rock_level = '';

-- Link existing company rocks to the active VTO for their tenant
UPDATE eos_rocks r
SET vto_id = (
  SELECT v.id 
  FROM eos_vto v 
  WHERE v.tenant_id = r.tenant_id 
  ORDER BY v.created_at DESC 
  LIMIT 1
)
WHERE r.rock_level = 'company' AND r.vto_id IS NULL;

-- Create a function to compute roll-up status for a rock based on its children
CREATE OR REPLACE FUNCTION compute_rock_rollup_status(rock_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  child_count int;
  off_track_count int;
  complete_count int;
  own_status text;
BEGIN
  -- Get the rock's own status
  SELECT status INTO own_status FROM eos_rocks WHERE id = rock_id;
  
  -- Count children and their statuses
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE LOWER(status) IN ('off_track', 'at_risk')),
    COUNT(*) FILTER (WHERE LOWER(status) = 'complete')
  INTO child_count, off_track_count, complete_count
  FROM eos_rocks 
  WHERE parent_rock_id = rock_id AND archived_at IS NULL;
  
  -- No children = return own status
  IF child_count = 0 THEN
    RETURN own_status;
  END IF;
  
  -- Any child off-track = parent is off-track
  IF off_track_count > 0 THEN
    RETURN 'off_track';
  END IF;
  
  -- All children complete = parent can be complete
  IF complete_count = child_count THEN
    RETURN 'complete';
  END IF;
  
  -- Otherwise on-track
  RETURN 'on_track';
END;
$$;

-- Create trigger to update parent's updated_at when child status changes
CREATE OR REPLACE FUNCTION cascade_rock_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- When a rock's status changes, update parent's updated_at to trigger re-render
  IF NEW.parent_rock_id IS NOT NULL AND 
     (OLD.status IS DISTINCT FROM NEW.status OR TG_OP = 'INSERT') THEN
    UPDATE eos_rocks 
    SET updated_at = NOW()
    WHERE id = NEW.parent_rock_id;
  END IF;
  RETURN NEW;
END;
$$;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS trg_cascade_rock_status ON eos_rocks;
CREATE TRIGGER trg_cascade_rock_status
  AFTER INSERT OR UPDATE OF status ON eos_rocks
  FOR EACH ROW
  EXECUTE FUNCTION cascade_rock_status_change();

-- Add constraint to validate rock_level values
ALTER TABLE eos_rocks 
  DROP CONSTRAINT IF EXISTS chk_rock_level_valid;
ALTER TABLE eos_rocks 
  ADD CONSTRAINT chk_rock_level_valid 
  CHECK (rock_level IS NULL OR rock_level IN ('company', 'team', 'individual'));