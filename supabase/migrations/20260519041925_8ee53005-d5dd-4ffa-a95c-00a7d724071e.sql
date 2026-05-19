-- Phase 5C: Archive legacy eos_issue_status enum
-- Ensure archive schema exists
CREATE SCHEMA IF NOT EXISTS archive;

-- Move legacy enum out of public into archive
ALTER TYPE public.eos_issue_status SET SCHEMA archive;

COMMENT ON TYPE archive.eos_issue_status IS
  'Archived 2026-05-19. Replaced by dd_eos_issue_status lookup table (Phase 5C migration). '
  'Retained for rollback reference. Do not use in new code. '
  'Rollback: ALTER TYPE archive.eos_issue_status SET SCHEMA public;';