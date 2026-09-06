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

**Verified live (SuperAdmin, subagent) against a real record** — Demo RTO's
"M-RR" package instance (id 15201), confirmed via direct SQL to have 9 real
`stage_instances` rows before testing: `/admin/client-packages/15201` now
renders all 9 stages correctly (Setup Client, Professional Development,
Vivacity Training, RTO Documentation - 2025, Consultation Hours, Compliance
Health Check, Assessment Validation, Finalise client, Compliance Health
Check 2025), each with a correct status badge derived from the real
`status` column. Expanded one stage and confirmed its Team Tasks (25 real
items) and Documents (17 real items) sections render with real content.
The `stage_instances` request itself confirmed 200 (previously 400) via
network inspection. Zero console errors tied to this fix (two pre-existing,
unrelated errors were observed — an "Ask Viv" feature-flag lookup returning
406/PGRST116 — confirmed unrelated to this hook or page).

## Audit workspace — scheduling (`/admin/audits/:id`, Schedule tab)

### 10. Opening/closing meeting calendar invites have never actually been sent — DOCUMENTED, NOT FIXED
`useAuditSchedule.ts`'s `useScheduleAuditPhase()` creates a local `calendar_events`
row after scheduling an opening or closing meeting, then uses that row's id to
call the `sync-outlook-calendar` edge function (which sends the actual Outlook
invite). The `calendar_events` insert never supplies `calendar_id` or
`provider_event_id` — both `NOT NULL` with no default at the database level —
so the insert has **always** failed with a constraint violation. The whole
thing is wrapped in `try { ... } catch { /* Calendar event creation is
optional */ }`, so the failure has always been silently swallowed: the meeting
itself gets scheduled correctly (via the `schedule_audit_phase` RPC, which is
unaffected), but no calendar entry is created and no Outlook invite has ever
gone out to attendees.

**Verified live, not guessed**: confirmed both columns are `NOT NULL` with no
`column_default` via `information_schema.columns`, and confirmed **0 of
9,611** existing `calendar_events` rows have `provider = 'internal'` (the
literal value this insert always sets) — meaning this insert has never once
succeeded in production, for any audit, ever.

Not fixed here because the correct source for `calendar_id`/`provider_event_id`
on a purely-internal (non-Outlook-originated) calendar event is a product/
schema decision, not a type-only change — it's out of scope for this batch.

## KPI v2 dashboard (`src/hooks/useKpiAccess.tsx`)

### 11. "Team KPI" toggle never renders for real SuperAdmin accounts — DOCUMENTED, NOT FIXED
`useKpiAccess.tsx`'s `canViewAnyStaff` — which gates the "Team KPI" toggle and
the whole `KpiTeamSection`/`KpiDrillDownSheet` team dashboard — checks only
`profile?.global_role === 'SuperAdmin'`. The codebase's own canonical
`useAuth().isSuperAdmin()` check (used everywhere else) explicitly checks
**both** `global_role === 'SuperAdmin'` (legacy) **and** `unicorn_role ===
'Super Admin'` (current standard), with an inline comment documenting why.
`useKpiAccess.tsx` only checks the legacy field.

**Verified live, not guessed**: the real SuperAdmin test account
(`carl@vivacity.com.au`) has `unicorn_role: 'Super Admin'` set but
`global_role: null` — the same "current standard, legacy field unset"
combination `useAuth.tsx`'s own comment describes. As a direct result, the
"Team KPI" toggle silently never appears for this account, blocking access to
the team-wide KPI dashboard for a real, currently-privileged SuperAdmin.

Found incidentally during batch 32's live verification (it blocked reaching
`KpiDrillDownSheet.tsx` to test the actual PR under review) — not fixed here
since `useKpiAccess.tsx` has zero `no-explicit-any` findings and is untouched
by that PR; a one-line fix (`profile?.global_role === 'SuperAdmin' ||
profile?.unicorn_role === 'Super Admin'`, matching `useAuth.tsx`'s existing
pattern) is available whenever someone picks it up.

## Manage Phases (`/manage-documents` → Manage Phases, `ManageStages.tsx`)

### 12. "New Phase" has never worked — a *third* independent occurrence of the same `stages.id` bug — FIXED
Same exact root cause as #2 and #3 above: `stages.id` has no DB
default/identity/sequence, so every insert must supply the next available
id explicitly. This is a *third*, separate, previously-undiscovered call
site — `ManageStages.tsx`'s own "New Phase" dialog (distinct from the
Stage Library dialog and Stage Detail duplicate-stage flow fixed under #2,
and from `useStageExportImport.tsx`'s Import Stage flow documented under
#3). Fixed the same way (compute `MAX(id)+1` before inserting, mirroring
`packages.createPackage`'s established pattern).

