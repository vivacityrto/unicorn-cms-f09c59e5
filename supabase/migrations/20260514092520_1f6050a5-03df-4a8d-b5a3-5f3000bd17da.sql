-- 1. Document the legacy role on each table before move
COMMENT ON TABLE public.consult_entries IS
  'Legacy/design-era consultation entries table. 0 rows since
   inception. No live consumers — no views, no functions, no
   frontend code reads or writes. Canonical consultation table
   is consult_logs (referenced by 5 production views). Archived
   per 8 May audit P1 consult tables consolidation.';

COMMENT ON TABLE public.consult_logs_unmapped_quarantine IS
  'Legacy/design-era quarantine table for un-mappable consult
   log imports — Phase 3 failsafe from migration 20260217022250.
   0 rows since inception (consult_logs had 0 rows when the
   backfill ran). No live consumers. Canonical consultation
   table is consult_logs. Archived per 8 May audit P1 consult
   tables consolidation.';

-- 2. Move both tables to archive. Policies, indexes, triggers,
--    outgoing FKs, and owned sequences travel with the tables.
ALTER TABLE public.consult_entries SET SCHEMA archive;
ALTER TABLE public.consult_logs_unmapped_quarantine SET SCHEMA archive;