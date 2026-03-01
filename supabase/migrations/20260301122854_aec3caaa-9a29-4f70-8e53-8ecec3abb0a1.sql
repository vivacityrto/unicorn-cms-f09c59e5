-- Step 1: Map labels (case-insensitive) to their correct values
UPDATE documents SET category = cat.value
FROM dd_document_categories cat
WHERE documents.category IS NOT NULL
  AND LOWER(TRIM(documents.category)) = LOWER(TRIM(cat.label));

-- Step 2: Handle "cricos-documents" (already lowercase matching value)
-- Already handled by step 1 since LOWER('CRICOS-Documents') = LOWER('CRICOS-Documents')

-- Step 3: Orphans to 'uncategorised'
UPDATE documents SET category = 'uncategorised'
WHERE category IS NOT NULL
  AND category NOT IN (SELECT value FROM dd_document_categories);