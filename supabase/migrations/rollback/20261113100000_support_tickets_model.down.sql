-- Rollback for 20261113100000_support_tickets_model.sql.
-- Safe to run more than once. Run ONLY before the cut-over migration
-- (20261113120000); after cut-over use 20261113120000_support_tickets_cutover.down.sql first,
-- and copy any ticket raised on the new model back to the old tables.
-- Dropping the tables cascades to messages and attachment rows. Files in the
-- ticket-files bucket are removed only if the bucket is empty (storage objects
-- must be deleted through the Storage API, never by SQL).

DROP POLICY IF EXISTS support_ticket_files_read   ON storage.objects;
DROP POLICY IF EXISTS support_ticket_files_upload ON storage.objects;
DROP POLICY IF EXISTS support_ticket_files_delete ON storage.objects;

DELETE FROM storage.buckets b
 WHERE b.id = 'ticket-files'
   AND NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'ticket-files');

DROP TABLE IF EXISTS public.support_ticket_migration_checks;
DROP TABLE IF EXISTS public.support_ticket_migration_map;
DROP TABLE IF EXISTS public.support_ticket_attachments;
DROP TABLE IF EXISTS public.support_ticket_messages;
DROP TABLE IF EXISTS public.support_tickets;

DROP FUNCTION IF EXISTS public.create_support_ticket(text, text, text, jsonb, text, bigint, text, text, text);
DROP FUNCTION IF EXISTS public.support_ticket_messages_after_insert();
DROP FUNCTION IF EXISTS public.support_tickets_after_update();
DROP FUNCTION IF EXISTS public.support_tickets_before_update();
DROP FUNCTION IF EXISTS public.can_read_support_file(text, text);
DROP FUNCTION IF EXISTS public.can_view_support_ticket(uuid);
DROP FUNCTION IF EXISTS public.support_notify(uuid, bigint, text, text, text, text, text, uuid, uuid);
DROP FUNCTION IF EXISTS public.support_triage_recipients(uuid, uuid);
DROP FUNCTION IF EXISTS public.support_user_academy_only(bigint, uuid);
DROP FUNCTION IF EXISTS public.support_status_label(text);
