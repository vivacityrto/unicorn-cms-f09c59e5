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
>
> **Parent plan:** [Phase 2.6 Stabilization Plan](phase-2-6-stabilization-plan.md) · **Program index:** [Program Index](../../program-index.md)

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

### 3. "Import Stage" has never worked — FIXED (Phase 2.6 Packet P4-D, 2026-09-08)
Found **earlier tonight** (batch 8b, a few hours before #1/#2 above, in a
completely different file: `useStageExportImport.tsx`) — same exact root
cause. Already has a code comment: *"stages.id has no default/sequence...
every insert into `stages` requires an explicit id. This insert has always
failed with a NOT NULL violation — 'Import Stage' has never actually
created a stage."* **Fixed 2026-09-08:** added a `stages_id_seq` owned
sequence and `DEFAULT nextval(...)` to `stages.id`, matching the existing
`tenants.id` convention. A second, previously-undocumented occurrence of
this exact bug was found in `useStageDuplication.tsx`'s "Duplicate Stage"
flow while fixing this — same root cause, fixed by the same migration.
Neither insert needed a code change (both already omit `id`). See
`docs/audit-log/entries/2026-09-08-fix-stages-id-and-package-archive.md`.

### 4. "Archive Package" has always failed — FIXED (Phase 2.6 Packet P4-D, 2026-09-08)
`archivePackage()` sets `status: 'archived'`, but the database's
`packages_status_check` CHECK constraint only allowed `'active'`/`'inactive'`
— confirmed live (a real `23514` constraint violation on every Archive
click during tonight's testing). The Package Builder UI clearly intends
three distinct statuses (separate filter option, count badge, and "Draft"
vs "Archived" bucketing all exist in the list view). **Fixed 2026-09-08:**
widened `packages_status_check` to also allow `'archived'` via a migration;
no code change needed. See
`docs/audit-log/entries/2026-09-08-fix-stages-id-and-package-archive.md`.

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

### 10. Opening/closing meeting calendar invites have never actually been sent — FIXED
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

**Fixed 2026-09-08:** the real underlying problem was bigger than a missing
`calendar_id`/`provider_event_id` value — there was no *outbound* Outlook
calendar capability anywhere in the codebase at all. Every existing Graph
calendar call (`sync-outlook-calendar`'s sync, `generate-minutes-draft`/
`sync-meeting-artifacts`'s single-event fetches) was read-only, and the
requested OAuth scope was `Calendars.Read` only. Added real `create-event`/
`cancel-event` actions to `sync-outlook-calendar` (Graph `POST`/`DELETE
/me/events`, `Calendars.ReadWrite` scope), following the exact pattern
`send-email-graph` already uses for outbound `Mail.Send` calls. The local
`calendar_events` row is now inserted fully populated from the real Graph
response instead of as a placeholder beforehand, which is what fixes the
original `NOT NULL` constraint failure — neither value exists until Outlook
has actually created the event. Never blocks scheduling/cancelling itself on
a Graph failure (not connected, insufficient scope, etc.) — surfaces a
visible "reconnect Outlook" notice instead of the old silent no-op. Live
Playwright verification was deliberately skipped per Carl's explicit
direction (avoiding real calendar-data creation on a live Outlook mailbox);
13 existing connections will need to reconnect to pick up the new write
scope. Full detail:
`docs/audit-log/entries/2026-09-08-add-outbound-outlook-calendar-invites.md`.

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

### 15. Excel document generation's legacy-client lookup has always been undefined — FIXED
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

**Fixed 2026-09-08:** the "correct source column is unclear" framing above
was resolved by checking the live schema rather than guessing.
`tenants.unicorn1_id` was a red herring — a different id space entirely
(the old Unicorn1 system's own row number, not a foreign key into this
table). The real answer: `clients_legacy.tenant_id` is a `bigint` FK
straight to `tenants.id`, fully populated and 1:1 across all 11
`clients_legacy` rows. Replaced `GeneratedDocumentsTab.tsx`'s broken
`tenants.select('client_legacy_id')` query with `clients_legacy.select
('id').eq('tenant_id', tenantId).maybeSingle()`. `TenantDocuments.tsx`
(this item's original file) no longer needed the fix — it was
independently retired as dead code in an earlier PR (`479972a21`). Full
detail: `docs/audit-log/entries/2026-09-08-fix-excel-generation-legacy-client-lookup.md`.

**Update (Phase 2.6 Packet P4-B/P6-B, 2026-09-07):** `TenantDocuments.tsx`
was retired as unreachable dead code (see item #17) — its copy of this bug
no longer exists. `GeneratedDocumentsTab.tsx`'s copy is the real, live
instance and remains open, unfixed, pending the same product decision on
the correct legacy-mapping source.

## Manage Stages — audit trail (`AdminManageStages.tsx`)

### 14. Stage archive/restore has never recorded an audit trail entry — FIXED (compliance-relevant)
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

**Fixed 2026-09-08:** investigating before fixing found the original framing
above was wrong on both counts. First, scope: the identical bug existed in
**~15 call sites across 10 files**, not just this one — `useStageReplacement.tsx`,
`useStageExportImport.tsx`, `StageBuilder.tsx`, `useStageDependencies.tsx`,
`useStageTemplateContent.tsx`, `StageDocumentsPanel.tsx`,
`StageFrameworkSelector.tsx`, `useStageDuplication.tsx`, `useStageStandards.tsx`,
and one leftover in `AdminStageDetail.tsx`. Second, no schema decision was
actually needed: `AdminStageDetail.tsx`'s other 4 audit calls and
`useStageTemplateContent.tsx`'s own `logStageTemplateAudit()` helper already
used the correct pattern (`entity_id: crypto.randomUUID()`, real numeric id
kept in `details.stage_id`) — exactly what the stage detail page's own audit
reader (`useStageAuditLog.tsx`) already expected. Applied that same pattern
to every remaining broken call site, and fixed `useStageAnalytics.tsx`
(which read `entity_id` back as if it held the real stage id) to read
`details.stage_id` instead. `package_builder_audit_log`/`client_audit_log`
were checked live via `information_schema` and confirmed to have a genuinely
`text` entity_id column — their integer-string writes were correct and left
untouched. Full detail: `docs/audit-log/entries/2026-09-08-fix-stage-audit-entity-id-mismatch.md`.

**Confirmed systemic, not isolated (2026-09-08, live verification of P4-D
#3's fix).** The identical `audit_events.entity_id` uuid-vs-integer
mismatch also breaks the audit-log write for Duplicate Stage and Import
Stage — both actions succeed, but silently fail to write their audit
row, same failure mode as archive/restore. This is every stage-mutating
action that tries to write an `audit_events` row, not an isolated
archive/restore quirk — useful evidence for whichever fix this item
eventually gets. See
`docs/audit-log/entries/2026-09-08-fix-stages-id-and-package-archive.md`.

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

### 16. Enrolment Progress drawer's Lessons section has never shown real lesson data — FIXED (Phase 2.6 Packet P4-D, 2026-09-08)
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

**Fixed 2026-09-08.** Confirmed via `information_schema` that `video_id`
was the only mismatched column (the other 15 already matched their
source columns exactly). Dropped and recreated the function with
`video_id` corrected from `text` to `uuid`, re-granting the same three
roles' `EXECUTE` privilege. Verified live: extracted the function's own
`RETURN QUERY` SELECT and ran it directly against a real enrolment
(`academy_enrollments.id = 1`) — returned real lesson rows with correctly
typed `video_id` UUIDs, no error. No frontend change needed — `useLessonDetail`
already consumed the RPC generically. See
`docs/audit-log/entries/2026-09-08-fix-academy-lesson-detail-video-id-type.md`.

## Tenant Documents — package-name lookup has no real FK (`TenantDocuments.tsx`)

### 17. Tenant Documents page has never loaded documents for any tenant with an assigned package — RESOLVED VIA RETIREMENT (2026-09-07)
`TenantDocuments.tsx`'s document list embedded `packages:package_id(name)`
on the `documents` table — but **`documents.package_id` has no foreign key
to `packages` at all** (confirmed via `pg_constraint`: `documents` has
exactly two FKs, `created_by → auth.users` and
`current_published_version_id → document_versions`; nothing on
`package_id`). Every real request for a tenant that actually has an
assigned package 400d with "could not find a relationship" — reproduced
live for HPA Training Pty Ltd (tenant #6278), which has a real package and
a "Failed to load documents" toast on this exact page. Tenants checked
during batch 41's own verification (Demo RTO and others) all happened to
have zero packages/documents, so the query's `if (tenantPackageIds.length
> 0)` guard never fired and this failure mode went unnoticed there.

**Update (Phase 2.6 Packet P4-B/P6-B, 2026-09-07):** root-caused as dead
code, matching item #27's precedent — `TenantDocuments.tsx` (route
`/tenant/:tenantId/documents`), `TenantDocumentsHub.tsx`
(`/tenant/:tenantId/documents-hub`), `TenantDocumentDetail.tsx`, and
`TenantDocumentDetailWrapper.tsx` (`/tenant/:tenantId/document/:documentId`)
had **zero real navigation entry points anywhere in the app** — no
`navigate()`/`Link to=` call site referenced any of these three routes,
and neither file had been touched by any of this repo's typing/fix batches
except ancient Lovable auto-commits. The real, live "Documents" tab is
`ClientDetail.tsx`'s embedded `DocumentsHub.tsx` (route
`/tenant/:tenantId?tab=documents`), whose `GeneratedDocumentsTab.tsx`
already carries the identical two-step-fetch fix for this exact
`packages:package_id` no-FK bug, applied independently in an earlier,
unrelated-sounding commit. Rather than duplicate that fix onto dead code,
all 4 files and their 3 routes were retired, replaced with
`<Navigate replace>` redirects to the real Documents tab (matching the
existing `LegacyAuditTabRedirect`/`/admin/governance-documents` precedent
for retired routes with possible stray bookmarks/external links). Verified
live: all 3 old routes redirect correctly with zero console errors, and
the real Documents tab (including its Generated sub-tab, exercising the
already-fixed two-step fetch) loads correctly. No separate fix to
`TenantDocuments.tsx` was made or is needed.

## Notification preferences (`useNotificationPrefs.ts`)

### 18. Saving notification preferences has never worked for tenant-scoped users — FIXED
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

**Fixed 2026-09-08.** Investigated the 72 tenant-less rows further before
choosing an option: confirmed live they're not a homogeneous "staff"
population — ~61 are genuine internal Vivacity staff, 4 are real external
client-domain users who appear genuinely orphaned from any tenant (not
merely mislinked), and 6 are test/dev noise. Carl deferred the
tenant-*assignment* question (who among the 72 should actually be tied to
a real tenant, e.g. the internal "Vivacity Coaching & Consulting" tenant)
to the architectural redesign/RBAC v6 plan rather than deciding it here —
parked in `docs/kb/reference/tenant-operating-model-data-architecture-plan-2026-09-02.md`
§18 item 14 and `docs/kb/reference/rbac-v6-authorization-implementation-plan-2026-09-01.md`
§13 item 15 — and then authorized the originally-scoped fix: allow
`NULL tenant_id` (option 1 of the three), independent of who eventually
gets assigned to a real tenant. Made `tenant_id` nullable, added a partial
unique index so a second NULL-tenant save updates rather than duplicates,
and fixed both RPCs' `tenant_id = v_tenant_id` comparisons (never `TRUE`
for `NULL`) to `IS NOT DISTINCT FROM`, plus branched the upsert's
`ON CONFLICT` target on whether the user has a tenant. Verified live by
impersonating a real tenant-less account's JWT in a rolled-back
transaction — read and two sequential writes all behaved correctly, no
duplicate row. No frontend change needed. Full detail:
`docs/audit-log/entries/2026-09-08-allow-tenant-less-notification-prefs.md`.

## Also found this session, outside Package Builder (for completeness)

These were found and either fixed or documented in earlier batches tonight,
on unrelated features:

- **`AddTimeDialog.tsx` note-creation** — was writing the acting user's ID
  into the wrong (legacy numeric) column instead of the required
  `created_by` field. **FIXED.** The same insert also referenced two
  columns that don't exist at all (`client_id`, `package_instance_id`) —
  every insert through this path had always 400'd with an unknown-column
  error. **FIXED (Phase 2.6 Packet P4-C, 2026-09-07):** replaced with the
  real `parent_type`/`parent_id`/`package_id` shape, matching the same
  package-instance-vs-tenant convention `useNotes.tsx`'s `createNote` and
  `ClientStructuredNotesTab.tsx` already use elsewhere (`parent_type:
  'package_instance', parent_id: <instance id>` when a package is selected,
  else `parent_type: 'tenant', parent_id: <tenant id>`) — not a guess, an
  existing established mapping this code path had simply never followed.
  Verified live end-to-end on Demo RTO: logged a real time entry with
  "Link a note" → "+ New note", saved successfully with zero console
  errors, confirmed via SQL the resulting row had
  `parent_type='package_instance'`, the correct `parent_id`/`package_id`,
  and a correct `timeentry_id` link — then deleted both test rows.
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
  "Person"/"Notify" field, because the query selected a nonexistent
  `tenant_users.user_uuid` column (real column: `user_id`) — see item 21
  above for the full writeup. **FIXED (Phase 2.6 Packet P4-C).**
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

### 20. Process Audit Log has never shown any entries — FIXED (Phase 2.6 Packet P4-C, 2026-09-07)
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

**Fixed (Phase 2.6 Packet P4-C, 2026-09-07):** `useProcesses.tsx`'s
`useProcessAuditLog` now does a two-step fetch instead of the impossible
embed — query `process_audit_log` for the raw rows, separately batch-query
`public.users` by `user_uuid` for the distinct `actor_user_id`s, and merge
client-side. `public.users.user_uuid` is kept in sync with `auth.users.id`
by the `link_auth_user_to_profile` trigger (confirmed via
`pg_get_functiondef`), so it's the correct join key — no schema change
needed, matching the same pattern already used by `useStageAuditLog.tsx`
for an identical actor-resolution problem elsewhere in the codebase.
Verified live: a real process with 10 audit entries
(`6f10a988-eebb-4a6b-95e0-025edaed9842`) now shows every entry's real
actor name instead of the empty state, zero console errors.

## Client Time tab (`ClientTimeTab.tsx` -> `EditTimeDialog.tsx`)

### 21. "Person" dropdown in Edit Time Entry silently shows staff only, never tenant contacts — FIXED (Phase 2.6 Packet P4-C, 2026-09-07)
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

**Fixed (Phase 2.6 Packet P4-C, 2026-09-07):** replaced the broken embed
with a two-step fetch (`tenant_users.select('user_id')`, then batch-query
`users` by `user_uuid`) in both `EditTimeDialog.tsx` and `AddTimeDialog.tsx`
(same broken query duplicated verbatim in both files, feeding
`EditTimeDialog`'s "Person" selector and both dialogs' "Notify" selector).
A second bug was found alongside it while fixing this: even with the query
fixed, `EditTimeDialog.tsx`'s "Person" `<Select>` only ever rendered the
`vivacityStaff` state (Vivacity staff only) — the merged
staff-plus-tenant-contacts list (`teamMembers`) was computed but never
wired into that dropdown's JSX, only into the separate "Notify" selector.
Fixed by pointing the Person select at `teamMembers` instead, and removed
the now-fully-unused `vivacityStaff` state (`setVivacityStaff` was its only
other reference). Verified live on Demo RTO (tenant 7547, 7 real tenant
contacts): both the Person dropdown (Edit Time Entry) and the Notify
dropdown (Add Time Entry) now list every tenant contact
(James Okafor, John dorer, Daniel Evans, Carl Academy, Ghost User3,
K_Account Test) alongside staff, zero console errors.

## Client notification surfaces

### 22. ClientRouteGuard updates BrowserRouter during render — DOCUMENTED, NOT FIXED

During the authenticated read-only notification smoke test (`/client/inbox?tab=notifications`), the browser logged React's warning that `ClientRouteGuard` updates `BrowserRouter` while a different component is rendering. The route still rendered and no data/write failure occurred, but this render-time navigation can cause unstable transitions or repeated renders. It is pre-existing and outside the Phase 2.5 notification typing diff; schedule a focused follow-up to move the redirect/state update into an effect or event boundary and verify client-route navigation.

**Truth-sync note (2026-09-07, Phase 2.6 stabilization plan Packet P0-C):**
this is the same root cause as [#24](#24-client-files-navigation-emits-a-react-setstate-during-render-warning--documented-not-fixed)
— both are `src/components/client/ClientRouteGuard.tsx:23` updating
`BrowserRouter` during render, surfaced on two different routes. Fix once
(Packet P4-A) and it resolves both entries; do not treat them as two
separate bugs or duplicate the fix effort.

## Bulk communications

### 23. Bulk Message dialog lacks a Radix DialogTitle — ALREADY FIXED (verified 2026-09-07)

Opening the protected `/communications` Bulk Message dialog during Phase 2.5 verification consistently emits Radix's accessibility error that `DialogContent` requires a `DialogTitle` (and a companion missing-description warning). The dialog is usable and no data writes were triggered, but screen-reader semantics are incomplete. This predates the typing-only change in `BulkMessageDialog.tsx`; fix by wiring the existing visible title through the dialog primitive (or adding a visually-hidden title/description), then re-run the authenticated communications smoke test.

**Verification (2026-09-07, Phase 2.6 stabilization plan Packet P4-A):**
re-checked `src/components/communications/BulkMessageDialog.tsx` at
`origin/main@75d02f9` — it already renders `AppModalTitle` (which wraps
Radix's `DialogPrimitive.Title`, confirmed in `src/components/ui/app-modal.tsx`)
inside `AppModalHeader`, and its confirmation `AlertDialog` already has an
`AlertDialogTitle`. No code change was needed here; some earlier PR between
this entry being written and now already fixed it without updating this
register. Not independently reproduced live this session for this dialog specifically.
A separate DialogTitle console error was observed this session while
verifying an unrelated Phase 2.6 packet (P1-A), triggered by opening
`NewEnrolmentModal` (`src/components/academy/admin/NewEnrolmentModal.tsx`,
which does render an `AppModalTitle`) — the actual source wasn't isolated
(no stack trace accompanied that specific console message) and is left as
an unfiled, not-yet-root-caused observation rather than guessed at here.

## What this means practically

## Client Files route

### 24. Client Files navigation emits a React setState-during-render warning — DOCUMENTED, NOT FIXED

During the Phase 2.5 authenticated SharePoint cohort smoke test, `/client/files` loaded and remained usable, but Vite captured a React warning: `BrowserRouter` was updated while `ClientRouteGuard` was rendering. The stack points to `src/components/client/ClientRouteGuard.tsx:23` and occurs while the client layout resolves tenant access. No page error, failed route, or data write occurred, and the warning predates this typing-only cohort. Track separately as a client-route lifecycle fix; do not conflate it with the SharePoint boundary changes.

**Truth-sync note (2026-09-07, Phase 2.6 stabilization plan Packet P0-C):**
this is the same root cause as [#22](#22-clientrouteguard-updates-browserrouter-during-render--documented-not-fixed),
not a second bug — see that entry. Fix once (Packet P4-A) for both.

### 25. Meeting recurrence Edge function has no recognizable caller authorization gate — FIXED (2026-09-07, Phase 2.6 Packet P3-A item 3)

Fresh Phase 2.5 reachability review confirmed `generate-meeting-recurrence` is invoked by `useEosMeetingRecurrences` and inserts recurrence/occurrence rows using the caller's bearer token, but the function had no explicit `auth.getUser`/permission helper or other recognizable gate. Live schema review confirmed the RLS policies on `eos_meeting_recurrences`/`eos_meeting_occurrences` (`WITH CHECK (is_super_admin() OR (tenant_id = get_current_user_tenant() AND (is_eos_admin(...) OR can_facilitate_eos(...))))`) were genuinely enforcing per-tenant facilitator/admin authorization all along — this was a missing defense-in-depth application-layer gate, not an open write path. Fixed by adding an explicit `requireCaller(req, FeatureKeys.staffMeetings)` check before any DB access (rejects non-staff callers early instead of letting them hit an opaque RLS denial) and a server-side check that the caller-supplied `tenant_id` actually matches the referenced `meeting_id`'s real tenant (RLS's `WITH CHECK` only verifies the caller is authorized *for* the supplied `tenant_id`, not that `meeting_id` genuinely belongs to it — a mismatched pair would previously still pass RLS and write rows cross-referencing the wrong tenant). The existing RLS-backed forwarded-JWT client was deliberately kept unchanged for the actual writes (no switch to a service-role client), so the finer-grained facilitator/eos-admin authorization boundary is unchanged, not loosened or broadened. Added `auth-gate.test.mjs`. Live-verified against production using the SuperAdmin persona (correction: this feature is Vivacity-staff-only, `/eos/*` — Demo RTO's client persona has no access to it; this entry originally said Demo RTO in error).

## Main staff dashboard (`/triage-dashboard`)

### 26. Attention Ranking / Priority Inbox / Labour Efficiency sections are down in production — FIXED (Phase 2.6 Packet P3-A item 2, 2026-09-08)

Preserved from PR #612 (opened 2026-09-04, closed without merge 2026-09-07 per
the Phase 2.6 stabilization plan's Packet P0-B — this entry is the retained
evidence). While live-verifying batch 23's type-safety change to
`useDashboardTriage.ts`, the verification agent found that four of its
backend queries are **currently returning HTTP 500** against production,
reproduced identically across two full page reloads:

- `v_dashboard_attention_ranked` (feeds the attention-ranked tenant list, top
  5, full portfolio, and low-attention list — all render empty)
- `v_dashboard_priority_inbox`
- `v_dashboard_behavioural_prompts`
- `v_dashboard_labour_efficiency`

Response body: `{"code":"57014","message":"canceling statement due to
statement timeout"}`. The UI degrades gracefully (empty tables/fallback
content, no crash), which is likely why this hasn't been noticed as an
outage — it just looks like "no data" rather than an error.

**Confirmed not caused by batch 23's work**: `git diff` showed that PR's
changes to `useDashboardTriage.ts` were purely type-level (removing `as any`
casts, adding proper generated types) — the actual query text sent to
PostgREST was byte-for-byte unchanged.

**Investigated at the time**: the `authenticated` Postgres role has an
8-second `statement_timeout` (`anon` has 3s). Running the
`v_dashboard_attention_ranked` query directly as `postgres` (which bypasses
RLS) completed in ~267ms — not slow at all. `tenants` (the view's base
table) has RLS policies that call `is_super_admin_safe()` /
`app.user_can_access_tenant()` per row. This strongly suggests the real
query, executed through PostgREST as the authenticated role with RLS
policies actually active, produces a much worse query plan than the one a
superuser sees — a common RLS performance cliff — but a definitive
same-session repro as a real authenticated user wasn't achieved (a simulated
JWT via `request.jwt.claims` didn't reproduce the SuperAdmin's row access,
so it can't be confirmed as fully diagnosed).

**Not fixed here** — needs reproduction with a real authenticated Playwright
session's network tab plus `pg_stat_statements`/`auto_explain` on the live
role, and a design decision on the fix (RLS policy rewrite, materializing the
view, or a covering index). Track as a distinct dashboard reliability bug,
linked to Client Health H0.0 containment
(`docs/kb/reference/client-health-activity-analytics-plan-2026-09-03.md`) —
both surface the same underlying stage-health signal, so H0.0's "unavailable"
containment messaging should also cover these four views until the timeout
is resolved. This is an active production issue on the primary staff
dashboard, not a backlog item; see Phase 2.6 stabilization plan Packet P3-A
item 2 for the containment/fix packet.

**Fixed 2026-09-08.** The prediction above was exactly right, and
`pg_stat_statements`/`EXPLAIN (ANALYZE, BUFFERS)` against the real
authenticated-role query shape confirmed it precisely: not an RLS
performance cliff (the actual filter columns — `assigned_consultant_user_id`,
`tenants.status` — already had indexes and were pushed down correctly),
but 97% of query time (1100ms of 1129ms) spent in a per-tenant `DISTINCT
ON` scan of `stage_health_snapshots` inside `v_dashboard_tenant_portfolio`
(the shared base view for all four affected views), computing
`worst_stage_health_status` from the exact same known-defective data H0.0
already flagged. A second, independent instance was found and fixed in
`v_dashboard_priority_inbox`'s own "stage_health" inbox-item branch.
Carl authorized extending H0.0 containment to both views — output is now
a fixed `'unavailable'` stub instead of a real (but untrustworthy)
computation. `EXPLAIN` confirmed 1129.6ms → 13.9ms (~81x). See
`docs/audit-log/entries/2026-09-08-dashboard-timeout-h00-containment.md`
for full detail, including a disclosed side effect (the dashboard's
"low attention"/"Critical stages" logic, which required `=== 'healthy'`/
`=== 'critical'`, now correctly never matches instead of trusting stale
data).

**P3-A follow-up (2026-09-08):** after that containment, `MainDashboard.tsx`
still issued a redundant assigned-client health read and the aggregate
`rpc_portfolio_client_health()` call even though the panel rendered the
explicit unavailable state. Those reads are now removed; the database RPC is
retained until a separate schema/RBAC dependency review. The remaining Ask
Viv and Compliance Assistant attention consumers are documented as
operational-attention inputs, not Client Health evidence, in
`docs/kb/reference/codebase-optimization/phase-3/p3-a-client-health-consumer-characterization.md`.

### 27. `PackageDetail.tsx` Manager-field lookup 406 — RESOLVED VIA RETIREMENT (2026-09-07)

`/admin/package/:id/tenant/:tenantId`'s "Manager" field looked up
`public.users` by `manager_id` using `.single()` (not `.maybeSingle()`); a
stale or orphaned `manager_id` reference threw a `406`
(`PGRST116`), silently leaving the field blank instead of surfacing an
error. `docs/kb/codebase-state/internal-staff-audit-2026-07-29.md` flagged
this exact error class on this exact route on 2026-07-29 and never chased
it down. Root-caused during the Phase 2.6 stabilization plan's Packet P6-A
investigation (see
`docs/kb/reference/dead-code-feature-consolidation-investigation-2026-09-04.md`
§7ter) and resolved by retiring the whole page rather than patching it in
place — the page was found to be effectively unreachable (one unlabeled
icon button) and every one of its features was either disconnected from
the real data model or a strictly less-capable duplicate of a live,
actively-used equivalent elsewhere. No separate fix was made or is needed.

### 28. `bulk-send-invitations` per-tenant validation errors crash instead of returning a structured response — DOCUMENTED, NOT FIXED (found 2026-09-07)

Found during Phase 2.6 stabilization Packet P5-A's Edge Function typing
pass (PR #967), while typing `bulk-send-invitations/index.ts` — not caused
by the typing change itself, pre-existing. Three call sites
(`tenant_ids must be an array of numbers` at ~line 98, tenant-access-check
failure at ~line 106, and cross-tenant `FORBIDDEN` at ~line 113) call the
file's own `jsonResponse(req, status, body)` helper as `jsonResponse(422,
{...})` / `jsonResponse(500, {...})` / `jsonResponse(403, {...})` — omitting
the required `req` first argument. This shifts every argument one position:
`status` receives the body object, `body` is `undefined`, and `req` is a
plain number. `jsonResponse` spreads `corsHeaders(req)` into the response
headers, so `corsHeaders(422)` runs against a number instead of a `Request`
— whatever that helper does with `req.headers`/`req.method` internally will
throw, turning what should be a structured 422/500/403 JSON error response
into an unhandled exception (a bare 500 with no diagnostic body) for exactly
the three validation paths meant to explain *why* the batch was rejected.
Not caught by `npm run typecheck`: `supabase/functions/**` isn't included in
either `tsconfig.app.json` or `tsconfig.node.json`, so this arity/argument-
order mismatch never gets compiler-checked. Deliberately not fixed in PR
#967 — it's a behavioral change, out of scope for a lint/typing-only
packet — left for a small, separate follow-up fix (add the missing `req`
argument to all three call sites) plus its own PR.

### 29. `tga-rto-import`'s `handleImport`/`handleStatus` reference an out-of-scope `req` — DOCUMENTED, NOT FIXED (found 2026-09-07)

`supabase/functions/tga-rto-import/index.ts`'s `handleImport(supabase, userId,
body, correlationId)` and `handleStatus(supabase, correlationId)` both call
`jsonResponse(req, {...})` internally on every return path, but neither
function receives `req` as a parameter — `req` only exists in the outer
`serve(async (req) => {...})` closure. Every real invocation of the
`action=import` or default/status path throws `ReferenceError: req is not
defined` at the `jsonResponse(req, ...)` call, so the function cannot
successfully return a response on any code path through either handler. The
same `jsonResponse(req, ...)`-without-`req`-in-scope shape as item 28 above
(`bulk-send-invitations`), found independently the same day in a different
function while verifying a manual Edge Function deploy, not via typing work.
Confirmed pre-existing (not introduced by this session) via
`git log --oneline -5 -- supabase/functions/tga-rto-import/index.ts` — the
last substantive edit was PR #303 (`fix(security): replace wildcard CORS
with an APP_BASE_URL allowlist`), long before Phase 2.6. Found while
byte-for-byte-verifying a manual deploy of this function during P5-A's Edge
Function auto-deploy recovery (see `docs/kb/reference/execution-efficiency-
log.md`'s 2026-09-07 entry and this repo's `AGENTS.md` → "Supabase
deployment workflow") — the manual deploy shipped the file exactly as it
exists on `origin/main` (pre-existing bug included, not a transcription
error), so **tga-rto-import is currently non-functional on both actions**
until this is fixed. Not fixed here — out of scope for a deploy-recovery
task; needs `req` threaded into both function signatures as a parameter and
both call sites updated. Worth fixing together with item 28 given the
identical bug shape, but tracked separately since they're different files.

### 33. "Import from Unicorn 1"'s legacy-mapping backfill has never worked — DOCUMENTED, NOT FIXED (found 2026-09-08)

Found during Phase 2.6 stabilization Packet P5-A item 3 (replacing
`InviteUserDialog.tsx`'s reviewed `unicorn1` cross-schema `as any` exception
with a bounded typed adapter, PR for
`hotfix/p5a-invite-user-unicorn1-adapter`) while live-verifying the new
adapter against production. After a real "Import from Unicorn 1" flow
succeeds (the new `public.users`/`tenant_users`/`tenant_members` rows are
created via `invite-user`'s `skip_email` path), the dialog's final step —
`(supabase as any).schema('unicorn1').from('users').update({
mapped_user_uuid }).eq('ID', legacyId)` — fails at the PostgREST layer with
`"The schema must be one of the following: public, graphql_public"`. This
project's PostgREST config only ever exposed the `public` schema, so a
direct `.schema('unicorn1')` call from the browser (anon/authenticated key)
can never succeed, regardless of typing or RLS grants. Confirmed
independently of typing by exercising the exact call live (not just reading
the code): a legacy record's `mapped_user_uuid` stayed `NULL` after a
successful import.

`search-unicorn1-users/index.ts` already documents the correct workaround
for the identical constraint — a `SECURITY DEFINER` RPC (`search_unicorn1_
users`) instead of a direct schema-qualified PostgREST call — but no
equivalent write-side RPC exists for setting `mapped_user_uuid`. Because the
original code never checked this call's error, the failure has been fully
silent since the import flow was built: every import "succeeds" (the user
account is created) but the legacy record is never actually marked mapped,
so it can be found and re-imported again later.

Not fixed here — building the missing RPC is a real schema/migration change
(new `SECURITY DEFINER` function, its own audit-log entry, grant review),
out of scope for a lint/typing packet. The P5-A adapter now at least logs
this failure to the console instead of swallowing it silently, and its own
code comment records this gap. Given Unicorn 1 (and this import flow with
it) is expected to be retired rather than actively developed, building the
RPC is likely not worth the investment — recommend leaving this documented
rather than scheduling a fix, unless Unicorn 1's retirement timeline slips
significantly.

### 34. Tenant "Close" has always failed for every tenant — FIXED (2026-09-09, found while live-verifying Packet P2-QA's `qa:data-lifecycle` suite)

Found while live-verifying the new `qa:data-lifecycle` suite's real HTTP-level
test of `tenant-lifecycle`'s `close` action (not a static-analysis or typing
find — a real live call against `unicorn-qa` returned `500 Internal Server
Error`, and the same query was then confirmed broken in **production** too).
`executeCloseTransaction`'s Step 1 queried `stage_instances` with a PostgREST
embed — `.select("id, status, packageinstance_id, package_instances!inner(tenant_id)")`
— to scope open stages to the closing tenant. `stage_instances.packageinstance_id`
is a real `bigint` column, but confirmed via `pg_constraint` that **no foreign
key constraint exists between `stage_instances` and `package_instances`, in
production or `unicorn-qa`** (`stage_instances`'s only FK is
`linked_audit_id → client_audits`). PostgREST cannot resolve an embed without
a matching FK, so this query fails with `PGRST200` unconditionally — not
depending on whether the tenant has any open stages, meaning **every real
"Close" action call has failed with a 500 since this code was written**,
regardless of environment. Step 2 (cancelling open tasks) used the identical
broken pattern one level deeper
(`client_task_instances.select("...", "stage_instances!inner(packageinstance_id, package_instances!inner(tenant_id))")`).

This is the same root cause `ClientAuditsTab.tsx` already independently
discovered and worked around (see its own code comment, from
`hotfix: fix Client Detail package/stage bugs found in Playwright audit`) —
`tenant-lifecycle` was simply never updated to match. Fixed the same way:
resolve the tenant's `package_instances` ids with a plain query first, then
filter `stage_instances`/`client_task_instances` by those ids directly
instead of relying on an embed the schema doesn't support. No behavior
change to the actual close semantics — same open-stage/open-task scoping,
same "closed"/`3` status transitions, same audit log — only the query
mechanism changed. Verified: existing `response-context.test.mjs` and
`suspend-close-superadmin.test.mjs` (unaffected, don't reference this query
shape) plus the full `test:edge` suite (279/279) still pass; the new
`qa:data-lifecycle` suite's live run is the actual regression-proof for the
real fixed behavior (table/column names cited above confirmed directly via
`pg_constraint`/`information_schema.columns` against production, not
assumed).

A second, separate, non-blocking issue surfaced in the same investigation:
`runCloseSafetyChecks`'s unresolved-risk-flags check queries
`public.compliance_risk_flags`, which **does not exist in production
either** (`to_regclass` returns `null`) — confirmed pre-existing, not
introduced by this fix. Because the code only logs and continues on this
specific query's error (it's a warning-only check, not a blocking one), this
has never caused a visible failure — it just means the "N unresolved
compliance risk flag(s) exist" warning has never actually been able to
surface. **Not fixed here** — the correct fix needs a product decision on
what this table should actually contain (a genuine `compliance_risk_flags`
feature was apparently planned but never built), which is out of scope for
this fix. Documented as a known gap; revisit if/when the compliance-risk-flag
feature is actually built.

## Carl-reported regressions (2026-09-07) — DOCUMENTED, NOT INVESTIGATED

Reported directly by Carl, not surfaced by this session's typing work.
No root cause, affected file, or reproduction has been confirmed yet — added
here as a todo queue for triage under a future packet (most likely fits
alongside P4-B/C's "invalid relationship reads"/"identity and lookup"
framing once each is root-caused), not as verified L10 entries in the same
sense as items 1–28 above.

### 29. Editing or deleting package stage tasks no longer works

On a package's stage, staff and client task IDs are reportedly mangled, so
clicking Delete or saving an edit on any of those tasks fails silently or
errors — an admin cleaning up a package stage can't remove or change tasks
at all.

### 30. RTO scope end dates can go missing

On a client's training.gov.au scope lists (qualifications, units, skill
sets, courses, training packages), the end/expiry date reportedly now
ignores the stored date column and only reads it from the raw sync
snapshot — so staff checking when a qualification comes off scope can see
a blank or stale date and mis-advise the client.

### 31. Client portal admins can remove their own login by mistake

The "Swap to Contact" action in the client portal's Users page is
reportedly offered on the signed-in admin's own row, so a client admin can
convert themselves into a contact and instantly lose their own Unicorn
login and seat — the equivalent staff-side screen deliberately hides this
action for the signed-in user's own account.

### 32. Past meeting summaries no longer show cascade messages

"One Phrase Close" reportedly replaced the old cascade messages in meeting
summaries, but summaries recorded before the change still hold cascade
text that is now hidden — so someone opening an older meeting summary
sees that section vanish and loses the key messages recorded at that
meeting.

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
