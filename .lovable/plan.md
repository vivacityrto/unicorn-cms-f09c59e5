# Archive Tier-3 Orphan Consult Tables

## Summary
Move `consult_entries` and `consult_logs_unmapped_quarantine` from `public` to `archive` schema. Both tables are legacy, zero rows, and have no live consumers. Policies, indexes, triggers, and outgoing FKs travel with the tables automatically.

## Scope
- **In scope:**
  - `public.consult_entries` → `archive.consult_entries`
  - `public.consult_logs_unmapped_quarantine` → `archive.consult_logs_unmapped_quarantine`
  - Add `COMMENT ON TABLE` to both before the move (documents provenance and drop-after guidance)
- **Out of scope:**
  - `consult_logs` (canonical, stays in `public`)
  - `consults` + `consult_time_entries` (Tier 2, deferred)
  - `merge_tenants` function
  - Any view, edge function, RPC, frontend file, or documentation

## Migration SQL
```sql
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
```

## Rollback
```sql
ALTER TABLE archive.consult_logs_unmapped_quarantine SET SCHEMA public;
ALTER TABLE archive.consult_entries SET SCHEMA public;
```

## Impact
- `types.ts` auto-regenerates and loses the two table blocks from `public` schema.
- No application code references either table; zero frontend impact.
- Advisor lint on these tables (if any) is resolved by removing them from `public`.
- `archive` schema USAGE is already gated for `authenticated`; SuperAdmin-only policies travel with the tables, preserving defense-in-depth.