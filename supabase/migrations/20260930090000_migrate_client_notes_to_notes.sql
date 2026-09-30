-- Consolidate note storage: copy the legacy public.client_notes rows into
-- public.notes (the real notes system), so "pinned notes" have one source of truth.
--
-- What this does
--   * Copies every client_notes row into notes, PRESERVING the row id. Existing
--     client_timeline_events rows reference these notes by id (entity_type 'note'),
--     so keeping the id keeps those events resolvable (pin button, note lookups).
--   * A note that was linked to a package instance (related_entity_type
--     'package_instances') becomes a package_instance-level note with package_id
--     resolved from package_instances; anything else becomes a tenant-level note.
--   * Pauses trg_notes_timeline for the copy. That trigger inserts one
--     'structured_note_added' timeline event per notes INSERT; these notes already
--     have their timeline events (note_created + note_added), so letting it fire
--     would duplicate them. ALTER TABLE ... DISABLE TRIGGER takes a lock held until
--     the end of this transaction, so no concurrent notes insert can slip through
--     the paused window without its timeline event.
--
-- What this does NOT do
--   * Does not modify or delete client_notes or any timeline event. The old table
--     stays in place, unused by the app after the matching frontend change.
--   * Idempotent: ON CONFLICT (id) DO NOTHING, safe to re-run.

ALTER TABLE public.notes DISABLE TRIGGER trg_notes_timeline;

INSERT INTO public.notes (
  id, tenant_id, parent_type, parent_id, package_id,
  title, note_details, note_type, tags, is_pinned,
  created_by, created_at, updated_at
)
SELECT
  cn.id,
  cn.tenant_id::bigint,
  CASE WHEN pi.id IS NOT NULL THEN 'package_instance' ELSE 'tenant' END,
  CASE WHEN pi.id IS NOT NULL THEN pi.id ELSE cn.tenant_id::bigint END,
  pi.package_id,
  cn.title,
  cn.content,
  cn.note_type,
  COALESCE(cn.tags, '{}'),
  cn.is_pinned,
  cn.created_by,
  cn.created_at,
  cn.updated_at
FROM public.client_notes cn
LEFT JOIN public.package_instances pi
  ON cn.related_entity_type = 'package_instances'
 AND pi.id = CASE WHEN cn.related_entity_id ~ '^[0-9]+$' THEN cn.related_entity_id::bigint END
 AND pi.tenant_id = cn.tenant_id
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.notes ENABLE TRIGGER trg_notes_timeline;