Found during batch 36 of the `no-explicit-any` retirement, the same way as
#1/#2: removing an `as any` cast on the insert forced TypeScript to check
the real `stages` Insert type, which surfaced `id` as required.

This is now the **third** independent place this exact bug has been
rediscovered by hand tonight. Reinforces #3's recommendation: add a real
default/sequence to `stages.id` (and audit `packages.id` too) so this class
of bug stops resurfacing every time someone touches a nearby insert.

**Verified live**: created a real test stage via the UI ("New Phase" →
"ZZTEST_batch36_verification"), got id 1149, no error toast. Cleaned up
both ways — deleted via the UI's own trash-icon delete, then confirmed via
direct SQL that no row with that name remains.

## Tenant Documents — Excel auto-generation legacy lookup (`TenantDocuments.tsx`)

### 15. Excel document generation's legacy-client lookup has always been undefined — DOCUMENTED, NOT FIXED
`TenantDocuments.tsx`'s `handleExcelGenerate` queries
`supabase.from("tenants").select("client_legacy_id")` before calling
`generateAndDownload({..., clientLegacyId: tenantData?.client_legacy_id})`.
`tenants` has **no `client_legacy_id` column at all** — that column only
exists on `excel_generated_files` and `generated_documents` (confirmed via
`grep` against generated types). The select's error is never checked, so
`tenantData` is always `null` and `clientLegacyId` has always been passed
as `undefined` to `useExcelGeneration`'s edge-function invocation.

Found during batch 41 of the `no-explicit-any` retirement (removing the
`as any` cast on the result forced a look at what `client_legacy_id`
actually was, which is when the missing column turned up).

**Impact is likely low but unconfirmed**: `clientLegacyId` is an optional
parameter (`clientLegacyId?: string`) passed through to the Excel
generation edge function — a legacy Unicorn1-system lookup shortcut that
has simply never fired. Whether the edge function has a working fallback
without it wasn't verified here. Not fixed because the correct source
column is unclear (`tenants.unicorn1_id` is a `number`, not the `string`
type `client_legacy_id` expects elsewhere — this needs someone who knows
the intended legacy-mapping path, not a type-only guess).

**Update (batch 57, 2026-09-05): a second independent occurrence found.**
`GeneratedDocumentsTab.tsx`'s `handleExcelGenerate` — a different component,
same feature area — has the exact same `supabase.from('tenants').select
('client_legacy_id')` call and the same unchecked-error/always-undefined
result. Same root cause, same fix status (documented, not fixed, pending a
product decision on the correct legacy-mapping source). The `any`-cast
removal preserved the existing (broken) behavior via an explicit narrow
cast, matching item 15's established pattern, rather than silently
patching it.

## Manage Stages — audit trail (`AdminManageStages.tsx`)

### 14. Stage archive/restore has never recorded an audit trail entry — DOCUMENTED, NOT FIXED (compliance-relevant)
`AdminManageStages.tsx`'s `toggleArchive` writes to `audit_events` after
every archive/restore action:
```ts
await supabase.from('audit_events').insert({
  entity: 'stage',
  entity_id: stage.id.toString(),
  action: newArchived ? 'stage.archived' : 'stage.restored',
  details: { stage_title: stage.title },
});
```
`audit_events.entity_id` is a **`uuid`** column, but `stages.id` is a plain
integer (this table predates the rest of the schema's UUID convention —
see items #2/#3/#12 in this doc for its other integer-PK quirks). Every
call sends a bare-integer string (e.g. `"11"`) into a `uuid` column, which
Postgres rejects outright: `22P02: invalid input syntax for type uuid`,
surfaced to the browser as an HTTP 400. Confirmed directly via SQL
(impersonating the real SuperAdmin test account's JWT claims) — the insert
fails with that exact error, independent of RLS (the `is_super_admin()`
check in the INSERT policy correctly recognizes this account; the failure
is purely the UUID type mismatch).

Net effect: **every stage archive/restore action has silently failed to
create an audit trail entry**, with zero indication to the user — the
insert's own error is never checked (fire-and-forget), and the
archive/restore action itself succeeds and shows a success toast
regardless. Found during batch 39's live verification (console showed two
400s on `audit_events` — one per archive, one per restore) while
confirming the archive/restore UI flow itself works correctly (which it
does).

**Why not fixed here**: `stage.id` has no UUID representation to give —
fixing this properly needs a decision (a new integer/text audit-events
variant column, a lookup table, or accepting that stage-entity audit
events use a different logging path) rather than a type-only patch.
Flagged to Carl given this is specifically an **audit-trail** gap on a
compliance platform, even though it doesn't block the underlying
archive/restore feature.

## KPI v2 — Developer ticket queue (`KpiMonthlySummaryCards.tsx`, `KpiDeveloperTicketQueue.tsx`)

### 13. Developer "Comms compliance" KPI metric has always shown as fully non-compliant — FIXED
`KpiMonthlySummaryCards.tsx`'s `DevSummary` computed a "Comms compliance"
metric by querying `kpi_ticket_comms` for `ticket_id,comm_key` — but that
column doesn't exist; the real column (confirmed against the table that
actually writes to it, `KpiDeveloperTicketQueue.tsx`, which correctly uses
`comm_type`) is `comm_type`. The failed select's error was never checked,
so `commRows` silently came back empty on every load, `byTicket` stayed
empty, and every ticket's required communications (`received_ack`,
`in_progress_notify`, etc.) always read as "not logged" — meaning this
metric has always shown close to 0% regardless of how diligently a
developer actually logged their communication touchpoints.

