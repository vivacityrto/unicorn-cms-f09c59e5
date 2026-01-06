-- Link the email to the stage with manual trigger (stage completion will be handled via manual send)
INSERT INTO package_stage_emails (package_id, stage_id, email_template_id, trigger_type, recipient_type, sort_order, is_active)
SELECT 
  39, 
  ds.id,
  et.id,
  'manual',
  'tenant',
  1,
  true
FROM documents_stages ds
CROSS JOIN email_templates et
WHERE ds.title = 'RTO Documentation – 2025'
  AND et.slug = 'your-2025-rto-documents-are-ready';