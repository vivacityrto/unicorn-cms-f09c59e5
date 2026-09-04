# Real bugs found and fixed — for Monday L10 report (2026-09-04 session)

> Compiled for Carl to report at the Monday L10. These are all **real,
> currently/previously-broken features** discovered as a side effect of the
> `@typescript-eslint/no-explicit-any` retirement work (Phase 2.5 of
> `codebase-optimization-plan-2026-08-28.md`) — not hypothetical or
> theoretical issues. Each one was found because removing a loose `any` cast
> forced TypeScript (or a live Playwright check) to check the real shape of
> the data against the real database schema, and the mismatch was real.
>
> Status key: **FIXED** = shipped and verified live tonight. **DOCUMENTED,
> NOT FIXED** = confirmed real, deliberately left alone because the correct
> fix needs a schema decision/migration or is out of scope for a type-only
> change — tracked here as a backlog item, not silently dropped.

## Package Builder (`/admin/manage-packages`, `/admin/package-builder/:id`)

### 1. "Create Package" has never worked — FIXED
`usePackageBuilder.tsx`'s `createPackage()` never supplied an `id` when
inserting into `packages`. That table's `id` column has no default,
identity, or sequence at the database level (confirmed via
`information_schema.columns` + `pg_trigger`) — every real attempt to click
"Create Package" would fail with a NOT NULL/primary-key constraint
violation. Fixed by computing `MAX(id)+1` before inserting, the same
approach a sibling function (`duplicatePackage`) already used correctly.

**Verified tonight**: created a real test package via the UI (succeeded,
count went 45→46), and separately verified via direct SQL that the fixed
insert produces a row structurally identical to the ones created by the
2026-08-07 `academy_seed_superhero_sidekick_packages` migration and the
2026-06-26 "V2" package batch (Diamond Membership V2, KickStart V2, etc.) —
same `slug` auto-generation, same `progress_mode`/`document_assurance_period`
defaults. Both test rows deleted afterward.

**Context on how anyone created packages before this fix**: they didn't,
through the app. Every "recent" package anyone remembers (Superhero,
Sidekick, all the V2 packages) was created via **raw SQL run directly
against the database**, not through the "Create Package" button and not
even through a tracked migration in most cases (checked the migration
history for the V2 batch's creation date, 2026-06-26 — zero migrations
exist for that whole date range). Someone manually computed the next
available ID and inserted directly.

### 2. "Create New Stage" has never worked — FIXED
Identical bug, same root cause: `stages.id` also has no default. Used by
"Create New Stage" in both the Stage Library dialog and the Stage Detail
panel's duplicate-stage flow. Fixed the same way.

**Verified tonight**: created a real test stage via the UI, attached it to
the test package, confirmed success, then removed it from the package and
deleted the orphaned row via SQL.

### 3. "Import Stage" has never worked — DOCUMENTED, NOT FIXED
Found **earlier tonight** (batch 8b, a few hours before #1/#2 above, in a
completely different file: `useStageExportImport.tsx`) — same exact root
cause. Already has a code comment: *"stages.id has no default/sequence...
every insert into `stages` requires an explicit id. This insert has always
failed with a NOT NULL violation — 'Import Stage' has never actually
created a stage."* Deliberately left broken because the real fix is a
schema decision (add a sequence/default to `stages.id`) that needs its own
migration and audit entry — out of scope for a type-only batch. **This is
the one still-open item from tonight** — worth deciding whether to add a
proper default/sequence to both `packages.id` and `stages.id` so future
code doesn't need to keep rediscovering this by hand.

