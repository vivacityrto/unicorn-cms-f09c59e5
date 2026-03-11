
-- Phase 2: Seed stage_documents from documents.stage (FK-safe: only valid stage refs)
INSERT INTO stage_documents (
  stage_id, document_id, is_core, is_active, added_source,
  visibility, delivery_type, is_auto_generated, is_tenant_visible, is_required
)
SELECT 
  d.stage, d.id,
  COALESCE(d.is_core, true), true, 'migration',
  CASE WHEN d.is_team_only THEN 'team_only' ELSE 'both' END,
  CASE WHEN d.is_auto_generated THEN 'auto_generate' ELSE 'manual' END,
  COALESCE(d.is_auto_generated, false),
  CASE WHEN d.is_team_only THEN false ELSE true END,
  false
FROM documents d
WHERE d.stage IS NOT NULL
  AND EXISTS (SELECT 1 FROM documents_stages ds WHERE ds.id = d.stage);

-- Backfill generation_status on existing document_instances
UPDATE document_instances 
SET generation_status = CASE WHEN isgenerated THEN 'generated' ELSE 'pending' END
WHERE generation_status IS NULL;
