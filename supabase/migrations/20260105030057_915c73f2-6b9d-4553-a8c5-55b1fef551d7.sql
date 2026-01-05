-- Update tenant 364's TGA link to linked status (was created before auto-verify logic)
UPDATE public.tenant_registry_links 
SET 
  link_status = 'linked',
  verified_at = now(),
  verified_by = '611a7972-c465-4b08-8ff4-ebbb5faa14f0',
  updated_at = now()
WHERE tenant_id = 364 AND registry = 'tga';

-- Add audit entry
INSERT INTO public.client_audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, details)
VALUES (364, '611a7972-c465-4b08-8ff4-ebbb5faa14f0', 'tga.link.verified', 'tenant_registry_links', '364', 
  '{"rto_number": "40539", "verification_type": "manual_fix", "reason": "pre-existing pending link before auto-verify deployed"}'::jsonb);