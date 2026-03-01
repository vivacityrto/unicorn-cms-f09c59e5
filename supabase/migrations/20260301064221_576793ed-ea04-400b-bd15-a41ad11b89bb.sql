
-- Part A: Drop unused merge_fields column from documents
ALTER TABLE documents DROP COLUMN IF EXISTS merge_fields;

-- Part B: Add tailoring validation columns to governance_document_deliveries
ALTER TABLE governance_document_deliveries
  ADD COLUMN IF NOT EXISTS tailoring_completeness_pct smallint,
  ADD COLUMN IF NOT EXISTS missing_merge_fields jsonb,
  ADD COLUMN IF NOT EXISTS invalid_merge_fields jsonb,
  ADD COLUMN IF NOT EXISTS tailoring_risk_level text;

-- Add check constraint for risk level values
ALTER TABLE governance_document_deliveries
  ADD CONSTRAINT chk_tailoring_risk_level
  CHECK (tailoring_risk_level IS NULL OR tailoring_risk_level IN ('complete', 'partial', 'incomplete'));

-- Add check constraint for completeness percentage range
ALTER TABLE governance_document_deliveries
  ADD CONSTRAINT chk_tailoring_completeness_pct
  CHECK (tailoring_completeness_pct IS NULL OR (tailoring_completeness_pct >= 0 AND tailoring_completeness_pct <= 100));
