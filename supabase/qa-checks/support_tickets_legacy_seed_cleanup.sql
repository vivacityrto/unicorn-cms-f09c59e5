-- QA ONLY (unicorn-qa, project qfpxvumcrnzrjyvqkicq). Never run against production.
-- Removes everything support_tickets_legacy_seed.sql and the QA backfill run created.
-- Run as the database owner. Idempotent. Order matters (children first).
-- QA had no rows in the five dd_suggest_* tables and no tenant 6372 before the seed.

BEGIN;

-- New-model rows created by the QA backfill (ids are the legacy ids, so the map is the key).
DELETE FROM public.support_tickets WHERE id IN (SELECT ticket_id FROM public.support_ticket_migration_map);
DELETE FROM public.support_ticket_migration_map;
DELETE FROM public.support_ticket_migration_checks;

-- Notifications the trigger tests may have produced for synthetic tickets.
DELETE FROM public.user_notifications
 WHERE type IN ('ticket_submitted', 'ticket_reply', 'ticket_assigned', 'ticket_resolved')
   AND created_at >= date '2026-11-13';

-- Synthetic legacy rows (fixed id prefixes a0000000-… / a1000000-… / b0000000-… / b1000000-…).
DELETE FROM public.suggest_attachments WHERE id::text LIKE 'a1000000-0000-4000-8000-%';
DELETE FROM public.suggest_items       WHERE id::text LIKE 'a0000000-0000-4000-8000-%';
DELETE FROM public.help_messages       WHERE id::text LIKE 'b1000000-0000-4000-8000-%';
DELETE FROM public.help_threads        WHERE id::text LIKE 'b0000000-0000-4000-8000-%';

-- Reference rows and the tenant stand-in added for the seed.
DELETE FROM public.dd_suggest_item_type;
DELETE FROM public.dd_suggest_status;
DELETE FROM public.dd_suggest_priority;
DELETE FROM public.dd_suggest_impact_rating;
DELETE FROM public.dd_suggest_release_status;
DELETE FROM public.tenants WHERE id = 6372 AND slug = 'qa-vivacity-standin';

COMMIT;
