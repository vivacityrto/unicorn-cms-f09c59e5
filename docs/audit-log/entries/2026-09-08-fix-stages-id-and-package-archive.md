# Fix stages.id missing default and packages archive status

**Date:** 2026-09-08

**Packet:** Phase 2.6 stabilization Packet P4-D (schema/product decision queue), L10 items #3 and #4

**Scope:** two production schema changes — one column default/sequence, one CHECK constraint widen

**Hosted state changed:** yes — schema only, no data touched

## Decision

Carl explicitly authorized fixing both after discussing the Phase 2.6
stabilization plan's remaining blocked items. Both are confirmed-live,
long-standing production bugs with a single clear fix already identified
in `docs/kb/reference/l10-real-bugs-found-2026-09-04.md` — no further
design decision was needed, unlike other P4-D items (#10, #14, #15, #16,
#18) which remain open pending their own decisions.

### L10 #3 — "Import Stage" has never worked

`public.stages.id` (integer) had no default/sequence at the database
level. `useStageExportImport.tsx`'s Import Stage flow inserts a new stage
without supplying `id`, so every attempt has always failed with a NOT
NULL violation. **A second, previously-undocumented occurrence was found
while fixing this**: `useStageDuplication.tsx`'s "Duplicate Stage" flow has
the identical bug — same missing default, same NOT NULL failure, never
reported before. Both are fixed by the same schema change; neither
required a code change since both inserts already omit `id`.

### L10 #4 — "Archive Package" has always failed

`public.packages_status_check` only allowed `'active'`/`'inactive'`.
`usePackageBuilder.tsx`'s `archivePackage()` sets `status: 'archived'`,
which has always thrown a `23514` CHECK violation on every Archive click.
The Package Builder list UI (`PackageBuilderOverview.tsx`,
`PackageBuilderEditor.tsx`) already has separate filter/count-badge/
bucketing logic for an "Archived" state — this was clearly an intended
third status, not something to collapse into `'inactive'`.

## Implementation

`supabase/migrations/20260908020000_fix_stages_id_default_and_package_archive_status.sql`:

- Adds an owned sequence (`stages_id_seq`) and `DEFAULT nextval(...)` to
  `public.stages.id`, matching the existing `tenants.id` convention
  (`nextval('tenants_id_seq'::regclass)`) already used elsewhere in this
  schema — not `IDENTITY`, to stay consistent with precedent. The
  sequence is seeded above the current `max(id)` so it can never collide
  with rows inserted by the pre-existing `MAX(id)+1` workaround code paths
  elsewhere (e.g. `usePackageBuilder.tsx`'s `createStage`) — those continue
  to work unchanged, since an explicit insert value always overrides a
  column default.
- No-ops (with a `RAISE NOTICE`) if a default already exists in the target
  environment.
- Widens `packages_status_check` to `ARRAY['active', 'inactive', 'archived']`
  via drop-then-recreate (existing rows are unaffected — the change only
  adds an allowed value, never removes one).
- Postflight-asserts `stages.id` has a default before completing.

No `migration-safety-allowlist.json` entry needed — pure DDL (sequence,
default, constraint), no risk-category match in `audit-migrations.mjs`.

Updated two stale code comments that documented these as known-unfixed
bugs (`useStageExportImport.tsx`, `useStageDuplication.tsx`) to point at
this fix instead, so a future reader doesn't rediscover the same root
cause a third time.

## Postflight

- `public.stages.id`'s `column_default` is `nextval('stages_id_seq'::regclass)`.
- `packages_status_check`'s definition now includes `'archived'`.
- Neither the `stages` nor `packages` table had any rows touched — this
  is a schema-only change.

## Open questions parked

- The `MAX(id)+1` workaround pattern still present in `usePackageBuilder.tsx`
  and elsewhere for `stages`/`packages` inserts is now unnecessary but
  harmless (an explicit id always wins over the new default) — cleaning
  those up to rely on the default is a separate, low-priority follow-up,
  not done here.
- L10 items #10, #14, #15, #16, #18 remain in the P4-D queue, each still
  needing its own design decision before a fix — not touched in this change.
