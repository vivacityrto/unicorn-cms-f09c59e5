
# Prompt 2 — `sql-setup/` deprecation (diff preview)

Scope: `sql-setup/` only. 14 files touched, 1 renamed. No DB changes. No edits outside this directory.

---

## Pre-flight: in-tree references

Verified before producing this diff:

- **`sql-setup/02-tenant-functions.sql`** is referenced in 2 places:
  - `sql-setup/README.md:10` — internal to scope; rewritten by this prompt.
  - `sql-setup/03-tenant-policies.sql:2` — internal to scope; banner covers it.
  - `supabase/migrations/20251127225243_*.sql:1` — **comment-only** historical pointer (`-- Restore original tenant helper functions from sql-setup/02-tenant-functions.sql`). Out of scope per your rules; flagged for follow-up.
- **`sql-setup/`** appears in 1 other migration as comment only:
  - `supabase/migrations/20260206233515_*.sql:5` — `-- Reference: sql-setup/00-security-helpers-reference.sql`. Comment, not `\i`, no execution risk.
- **No migration sources or `\i`-includes any sql-setup file.** Verified clean.

**Follow-up note (not actioned this prompt):** the 2 migration files contain stale path comments. Recommend a separate one-line cleanup prompt later.

---

## Task 1 — Rename + banner the highest-risk file

**Operation**: `git mv sql-setup/02-tenant-functions.sql sql-setup/02-tenant-functions.HISTORICAL.sql`, then prepend banner.

**Diff** (file at new path; full body of original retained below banner unchanged):

```diff
--- /dev/null
+++ b/sql-setup/02-tenant-functions.HISTORICAL.sql
@@ -0,0 +1,18 @@
+-- ============================================================
+-- DEPRECATED — DO NOT RUN
+-- ============================================================
+-- This file is preserved as historical reference only.
+--
+-- It defines is_vivacity(), is_superadmin(), and current_tenant()
+-- — none of which exist in production. Running it would create
+-- parallel helpers and silently bypass live RLS.
+--
+-- Live helpers (canonical, do not rename):
+--   public.is_staff()
+--   public.is_super_admin()                  -- and (uuid) overload
+--   public.is_vivacity_team_user(uuid)
+--   public.has_tenant_access(_tenant_id bigint)
+--   public.get_current_user_tenant()
+--
+-- For RLS conventions see CONTRIBUTING.md → Database Conventions
+-- (pending refresh) and the project memory.
+-- ============================================================
 -- Helper functions for multi-tenant architecture
 -- Run this SQL in your Supabase SQL editor AFTER running 01-tenant-schema.sql
 ... (existing 240-line body unchanged) ...

--- a/sql-setup/02-tenant-functions.sql
+++ /dev/null
(rename — original path no longer resolves; `psql -f sql-setup/02-tenant-functions.sql` will fail loudly with "No such file")
```

---

## Task 2 — Banner all other sql-setup/ files

**SQL files (12)** — prepend the standard SQL banner verbatim, then the existing file body:

```diff
@@ -0,0 +1,6 @@
+-- ============================================================
+-- DEPRECATED — historical bootstrap reference only.
+-- Live DB has 569 public tables, 1,151 migrations, and helper
+-- names that differ from this file. Do not run.
+-- See CONTRIBUTING.md and project memory for current truth.
+-- ============================================================
 (existing file body unchanged)
```

Applied identically to:

1. `sql-setup/00-security-helpers-reference.sql`
2. `sql-setup/01-tenant-schema.sql`
3. `sql-setup/03-tenant-policies.sql`
4. `sql-setup/04-seed-data.sql`
5. `sql-setup/05-audit-schema.sql`
6. `sql-setup/06-audit-rls-policies.sql`
7. `sql-setup/07-audit-rpc-functions.sql`
8. `sql-setup/08-audit-question-bank-seed.sql`
9. `sql-setup/09-resource-hub-schema.sql`
10. `sql-setup/10-resource-hub-storage.sql`
11. `sql-setup/11-resource-hub-functions.sql`
12. `sql-setup/12-resource-hub-seed.sql`

**README.md** — prepend the markdown banner, then the existing README body:

```diff
@@ -0,0 +1,11 @@
+> # DEPRECATED — bootstrap reference only
+>
+> The live database has 569 public tables, 1,151 migrations, and
+> canonical helpers/tables that differ from these files. **Do not
+> run any file in this directory against any database.** They are
+> preserved as historical context.
+>
+> Current truth lives in project memory and (post-refresh) in
+> CONTRIBUTING.md → Database Conventions. The 8 May 2026
+> Deployment Readiness Audit Section 3 contains the table-name
+> mapping.
+
 # Multi-Tenant Database Setup
 ... (existing README body unchanged) ...
```

Note: `sql-setup/README.md:10` ("02-tenant-functions.sql - Creates helper functions…") will become a stale internal reference once the rename lands. **Per your rules I am not editing the body in this prompt** — the top banner makes the whole file inert, so the stale line is harmless. Flagged for the future CONTRIBUTING.md prompt if you want it cleaned.

---

## Summary

| Change | File | Notes |
|---|---|---|
| Rename + banner | `sql-setup/02-tenant-functions.sql` → `…HISTORICAL.sql` | Highest-risk file; original path now 404s |
| Banner only | 12 other `sql-setup/*.sql` files | Identical 6-line SQL banner |
| Banner only | `sql-setup/README.md` | 11-line markdown banner |
| **Total** | **14 files touched, 1 renamed** | |

**Out of scope, flagged for later prompts:**
- `supabase/migrations/20251127225243_*.sql:1` — stale path comment.
- `supabase/migrations/20260206233515_*.sql:5` — stale path comment.
- `sql-setup/README.md` body line 10 referencing the old filename.
- `sql-setup/03-tenant-policies.sql` body line 2 referencing the old filename.

**Rollback**: `git revert <commit>`. No DB impact.

Reply **approve** to apply, or request changes to the diff.
