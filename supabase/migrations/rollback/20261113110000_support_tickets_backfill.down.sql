-- Rollback for 20261113110000_support_tickets_backfill.sql.
-- Removes exactly the tickets recorded in the migration map (cascade removes
-- their messages and attachment rows). The legacy tables were never modified,
-- and attachment files were never moved, so nothing is lost. Run ONLY before
-- cut-over; replies added on the new model after cut-over would be removed too.
-- Safe to run more than once.

DELETE FROM public.support_tickets
 WHERE id IN (SELECT ticket_id FROM public.support_ticket_migration_map);
DELETE FROM public.support_ticket_migration_map;
DELETE FROM public.support_ticket_migration_checks;
