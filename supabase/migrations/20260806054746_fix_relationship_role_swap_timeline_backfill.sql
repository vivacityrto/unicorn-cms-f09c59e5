-- Backfill account_role_changed timeline events from audit_eos_events.

INSERT INTO public.client_timeline_events (
  tenant_id, client_id, event_type, title, body,
  entity_type, entity_id, metadata, occurred_at, created_by, source, visibility
)
SELECT
  a.tenant_id,
  a.tenant_id::text,
  'account_role_changed',
  format(
    '%s: %s → %s',
    COALESCE(
      NULLIF(trim(both ' ' FROM concat_ws(' ', u.first_name, u.last_name)), ''),
      u.email,
      'User'
    ),
    public.relationship_role_label(a.details->>'old_relationship_role'),
    public.relationship_role_label(a.details->>'new_relationship_role')
  ),
  NULL,
  'user',
  a.user_id::text,
  jsonb_build_object(
    'previous_role', a.details->>'old_relationship_role',
    'new_role', a.details->>'new_relationship_role',
    'target_name', trim(both ' ' FROM concat_ws(' ', u.first_name, u.last_name)),
    'changed_by', a.details->>'changed_by',
    'backfilled', true,
    'source_audit_eos_event_id', a.id
  ),
  a.created_at,
  NULLIF(a.details->>'changed_by', '')::uuid,
  'user',
  'internal'
FROM public.audit_eos_events a
LEFT JOIN public.users u ON u.user_uuid = a.user_id
WHERE a.action = 'relationship_role_changed'
  AND a.tenant_id IS NOT NULL
  AND a.details ? 'new_relationship_role'
  AND NOT EXISTS (
    SELECT 1 FROM public.client_timeline_events e
    WHERE e.event_type = 'account_role_changed'
      AND e.entity_type = 'user'
      AND e.entity_id = a.user_id::text
      AND e.tenant_id = a.tenant_id
      AND e.metadata->>'source_audit_eos_event_id' = a.id::text
  );
