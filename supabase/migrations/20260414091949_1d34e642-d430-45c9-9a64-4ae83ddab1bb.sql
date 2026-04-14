-- Patch existing audit to use the correct template and delete empty freeform sections
DELETE FROM client_audit_sections WHERE audit_id = '65df89a8-0c1f-475c-b30b-3044720a121c';
UPDATE client_audits SET template_id = 'cc025000-0000-0000-0000-000000000001' WHERE id = '65df89a8-0c1f-475c-b30b-3044720a121c';