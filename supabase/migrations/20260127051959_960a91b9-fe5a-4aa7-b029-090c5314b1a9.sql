-- ============================================
-- NOTES PACKAGE ID ALIGNMENT MIGRATION
-- Updates package_id using name-based matching
-- ============================================

-- Update package_id by joining on package name
UPDATE public.notes n
SET package_id = p.id
FROM public.packages p
WHERE LOWER(TRIM(n.u1_package)) = LOWER(TRIM(p.name))
  AND n.u1_package IS NOT NULL;

-- Verification: Check results
DO $$
DECLARE
  notes_with_package_id INTEGER;
  orphaned_notes INTEGER;
BEGIN
  SELECT 
    COUNT(*) FILTER (WHERE package_id IS NOT NULL),
    COUNT(*) FILTER (WHERE u1_package IS NOT NULL AND package_id IS NULL)
  INTO notes_with_package_id, orphaned_notes
  FROM public.notes;
  
  RAISE NOTICE 'Notes updated with package_id: %', notes_with_package_id;
  RAISE NOTICE 'Orphaned notes (unmatched): %', orphaned_notes;
END $$;