Found during batch 38 of the `no-explicit-any` retirement: typing the
query's result forced a check of the real `kpi_ticket_comms` columns,
which surfaced the mismatch immediately (the column plainly wasn't there).
Fixed by correcting the select/field references to `comm_type`, matching
the schema and the sibling file that writes this data.

## Academy admin — Enrolment Progress drawer (`EnrolmentProgressDrawer.tsx`)

### 16. Enrolment Progress drawer's Lessons section has never shown real lesson data — DOCUMENTED, NOT FIXED (backend function bug)
The drawer's Lessons section always renders "No lessons published in this
course" regardless of the course's actual content or the enrolment's real
progress (confirmed on a real enrolment showing "3/5 lessons complete" in
its own progress bar, while the Lessons section directly below it claimed
zero lessons). Network capture shows why: the RPC it calls,
`fn_academy_enrollment_lesson_detail`, returns a Postgres error on every
invocation — `42804: returned type uuid does not match expected type text
in column 9` — meaning the function body's actual `RETURN QUERY` doesn't
match its own declared `RETURNS TABLE` column types. This is a genuine
backend SQL function definition bug, not a frontend issue and not
introduced by tonight's `no-explicit-any` retirement (the frontend hook
consuming it, `useLessonDetail`, already silently returned `[]` on error
before and after batch 42's type-only changes).

Found during batch 42's live verification. Not fixed here — this needs
someone with write access to fix the function definition (correct column
9's type to match what's actually selected) via a proper migration, not a
frontend change.

## Tenant Documents — package-name lookup has no real FK (`TenantDocuments.tsx`)

### 17. Tenant Documents page has never loaded documents for any tenant with an assigned package — DOCUMENTED, NOT FIXED (missing FK, same root cause as #5/#8)
`TenantDocuments.tsx`'s document list embeds `packages:package_id(name)`
on the `documents` table — but **`documents.package_id` has no foreign key
to `packages` at all** (confirmed via `pg_constraint`: `documents` has
exactly two FKs, `created_by → auth.users` and
`current_published_version_id → document_versions`; nothing on
`package_id`). Every real request for a tenant that actually has an
assigned package 400s with "could not find a relationship" — reproduced
live for HPA Training Pty Ltd (tenant #6278), which has a real package and
a "Failed to load documents" toast on this exact page. Tenants checked
during batch 41's own verification (Demo RTO and others) all happened to
have zero packages/documents, so the query's `if (tenantPackageIds.length
> 0)` guard never fired and this failure mode went unnoticed there.

Same root cause and fix pattern as items #5 and #8 above (an embed
assuming a FK relationship that was never created) — a two-step fetch
(load documents, then separately fetch package names by id and merge
client-side) would work without a migration, or an actual FK could be
added. Not fixed here: this predates tonight's `no-explicit-any` work
entirely (the query string is unchanged from before batch 41's type-only
edit) and is a pre-existing production bug on a page most tenants happen
not to exercise, not something to silently patch as a side effect of a
type-retirement batch.

## Notification preferences (`useNotificationPrefs.ts`)

### 18. Saving notification preferences has never worked for tenant-scoped users — PARTIALLY FIXED (deeper bug found, needs a schema decision)
`updateMutation` called `update_user_notification_prefs` with five separate
`p_`-prefixed arguments (`p_email_enabled`, `p_inapp_enabled`,
`p_digest_enabled`, `p_quiet_hours`, `p_event_settings`) — but the real
function only accepts a single `p_prefs jsonb` argument (confirmed via
`select pg_get_function_identity_arguments(oid) from pg_proc where proname
= 'update_user_notification_prefs'` → `p_prefs jsonb`; confirmed via
`pg_get_functiondef` that the body reads
`COALESCE((p_prefs->>'email_enabled')::boolean, true)` etc. from that one
JSON argument). PostgREST has no overload matching the five-argument call
shape, so every attempt to toggle a notification category (Tasks, Meetings,
Obligations, Events) and save has always failed silently at the RPC layer —
the row was never written.

Found during batch 45 of the `no-explicit-any` retirement: typing the RPC's
`Args` against the generated Supabase types surfaced the shape mismatch
immediately. Fixed by wrapping the five fields into a single `p_prefs`
object matching the function's real signature.

**Live verification (2026-09-05) surfaced a second, pre-existing bug this
fix does not resolve.** Both `get_user_notification_prefs` and
`update_user_notification_prefs` resolve `tenant_id` via
`SELECT tenant_id FROM users WHERE user_uuid = auth.uid()`, then read/upsert
into `user_notification_prefs` keyed on `(user_id, tenant_id)` — but
`user_notification_prefs.tenant_id` is `NOT NULL`, and **72 of 626 rows in
`public.users` have `tenant_id IS NULL`** (confirmed via SQL) — these are
staff/internal accounts with no single-tenant assignment (SuperAdmin
included). For every one of those 72 accounts, both the read and the write
path fail outright: read 400s with `23502: null value in column "tenant_id"
of relation "user_notification_prefs" violates not-null constraint` (the
RPC's own "create default preferences if none exist" branch trips the
constraint), and write fails identically. This bug predates tonight's
change — the old five-argument call also failed, just earlier and for a
different reason (no matching function overload), which masked this one.
Confirmed via live Playwright test against the SuperAdmin persona (no
tenant selected): toggling a category produced a 400, no success toast, no
persistence across a refresh.

For real tenant-scoped users (the other 554), the argument-shape fix in
this PR is a genuine improvement — their calls now reach the function body
and should complete successfully. Not fixed here: the tenant_id NOT NULL
constraint needs a product/schema decision (allow NULL + adjust the
`(user_id, tenant_id)` conflict target, or give staff a dedicated
tenant-less path, or exclude the notification-prefs UI for tenant-less
accounts) before all 626 users can use this feature. Tracked as a backlog
item, not silently patched as a side effect of a type-retirement batch.

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
- **`useAuditPrep.ts`'s `useGenerateRequestFromQuestions`** — not a live bug
  (confirmed zero consumers anywhere in the codebase — dead code, never
  wired to any component), but worth noting it also had its own real bug
  baked in (ordered by a `display_order` column that doesn't exist on
  `compliance_template_questions`; the real column is `sort_order`), which
  would have thrown immediately if anyone had ever called it. Removed rather
  than fixed, since there's no live caller to verify against.

## Manage Stages — "Create Stage" dialog (`AddStageDialog.tsx`)

### 19. "Create Stage" via `AddStageDialog` has never worked — a *fourth* independent occurrence of the same `stages.id` bug — FIXED
Same exact root cause as items #2, #3, and #12 above: `stages.id` has no
DB default/identity/sequence (re-confirmed live via
`information_schema.columns` on 2026-09-05 — still `column_default: null,
is_identity: NO`), so every insert must supply the next available id
explicitly. This is a *fourth*, separate, previously-undiscovered call
site — `AddStageDialog.tsx`'s "Create Stage" flow, used from the
"Create Stage" button on `AdminManageStages.tsx` (distinct from the Stage
Library dialog fixed under #2, `useStageExportImport.tsx`'s Import Stage
flow documented under #3, and `ManageStages.tsx`'s own "New Phase" dialog
fixed under #12). Fixed the same way (compute `MAX(id)+1` before
inserting).

Found during batch 55 of the `no-explicit-any` retirement: removing the
`as any` casts on the insert forced TypeScript to check the real `stages`
Insert type, which surfaced `id` as required, exactly as it did for the
first three occurrences.

Now a *fourth* independent place this exact bug has been rediscovered by
hand — further reinforcing #3's original recommendation to add a real
default/sequence to `stages.id` (and audit `packages.id` too) so this class
of bug stops resurfacing every time someone touches a nearby insert.

## Processes — Audit Log tab (`useProcesses.tsx`, `ProcessDetail.tsx`)

### 20. Process Audit Log has never shown any entries — DOCUMENTED, NOT FIXED (wrong FK schema target)
The Audit Log tab on a process's detail page has always silently shown
"No audit entries available," even for processes with real history
(created/updated/approved/archived/submitted-for-review entries do get
written to `process_audit_log` by `useProcesses.tsx`'s own mutations —
the table isn't empty). The read query embeds the actor via
`actor:users!process_audit_log_actor_user_id_fkey(first_name, last_name,
email)`, asking PostgREST to resolve that FK hint against `public.users`.
Confirmed live via `pg_get_constraintdef`: the real constraint is
`FOREIGN KEY (actor_user_id) REFERENCES auth.users(id)`, not
`public.users` — so PostgREST can never satisfy the embed and returns a
`PGRST200` 400 every time. The UI catches the error and falls back to the
empty-state message instead of surfacing a failure, which is why this has
gone unnoticed.

Found during batch 72 of the `no-explicit-any` retirement's live
verification — the batch's own diff only changed the query's TypeScript
generics (fixing a masked TS2589 "excessively deep" error), not the query
shape, so this is confirmed pre-existing and unrelated to that change.

Not fixed here: the correct fix is either repointing the embed to
`auth.users` (schema/FK decision — `auth.users` isn't normally embeddable
the same way, may need a view or a manual second lookup by
`actor_user_id` against `public.users` instead, since the two tables'
UUIDs correlate 1:1 in this codebase's convention) or altering the FK
itself to target `public.users(user_uuid)` to match every other
actor/owner FK in this table family. Left for a schema-change session
per the standing guardrail, not patched inline during a type-only batch.

## Client Time tab (`ClientTimeTab.tsx` -> `EditTimeDialog.tsx`)

### 21. "Person" dropdown in Edit Time Entry silently shows staff only, never tenant contacts — DOCUMENTED, NOT FIXED (wrong column name)
Opening "Edit Time Entry" on an existing time entry populates the "Person"
selector's tenant-side half from a query that 400s every time:
`supabase.from('tenant_users').select('user_uuid, users:user_uuid(user_uuid,
first_name, last_name, avatar_url, disabled)')`. `tenant_users` has no
`user_uuid` column — the real column (confirmed via
`src/integrations/supabase/types.ts`'s generated `tenant_users` Row) is
`user_id`. Because the request fails, `tuData` stays undefined and
`tenantUsers` stays an empty array — the dropdown silently falls back to
Vivacity staff only, with no visible error to the user. The likely fix is
renaming both the selected column and the embed hint to `user_id` (i.e.
`user_id, users:user_id(user_uuid, first_name, last_name, avatar_url,
disabled)`), matching the same `user_id`-FK-to-`users` pattern already used
elsewhere in this codebase — but verify the actual FK name PostgREST expects
for the embed (`information_schema` / `pg_constraint`) before shipping, per
this repo's standing guardrail on FK-embed hints.

Found incidentally during batch 80 of the `no-explicit-any` retirement's
live verification — `EditTimeDialog.tsx` is not one of that batch's changed
files, so this is confirmed pre-existing and unrelated to that diff.

## Client notification surfaces

### 22. ClientRouteGuard updates BrowserRouter during render — DOCUMENTED, NOT FIXED

During the authenticated read-only notification smoke test (`/client/inbox?tab=notifications`), the browser logged React's warning that `ClientRouteGuard` updates `BrowserRouter` while a different component is rendering. The route still rendered and no data/write failure occurred, but this render-time navigation can cause unstable transitions or repeated renders. It is pre-existing and outside the Phase 2.5 notification typing diff; schedule a focused follow-up to move the redirect/state update into an effect or event boundary and verify client-route navigation.

## What this means practically

Nothing above was caused by tonight's work — every one of these bugs
pre-dated this session; the type-safety cleanup just surfaced them by
forcing the compiler (or a live click-through) to check assumptions that
had been hidden behind `any`. Seven real, previously-silently-broken
features got fixed and verified live tonight (item 9 is a staff-facing
admin page for viewing a client's package instance, not client-facing as
first assumed — see the correction in that item). Six more (items 3,
4, 5, 8, 10 above, plus the two `tenant_users`→`users` FK gaps outside
Package Builder) are confirmed real and written up with enough detail to
scope a fix, deliberately left alone because the correct fix is a
schema/migration decision, not a type-only code change.