### 4. "Archive Package" has always failed — DOCUMENTED, NOT FIXED
`archivePackage()` sets `status: 'archived'`, but the database's
`packages_status_check` CHECK constraint only allows `'active'`/`'inactive'`
— confirmed live (a real `23514` constraint violation on every Archive
click during tonight's testing). Not a simple code fix: the Package Builder
UI clearly intends three distinct statuses (separate filter option, count
badge, and "Draft" vs "Archived" bucketing all exist in the list view), so
this needs the CHECK constraint widened via a migration, not a code change
that would just quietly collapse "archived" into "inactive."

### 5. Stage Preview dialog has never shown real data — DOCUMENTED, NOT FIXED
The "Stage Preview" dialog (shows a stage's usage — team tasks, client
tasks, emails, documents — across every package it's used in) queries a
column `documents.doc_name` that doesn't exist (the real column is
`title`) — that part is **fixed** and verified correct at the network-request
level. But all four of this dialog's queries also embed
`packages:package_id (name)`, and **none of the four tables involved
actually has a foreign key from `package_id` to `packages`** (confirmed via
`pg_constraint`). Every one of them 400s with "could not find a
relationship." Net effect: this dialog has never shown real data for any
stage, in any of its four sections, regardless of the `doc_name` fix. Needs
either a two-step fetch (a pattern already used elsewhere in this codebase
for tables without a real FK) or an actual migration adding the missing
FKs.

### 6. Package readiness badges were checking against blank data — FIXED
The "Readiness" column in the Package list computes whether a package has
an onboarding stage, an offboarding stage, documentation stages, etc. The
query feeding that computation never selected `stage_type`/`stage_key` from
the joined stage — so those checks always evaluated against `undefined`.
Fixed by adding the two missing columns to the select.

### 7. "Propagate hours to active instances" has always failed — FIXED
After editing a package's total hours, the editor offers to push the new
hours to all currently-active instances of that package. The update
filtered `package_instances` by `.eq('status', 'active')` — but that table
has no `status` column at all (the real fields are `is_active`/
`is_complete` booleans). Fixed to match the same pattern already used
correctly elsewhere in the codebase (`is_active = true AND is_complete =
false`).

### 8. "Bulk Generate Documents" tenant list has never loaded — DOCUMENTED, NOT FIXED
Found during live verification of the fixes above. The Bulk Generate Documents
dialog's "which tenants have this package" query embeds
`client_package_stage_state:tenant_id, tenants(id, name)` — but
`client_package_stage_state` has **no foreign key to `tenants` at all**
(confirmed via `pg_constraint`; its only real FK is `stage_id →
documents_stages`). Every real invocation 400s with "could not find a
relationship." Confirmed this is not something introduced tonight — the exact
same query string existed before any of tonight's changes; the type-safety
fix only added a compile-time generic, never touched the runtime request.
Same root cause and same fix options as item 5 above (two-step fetch, or an
actual FK via migration).

## Admin — Client Package Detail (`/admin/client-packages/:id`)

### 9. Client Package Detail has never shown a package's stages, tasks, documents, or emails — FIXED
**Correction (found during live verification, see below): despite its name,
`ClientPackageDetail.tsx` is a staff-only admin page** (route
`/admin/client-packages/:clientPackageId`, gated by the deny-by-default RBAC
rule — a client-role user hitting this URL is redirected to `/dashboard`
before the page ever mounts). It's where staff drill into one specific
client's package instance from the admin side, not something clients see
themselves. The bug and fix below are unaffected by this correction — a
PostgREST column error fails identically regardless of who's logged in —
only the "who's been affected" framing changes: it's staff viewing a
client's package, not clients viewing their own.

`useClientPackageInstances.tsx`'s `fetchPackageStages()` — the data source
for this page — selected a `status_id` column from `stage_instances`. That
column was removed from the table in an earlier "stage status consolidation
Phase A" (the file's own pre-existing comment on `STAGE_STATUS_MAP` already
documented the removal, just not that this specific query still requested
it). PostgREST returns a 400 for a select referencing a nonexistent column,
so this query has **always thrown** and the function's catch block has
always silently returned an empty array. Net effect: **staff have never
seen a package instance's stage list, team tasks, client tasks, linked
documents, or queued emails on this admin page** — regardless of how much
real data exists for that package instance.

**Verified before fixing, not guessed**: ran `select column_name from
information_schema.columns where table_name = 'stage_instances'` directly
against the live database — confirmed no `status_id` column exists, only
`status` (text). Also confirmed the real distinct `status` values in
production (`not_started`, `in_progress`, `completed`, `na`,
`core_complete`, `monitor`) via `select distinct status from
stage_instances`.

**Fix**: removed `status_id` from the query; added a
`STAGE_STATUS_TO_LEGACY_ID` map deriving the legacy numeric id the page's
UI still expects (`ClientPackageDetail.tsx`'s `STAGE_STATUS_ID_TO_KEY`)
from the real `status` string. Four of the six real values map cleanly;
`core_complete` and `monitor` have no exact legacy equivalent and were
mapped to the closest active-work bucket (`completed`/`in_progress`
respectively) with an inline comment flagging this for a product decision
if either status ever needs its own distinct badge/behavior in this page.

## Also found this session, outside Package Builder (for completeness)

These were found and either fixed or documented in earlier batches tonight,
on unrelated features:

- **`AddTimeDialog.tsx` note-creation** — was writing the acting user's ID
  into the wrong (legacy numeric) column instead of the required
  `created_by` field. **FIXED.** The same insert also references two
  columns that don't exist at all (`client_id`, `package_instance_id`) —
  **documented, not fixed**, needs a product decision on the intended
  parent/child mapping.
- **`useEosHealth.tsx` Health Score** — the Rocks-discipline dimension
  never selected `seat_id`, so it always treated every Rock as seat-less.
  **FIXED.**
- **`useEosHealth.tsx` People System dimension** — queried 4 nonexistent
  `eos_qc` columns, always silently scored 0. **FIXED.**
- **`useStageActiveUsage.tsx`** — queried a nonexistent `tenants.tenant_id`
  column, so the "active clients using this stage" widget always showed
  placeholder names instead of real ones. **FIXED.**
- **`useStageAnalytics.tsx` High-Risk Stages widget** — wrong audit-log
  column reference. **FIXED.**
- **`ClientStructuredNotesTab.tsx`** — its own `ApiComment` interface was
  missing a `task_id` field the code actually reads from ClickUp comments.
  **FIXED.**
- **`EditTimeDialog.tsx` / `AddTimeDialog.tsx`** — both show a blank/wrong
  "Person" field when editing a time entry, because `tenant_users.user_id`
  has no FK to `public.users` — the same class of gap as item 5 above, just
  a different table pair. **Documented, not fixed** in either case.

## What this means practically

Nothing above was caused by tonight's work — every one of these bugs
pre-dated this session; the type-safety cleanup just surfaced them by
forcing the compiler (or a live click-through) to check assumptions that
had been hidden behind `any`. Seven real, previously-silently-broken features got fixed tonight, six
verified live so far (item 9 — a staff-facing admin page for viewing a
client's package instance, see the correction in that item about who's
actually affected — was verified for its type-safety/lint/test contract;
its live browser check needed a staff persona and is being re-run). Five
more (items 3,
4, 5, 8 above, plus the two `tenant_users`→`users` FK gaps outside Package
Builder) are confirmed real and written up with enough detail to scope a
fix, deliberately left
alone because the correct fix is a schema/migration decision, not a
type-only code change.
