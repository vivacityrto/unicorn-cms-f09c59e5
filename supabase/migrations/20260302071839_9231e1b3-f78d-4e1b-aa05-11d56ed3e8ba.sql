-- Backfill missing email_instances for existing stage_instances
INSERT INTO email_instances (email_id, stageinstance_id, subject, content, is_sent, user_attachments)
SELECT e.id, si.id, e.subject, e.content, false, ''
FROM stage_instances si
JOIN emails e ON e.stage_id = si.stage_id
LEFT JOIN email_instances ei ON ei.email_id = e.id AND ei.stageinstance_id = si.id
WHERE ei.id IS NULL;

-- Backfill missing document_instances for existing stage_instances
INSERT INTO document_instances (document_id, stageinstance_id, tenant_id, status, isgenerated)
SELECT d.id, si.id, pi.tenant_id, 'pending', false
FROM stage_instances si
JOIN package_instances pi ON pi.id = si.packageinstance_id
JOIN documents d ON d.stage = si.stage_id
LEFT JOIN document_instances di ON di.document_id = d.id AND di.stageinstance_id = si.id
WHERE di.id IS NULL;