-- ============================================================
-- Fix eos_issues.category having a DEFAULT value its own CHECK
-- constraint forbids
--
-- Hand-authored hotfix, applied directly to prod via Supabase MCP
-- (execute_sql) with Carl's explicit approval, then committed here to
-- keep migration history in sync per project convention.
--
-- category defaulted to 'weekly' (a value that belongs to a different
-- column's vocabulary elsewhere in the EOS schema, e.g. recurrence
-- frequency), but eos_issues_category_check only allows: delivery,
-- compliance, financial, capacity, systems, client, strategic, growth.
-- 'weekly' has never been a valid value. Since category is nullable,
-- any insert that omits it (exactly what CreateIssueDialog does when
-- Category is left blank - it's presented as optional in the form)
-- relied on the default and always failed with:
--   new row for relation "eos_issues" violates check constraint
--   "eos_issues_category_check"
--
-- Discovered live while dry-running the IDS segment of a seeded test
-- L10 meeting - reproduced the exact 400 by submitting "Add Issue"
-- with no Category selected, then fixed and re-verified with a direct
-- insert mirroring the same omitted-category payload.
--
-- Fix: drop the bogus default so an omitted category correctly stores
-- NULL (already allowed by the constraint and by the column's own
-- nullability) instead of falling through to an invalid default.
-- ============================================================

BEGIN;

ALTER TABLE public.eos_issues ALTER COLUMN category DROP DEFAULT;

COMMIT;
