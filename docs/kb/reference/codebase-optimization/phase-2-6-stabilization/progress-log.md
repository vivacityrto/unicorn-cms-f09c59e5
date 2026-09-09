# Phase 2.6 Stabilization — Progress Log

> Chronological execution history for [the Phase 2.6 Stabilization plan](phase-2-6-stabilization-plan.md). Extracted from the plan itself on 2026-09-08 to keep the plan current-state-only.

## Progress log

**2026-09-09, session 42 — P7 RBAC/Tenant decision evidence packet (prep only, no implementation):**
Consolidated the RBAC v6 §13 and Tenant Operating Model §18 decision matrices,
current observed CSC/Super Admin/messaging/membership behavior (source-cited,
one live-DB corroboration attempt blocked by the auto-mode classifier), and
sequencing recommendations for Packets P7-B/C/D into one doc:
[`p7-rbac-tenant-decision-evidence.md`](../phase-3/p7-rbac-tenant-decision-evidence.md).
Confirmed P6-A is already closed, so the sole remaining P7-B/C/D blocker is
the RBAC vocabulary decision (narrowly, RBAC §13 items 1-3/7) plus, for P7-D
only, a not-yet-written disabled-user hotfix. No decisions were made; no
code, schema, or production data changed.

**2026-09-09, session 42 (concurrent session) — P7-B lifecycle boundary prepared (evidence only):**
From a fresh `origin/main` worktree, traced the admin lifecycle hook and all
consumers. `useLifecycleChecklists.ts` has three production importers (the
admin page plus type-only grid/dialog imports); its `LifecycleInstance` export
has no production consumer. Staff onboarding hub, self-onboarding, and the
`generate-staff-checklist` Edge Function use separate instance contracts and
were deliberately kept outside the candidate boundary. Added the Phase 3
packet `p7-b-lifecycle-feature-boundary.md`, recommending only a feature-local
type/query seam if it measurably reduces coupling after the RBAC vocabulary
gate is approved. The display grid and dialog are already callback-driven and
form the feature's display-only core; no cross-feature shared display core was
found. No code, route guard, authorization, schema/RLS/grant, Edge contract,
or production data changed.

**2026-09-09, session 41 — CSC authenticated route baseline gathered:**
Confirmed the QA account in the hosted `public.users` read path as active,
`unicorn_role = CSC`, and tenant-unbound (`tenant_id` null); no production
data was changed. Using the ignored `playwright/.auth/csc.json` state, a
read-only browser sweep against the local Vite frontend visited
`/admin/lifecycle-checklists`, `/admin/sharepoint-sites`, `/dashboard`,
`/manage-tenants`, `/manage-documents`, `/manage-stages`, `/communications`,
`/superadmin/academy/enrollments`, and `/eos`. The lifecycle-admin and
SharePoint-sites routes redirected to `/dashboard`, confirming the current
Super Admin-only boundary. Dashboard, work surfaces, EOS, and Academy
enrolments rendered for CSC; the shell identified the session as CSC with no
tenant selected. The sweep clicked no mutation controls and recorded no page
errors, failed requests, or HTTP responses at or above 400 in the final run.
The results characterize current access only; they do not change RBAC or
advance the Phase 3 implementation gate.

**2026-09-09, session 40 — authenticated read-only browser baseline confirmed:**
Using the existing ignored `playwright/.auth/superadmin.json` storage state,
ran a targeted Playwright visit to `/admin/lifecycle-checklists` against the
local Vite frontend (which uses the hosted Supabase project). The final run
stayed on the lifecycle route, rendered the main page heading, Add Step
control, and lifecycle tab, and captured no page errors. No Add, Edit, Copy,
Deactivate, or submit control was clicked; no data was written. The first
cold-run attempt exposed only a temporary test-selector/cold-transform issue;
the corrected targeted run passed in 30.6 seconds. This supplies the live
Super Admin browser evidence for the current baseline. CSC browser evidence
remains intentionally unrun because no CSC storage state is available; the
route-level denial remains characterized by source and existing guard tests.
The Phase 2.6 plan remains unchanged: this is still preparatory P7-A evidence,
not a policy or implementation change.

**2026-09-09, session 39 — live read-only lifecycle baseline confirmed:**
Queried the hosted Supabase project through the read-only SQL path (no
insert/update/delete, seed, migration, or production-data operation). The
deployed state matches the source characterization: all four lifecycle types
are active and ordered (`client_onboarding`, `client_offboarding`,
`staff_onboarding`, `staff_offboarding`); `lifecycle_checklist_templates`
exposes the expected 13 columns; `dd_lifecycle_type` has an authenticated
read policy; and template management is governed by
`is_vivacity_staff((select auth.uid()))`. This confirms the route-vs-database
boundary distinction against the live project rather than relying only on
migration text. No changes to the Phase 2.6 plan are warranted: P7 remains
preparatory characterization, with implementation still gated by the RBAC
vocabulary decision and the separate disabled-user hotfix for P7-D.

**2026-09-09, session 38 — P7-A preparatory characterization for lifecycle
checklist templates (no Phase 3 implementation or policy change):** After
confirming the approved pilot boundary (the existing
`/admin/lifecycle-checklists` template-administration surface only), inspected
`LifecycleChecklistsAdmin.tsx`, `useLifecycleChecklists.ts`,
`LifecycleTemplateGrid.tsx`, `LifecycleTemplateDialog.tsx`,
`dashboardRoutes.tsx`, the generated Supabase types, and the lifecycle-table
migrations. The evidence map records four seeded lifecycle types
(`client_onboarding`, `client_offboarding`, `staff_onboarding`,
`staff_offboarding`), direct browser reads/writes to the template table,
soft-deactivation via `is_active = false`, and a route-level
`requireSuperAdmin` guard. The current database policy is separately
characterized as `is_vivacity_staff`, so the UI Super Admin boundary and the
database staff boundary are not silently treated as equivalent; CSC remains a
route-forbidden persona for this pilot. `dd_lifecycle_type` is a process-type
lookup, not the tenant lifecycle-status table, and its text codes are not a
foreign-key constrained relationship from templates.

Added `src/test/admin/lifecycle-checklists.test.tsx` with 13 focused
characterization tests covering loading, empty, populated, inactive, tab
switching, view/copy/edit/deactivate/external-link interactions, add/edit form
hydration and submission, current query-error behavior (no dedicated error
panel), route placement under `requireSuperAdmin`, and the distinct broader
database policy. The focused suite passes. The run reproduces existing Radix
dialog accessibility warnings; these are recorded as baseline findings and
were not changed. No extraction, schema/RLS/grant change, production-data
operation, or Operations/tenant-transition change was made. The Phase 2.6
plan remains unchanged because this is preparatory evidence only and the P7
implementation gate (RBAC vocabulary decision and the separate disabled-user
hotfix for P7-D) remains open.
**2026-09-09, session 39 — `qa:migrations`' dynamic-replay half demonstrated,
closing out all 8 P2-QA suites (docs-only, `docs/qa-migrations-dynamic-replay`):**
after the previous session's `qa:e2e` closeout, Carl asked "whats next" --
the only remaining gap was `qa:migrations`' dynamic-replay half, which had
been sitting idle for lack of an actual migration to test against. Checked
`origin/main` and found Codex had just merged one in parallel:
`ed2106afb` ("retire remaining M4 forecast health crons",
`supabase/migrations/20260908080000_retire_forecast_health_crons.sql`) --
a real, already-reviewed migration, deliberately written to be a safe
no-op when `pg_cron` is absent (exactly `unicorn-qa`'s state).

Replayed it onto `unicorn-qa` via `apply_migration`: applied cleanly, its
own guard executed the early-return branch (no `pg_cron` → `RAISE NOTICE`,
`RETURN`), and a post-check of `qa_cron_safety_status()` still reported
zero jobs. The ledger recorded it as version `20260909003606` (the replay
timestamp) with name `20260908080000_retire_forecast_health_crons`
preserved -- checking the existing ledger entries confirmed every prior
row uses a `qa_baseline_*`/`qa_seed_*`-style name, never a real migration
filename, which is expected: `unicorn-qa`'s ledger is a controlled
baseline-replay ledger, not a copy of production's migration history (see
"Current environment state" above). This ruled out the design I'd
initially considered -- an automated Vitest suite asserting every repo
migration's filename appears in the ledger -- since that would assert an
invariant the environment was never meant to hold.

Concluded the dynamic-replay half is better closed as a demonstrated,
reviewed action plus existing regression coverage than as a new bespoke
test: this migration's actual guarantee (unicorn-qa stays schedule-free)
is already an ongoing assertion in `qa:cron-safety` (session 36) -- a
future replay that left a job scheduled would fail that suite already.
Writing a second, narrower test asserting the same thing about one
specific migration would be redundant test theater, not real additional
coverage.

**P2-QA layered coverage programme status: all 8 suites now
addressed** -- `qa:rls`, `qa:contract`, `qa:edge`, `qa:data-lifecycle`,
`qa:residue`, `qa:cron-safety`, `qa:e2e` live-proven; `qa:migrations`
static half live in CI, dynamic half demonstrated. Verified
`node scripts/check-kb-links.mjs` before this docs-only PR.

**2026-09-09, session 38 — `qa:e2e`'s first target written and live-proven:
Super Admin + client persona smoke checks against unicorn-qa (branches
`feat/qa-seed-e2e-personas` PR #1047, `fix/qa-seed-e2e-tenant-users`
PR #1048, `feat/qa-e2e-suite`; local run, 4/4 passing):** Carl chose
`qa:e2e` over `qa:migrations` (the other remaining suite) via
AskUserQuestion, since it's a bounded setup task rather than needing a
real migration to replay against.

Chose "seed persistent QA personas" (also via AskUserQuestion) over
reusing the existing production e2e harness or per-run ephemeral
fixtures, since `unicorn-qa` is documented as data-less and real
authenticated route checks need something to actually render. Wrote
`scripts/qa-seed-e2e-personas.mjs` (idempotent: a persistent
`qa-e2e-demo-tenant` + Super Admin + client persona, using the
`@example.qa` domain and `qa-e2e` naming specifically so `qa:residue`'s
sweep never flags them) and `.github/workflows/qa-seed-e2e-personas.yml`
(workflow_dispatch only). Set two new `unicorn-qa` environment secrets
(`QA_E2E_SUPERADMIN_PASSWORD`/`QA_E2E_CLIENT_PASSWORD`, random values
generated locally, never displayed) via `gh secret set`.

**Real discovery, not anticipated when the AskUserQuestion was framed:**
`src/integrations/supabase/client.ts` is a Lovable-generated file that
hardcodes the target project's URL and anon key as literal strings --
it does **not** read `import.meta.env.VITE_SUPABASE_URL` at runtime, so
there is no env-var or `--mode` flag that redirects the frontend to a
different backend. Flagged this back to Carl via AskUserQuestion before
proceeding, since it changes the operation from "seed some data" to
"temporarily patch a generated production-credentials file" -- approved
proceeding with a strict protocol: edit the two literals in this isolated
worktree only, run the suite, then `git checkout --` the file back to its
committed (production) content before anything is ever committed or
pushed. Never done on the shared checkout; `client.ts`'s diff was
confirmed byte-identical to origin/main before any commit.

Wrote `e2e/qa/superadmin.spec.ts` and `e2e/qa/client.spec.ts` (data-independent
smoke checks mirrored from the existing production `e2e/personas/*.spec.ts`,
deliberately dropping the legacy-redirect tests since those are pure
code-path assertions already covered by production's own suite) and a
fully separate `playwright.qa.config.ts` (own `testDir`, storage-state
paths, webServer -- never merged into the always-production
`playwright.config.ts`, so a QA run can never be accidentally pointed at
the wrong project). Added `npm run e2e:qa`.

**Two more real, live-discovered gaps, found by actually running the
suite rather than assuming the fixture was sufficient:**
1. The client persona initially got only a `tenant_members` row and hit
   the app's own (correct) "Academy access only" fallback --
   `ClientTenantContext.tsx` actually gates `canAccessClientPortal` on
   `tenant_users.relationship_role`/`access_scope`, a separate table.
   Fixed in `fix/qa-seed-e2e-tenant-users` (PR #1048): added a
   `tenant_users` row (`relationship_role: "user"`, `access_scope: "full"`).
2. That fix's first live attempt failed differently: `dd_relationship_role`
   (the FK target for `tenant_users.relationship_role`) had **zero rows**
   in `unicorn-qa` -- populated all four values from
   `src/lib/roles/relationshipRole.ts`'s `RelationshipRole` type
   (`primary_contact`, `secondary_contact`, `user`, `academy_user`) via
   `execute_sql`, the same class of QA-baseline reference-table gap as the
   earlier `dd_unicorn_roles` fix. Also added an `Admin` row to
   `dd_unicorn_roles` while investigating (not ultimately needed for this
   persona, kept as a harmless QA-only parity repair for a future
   SuperAdmin-tier persona).

Also discovered (not a bug): re-running the seed script resets the two
personas' passwords every time by design, which silently invalidated a
previously-generated storage-state's session (Supabase revokes other
sessions on password change) -- regenerating storage states *after* the
last seed run, not before, is now the documented order.

One more finding, self-resolved: the Super Admin dashboard spec initially
timed out waiting for the "Welcome back" heading even though the page had
genuinely rendered correctly (confirmed via a temporary diagnostic spec
logging every Supabase network call -- all ~50 calls on a cold `/dashboard`
hit returned 200 or a harmless caught 0-row `PGRST116`, no real errors).
The QA dashboard simply fires more sequential round-trips than
production's warmer/cached state, so the existing 15s assertion timeout
(copied from `playwright.config.ts`) was sometimes too tight; bumped to
25s in `playwright.qa.config.ts` specifically, with the reasoning recorded
in a comment rather than silently copied.

**Live-proof status:** local run (not CI-gated) via `npm run e2e:qa`,
4/4 passing. Unlike every other P2-QA suite, this one cannot run in
GitHub Actions as designed -- it requires the exact same temporary
`client.ts` edit described above, which must never happen on a shared
branch or in CI (a CI run would need its own separate mechanism, not
attempted here). This matches production's own `e2e:personas`/`e2e:unauth`
precedent, which has also never been CI-gated in this repo.

Verified locally: lint, typecheck (330/43 skipped -- unchanged, `e2e/**`
isn't in Vitest's scope), build, KB links (0 broken, 792 links),
`client.ts` confirmed byte-identical to `origin/main` before every commit.

**2026-09-09, session 37 — `qa:residue`'s first target written and
live-proven: independent fixture-leftover sweep (`feat/qa-residue`,
PR #1045; live-proof workflow run `34292052765`, 5/5 passing):** Continuing the same-session P2-QA sweep. Read
`qa-environment-and-coverage-strategy.md`'s existing note that `qa:residue`
was "partially covered by `qa:rls`'s own residue assertions" — verified by
reading `isolation.test.tsx` directly: it has fail-closed cleanup
(`cleanupFixtures`/`throwCleanupFailures`, delete-error aware) but no
standalone assertion that independently re-queries the database afterward.
The "post-run query found zero run-scoped rows" claim recorded for P1-C's
live proof was a one-time manual check via Supabase MCP, not an automated
test — a real gap between what was claimed live-proven and what a suite
itself asserts on every run.

Wrote `src/test/qa/residue.test.ts`: 5 tests, using a fresh service-role
client (a separate code path from each fixture suite's own cleanup, so a
bug in one suite's delete logic can't hide behind its own cleanup step
reporting success). Anchors on two conventions already shared by every
fixture-producing suite (confirmed by reading both `isolation.test.tsx` and
`data-lifecycle-tenant.test.ts` rather than assuming): every fixture
persona uses the `@example.test` email domain, and every RUN_ID starts
with `vitest` (`vitest-<uuid>`, `vitest-dl-<uuid>`), which then shows up in
every fixture tenant's slug, conversation subject, and message body. Checks
`public.users` and `auth.users` (via paginated `admin.listUsers`) for any
`@example.test` email, and `tenants`/`tenant_conversations`/
`tenant_messages` for any row matching `%vitest%`.  Documented, not
silently assumed: true orphan detection for `tenant_members`/
`conversation_participants`/`audit_events`/`client_audit_log` isn't checked
directly in this first version, only transitively through their parent
rows being clean.
`.github/workflows/qa-residue.yml` follows the established shape (its own
`unicorn-qa-p2-residue` concurrency group).

Verified locally: lint, typecheck, `test:frontend` (330/43 skipped, up from
330/38), build, KB links (0 broken, 792 links). PR #1045 merged; dispatched
`qa-residue.yml` against `main` post-merge (workflow run
[`34292052765`](https://github.com/vivacityrto/unicorn-cms-f09c59e5/actions/runs/34292052765)),
all 5 tests passed against the live `unicorn-qa` project in 4.15s — the
first automated confirmation (rather than a one-time manual check) that
`unicorn-qa` is genuinely clean of every fixture suite's leftover data.

**2026-09-09, session 36 — `qa:cron-safety`'s first target written and
live-proven: `unicorn-qa` remains schedule-free (`feat/qa-cron-safety`,
PR #1043; live-proof workflow run `34291546797`, 2/2 passing):** Continuing the same-session sweep through remaining P2-QA
suites. `qa:cron-safety`'s contract ("QA remains schedule-free unless
explicitly enabled") can't be tested through a normal PostgREST call — the
`cron` schema isn't exposed to PostgREST, and confirmed via `execute_sql`
against `unicorn-qa` that the `pg_cron` extension isn't even installed
there (consistent with the original baseline observation in
`qa-baseline-cutover-2026-09-07.md`). Added a minimal, read-only
`public.qa_cron_safety_status()` RPC directly to `unicorn-qa` (via
`apply_migration` against project `qfpxvumcrnzrjyvqkicq` only) that checks
`pg_extension` first and only queries `cron.job` if the extension is
actually installed, returning `(pg_cron_installed, cron_job_count,
cron_job_names)`. `EXECUTE` granted to `service_role` only, revoked from
`anon`/`authenticated`/`public` — confirmed via
`information_schema.routine_privileges` (only `postgres` and `service_role`
listed) and empirically with the QA project's public anon key: PostgREST
returned `401`/`42501` ("permission denied for function
qa_cron_safety_status"). This is deliberately QA-only tooling: not added to
`supabase/migrations/**` (it has no purpose in production, which
legitimately runs `pg_cron` jobs) and not in the generated `types.ts`, so
`src/test/qa/cron-safety.test.ts` calls it via raw `fetch` against the PostgREST
RPC endpoint, matching `edge-tenant-lifecycle.test.ts`'s untyped-call
pattern rather than the typed `supabase-js` client used by
`qa:data-lifecycle`. Two tests: the RPC reports zero registered jobs, and
an anon caller is denied with `42501`.
`.github/workflows/qa-cron-safety.yml` follows the established shape (its
own `unicorn-qa-p2-cron-safety` concurrency group).

Verified locally: lint, typecheck, `test:frontend` (330/38 skipped, up from
330/36), build, KB links (0 broken, 792 links). PR #1043 merged; dispatched
`qa-cron-safety.yml` against `main` post-merge (workflow run
[`34291546797`](https://github.com/vivacityrto/unicorn-cms-f09c59e5/actions/runs/34291546797)),
both tests passed against the live `unicorn-qa` project in 2.99s.

**2026-09-09, session 35 — `qa:edge`'s first target written and live-proven:
tenant-lifecycle (`feat/qa-edge-tenant-lifecycle`, PR #1041; live-proof
workflow run `34290824352`, 6/6 passing):** Carl asked to
dedicate the session to finishing the remaining P2-QA suites in parallel
with Codex's separate work on Phase 3 prerequisites. Picked `qa:edge` next
since its blocking prerequisite (an Edge Function actually deployed to
`unicorn-qa`) was already satisfied by `tenant-lifecycle`'s deployment for
`qa:data-lifecycle` — no new deployment decision needed.

Wrote `src/test/qa/edge-tenant-lifecycle.test.ts` (6 tests): unauthenticated
call gets a clean 401 (not a stack trace), malformed bearer token gets 401,
non-POST method gets 405 before any auth check, CORS preflight echoes
`Access-Control-Allow-Origin` only for an allowlisted origin and never a
wildcard, a non-allowlisted origin gets no CORS header at all, and a
malformed-JSON body still gets a structured JSON error response. Unlike
every other P2-QA suite so far, none of these tests write data or need
service-role privileges — kept the same secret-gating pattern anyway for a
consistent "only runs in the protected environment" story.
`.github/workflows/qa-edge.yml` follows the established shape (its own
`unicorn-qa-p2-edge` concurrency group).

Verified locally: lint (0 errors), typecheck, `test:frontend` (330/36
skipped, up from 330/30 — this suite's own 6 tests correctly skip without a
service-role key), build, KB links. PR #1041 merged; dispatched
`qa-edge.yml` against `main` post-merge (workflow run
[`34290824352`](https://github.com/vivacityrto/unicorn-cms-f09c59e5/actions/runs/34290824352)),
all 6 tests passed against the live `unicorn-qa` `tenant-lifecycle`
deployment in 3.41s.

**2026-09-09, session 34 — real production bug found and fixed while
live-verifying `qa:data-lifecycle` (`hotfix/tenant-lifecycle-close-fk-bug`;
`docs/audit-log/entries/2026-09-09-tenant-lifecycle-close-fk-bug.md`,
`l10-real-bugs-found.md` item 34):** dispatching session 32's suite for
real against `unicorn-qa` first hit a reference-data gap (`dd_unicorn_roles`
had no `'Super Admin'` row — this table was deliberately hand-seeded for
P1-C's own two persona roles only; added a third row, confirmed as
sensible/non-critical and auto-approved). Re-dispatching then surfaced a
second, unrelated finding that was **not** a QA-environment gap: 6 of 11
tests failed starting at the `close` action itself (`500`), cascading
through everything downstream. Confirmed via `pg_constraint` against
**production** (not just QA): `stage_instances` has no foreign key to
`package_instances` at all, in either environment — so
`executeCloseTransaction`'s PostgREST embed
(`package_instances!inner(tenant_id)`) has failed with `PGRST200`
unconditionally since this code was written. **Every real "Close" action
call has been broken in production**, not just in the QA mirror. Carl
confirmed fixing it now (not deferring) given severity.

Fixed by resolving the tenant's `package_instances` ids with a plain query
first, then filtering `stage_instances`/`client_task_instances` by those
ids directly — the exact same workaround `ClientAuditsTab.tsx` already
independently discovered and applied for the identical root cause (its own
code comment references the earlier `hotfix: fix Client Detail
package/stage bugs found in Playwright audit`); `tenant-lifecycle` was
simply never updated to match. No behavior change to close semantics, only
the query mechanism. A second, separate, non-blocking issue was found in
the same investigation and left documented rather than fixed:
`compliance_risk_flags` (queried by the close safety check) doesn't exist
in production either — silently degrades today since that check only logs
and continues on error, so nothing crashes, but the "unresolved risk flags"
warning has never actually been able to fire. Needs a product decision on
what that table should contain before it's worth building.

Verified: existing `response-context.test.mjs` and
`suspend-close-superadmin.test.mjs` (don't reference the changed query
shape, unaffected) plus the full `test:edge` suite (279/279) still pass.
Redeployed the fixed function to `unicorn-qa` (version 2) and re-dispatched
`qa-data-lifecycle.yml`: **all 11/11 tests passed** (workflow run
`34289646607`), including the real close-with-audit-log-verification test
that previously 500'd — genuine regression proof, not just "the request
succeeded." `qa:data-lifecycle`'s first target is now fully live-proven.
PR opened for the production-side fix, following the standard "merge is a
live production deployment" protocol from `AGENTS.md` → "Supabase
deployment workflow" (auto-deploy-on-merge is unreliable — post-merge
version check required before treating this as actually live in
production).

**2026-09-09, session 33 — PostgREST error-message regression audit and fix
(`codex/fix-recurrence-errors-kb-size`):** reviewed the recent Edge Function
typing edits for the same `catch (unknown)` narrowing failure found in
`generate-meeting-recurrence`. Three additional confirmed cases were found:
`add-missing-packages`, `send-action-item-due-reminders`, and
`sync-clickup-time` can throw plain Supabase result errors, so an
`instanceof Error`-only fallback would discard their `.message`. Added the
shared `_shared/error-message.ts` structural guard and focused Node coverage
for native `Error`, message-bearing PostgREST objects, and safe fallbacks;
updated all four affected functions and the existing add-packages static test.
The audit found no equivalent regression in the other reviewed recent Edge
edits: they either wrap query errors in `new Error`, read `.message`
structurally, or do not expose a caught error message. No schema, RLS,
migration, deployment, or production-data change was made.

Architecture metrics were rerun: the shared helper and focused test add two
tracked Edge files and 45 physical lines (1,698→1,700 files;
478,546→478,591 lines); no frontend or schema footprint changed.
**2026-09-09, session 32 — `qa:data-lifecycle`'s first target written: tenant
lifecycle (`feat/qa-data-lifecycle-tenant`; live-proof pending):** Carl chose
tenant lifecycle (suspend/close/archive/reactivate via `tenant-lifecycle`)
over package builder, invitations, EOS meeting recurrences, and
documents/versions (the last explicitly flagged as needing its own
bounded-state-machine design first, per the master plan's P4.6). Real
invariants worth protecting: SuperAdmin gating on suspend/close/archive (a
previously-fixed security gap — `AGENTS.md`'s own guardrail note on
`tenant-lifecycle` originally leaving suspend/close on the broader
`staff.internal` gate), no-duplicate-close, reason-required validation on
close/reactivate, the 30-day archive cooldown + `force_override`, and
reactivate-from-archived's own separate SuperAdmin gate.

This is P2-QA's first suite calling a real Edge Function rather than
reading tables/OpenAPI directly. Confirmed `unicorn-qa` had **zero** Edge
Functions deployed (`list_edge_functions` returned `{"functions":[]}`) —
deploying one there was a new category of action, so it was paused for
explicit approval before proceeding. Deployed `tenant-lifecycle` + its full
`_shared/*` dependency closure (`auth-helpers.ts`, `supabase-client.ts`,
`response-helpers.ts`, `cors.ts`, `requireCaller.ts`,
`requireCaller-helpers.ts`) via `deploy_edge_function` against project
`qfpxvumcrnzrjyvqkicq`. One real deploy-bundler quirk found and fixed:
uploaded files are bundled under one flat root together with `index.ts`
(unlike the real repo, where `_shared/` sits one directory *above* each
function) — so the deploy-only copy of `index.ts` uses `./_shared/...`
imports instead of the source repo's `../_shared/...`. Confirmed live with
an unauthenticated smoke call: clean `401 UNAUTHORIZED` from the
`requireCaller` gate, proving the bundle and runtime both work.

Wrote `src/test/qa/data-lifecycle-tenant.test.ts` (11 tests) following the
same persona-creation pattern as `isolation.test.tsx`'s `makePersona`
(`auth.admin.createUser` + `users` upsert + `signInWithPassword` for a real
access token) and `.github/workflows/qa-data-lifecycle.yml` (its own
`unicorn-qa-p2-data-lifecycle` concurrency group). Verified locally: lint
(0 errors), lint:ratchet (new file, 0 errors), typecheck (0 errors),
`test:frontend` (330 passed/30 skipped, up from 330/19 — the suite's own
11 tests all correctly skip without a service-role key), `test:edge`
(276/276), build, KB links (0 broken).

**NOT yet verified:** the live run against `unicorn-qa`'s real data — same
honest gap as `qa:contract` before its own live proof. Next step: dispatch
`qa-data-lifecycle.yml`, review the result, and record it here.

**2026-09-08, session 31 — `qa:migrations`'s static-safety half was
already built, just undocumented (`docs/qa-migrations-coverage-correction`):**
before starting on the next unbuilt P2-QA suite, checked whether existing
tooling already covered any of the remaining candidates first.
`scripts/audit-migrations.mjs` — already CI-wired via
`.github/workflows/migration-safety.yml` on every PR/push touching
migrations, diff-scoped (`--changed-only`) — already detects exactly
`qa:migrations`'s stated contract: production URLs, `cron.schedule`/
`unschedule`, `net.http_*` calls, destructive DML, and hidden-backfill
tags. Confirmed its own test suite passes (6/6,
`node --test scripts/audit-migrations.test.mjs`). The coverage-model table
called this "Not started"; corrected to reflect reality rather than
duplicate already-working, already-proven tooling. Honestly scoped what's
genuinely still missing: actually replaying an approved migration onto
`unicorn-qa` and confirming a clean apply remains a manual/reviewed process
(the doc's own "explicit QA sync" step), not an automated test — that part
of the contract is still open. Docs-only change, no code.

**2026-09-08, session 30 — `qa:contract` live-proven, RPC check promoted
from soft to hard (`chore/qa-contract-diagnostic`):** with `qa-contract.yml`
now on `main` (session 29's PR merged) and its `unicorn-qa` environment
confirmed to have no protection rules, ran the real workflow via
`gh workflow run` (workflow run `34238305046`). All 4 tests passed,
including the two meaningful hard assertions (no table/column drift between
generated types.ts and the live `unicorn-qa` schema) — genuine proof, not
just "the request succeeded."

The soft RPC-argument check surfaced 447 identical-shaped findings
("exists but no matching entry in definitions") — every single generated
function, not a mix of pass/fail, which is the signature of a parsing-shape
bug rather than 447 real drifts. Added a one-off diagnostic test
(`chore/qa-contract-diagnostic`, dispatched directly against the branch
ref — confirmed `workflow_dispatch` works against any ref once the workflow
file exists on `main`, no merge needed to iterate) and confirmed via its raw
payload (workflow run `34238555502`): `definitions[functionName]` is
table-only; an RPC's actual argument shape lives at
`paths['/rpc/<name>'].post.parameters[].schema` (a body-parameter object
schema with `properties` per arg and a `required` array). Rewrote
`extractRpcArgs` to the confirmed-correct shape, removed the diagnostic
test, and promoted the RPC check from soft/warn-only to a real hard
assertion (arg-name match plus required/optional-drift comparison).
Re-dispatched (workflow run `34238835701`): all 4 tests passed clean,
confirming no RPC argument drift either. `qa:contract` is now fully
live-proven, not just locally unit-tested. Full local verification chain
also re-confirmed green after the fix: lint (0 errors, 44 warnings),
typecheck, `test:frontend` (330/19 skipped), `test:edge` (276/276), build.

**2026-09-08, session 29 — P2-QA's first suite, `qa:contract`, written
(`feat/qa-contract-suite`; not yet live-proven):** built the first suite
beyond `qa:rls` in the layered-QA coverage programme
(`qa-environment-and-coverage-strategy.md`). Design decision made during
scoping: PostgREST's own built-in OpenAPI introspection endpoint
(`GET /rest/v1/`, confirmed `service_role`-only — the public anon key gets
`"Only the service_role API key can be used for this endpoint"`) supplies
everything needed with **zero new migration or RPC** — reusing the exact
same `QA_SUPABASE_SERVICE_ROLE_KEY` secret `qa:rls` already has.

New files: `src/test/qa/parse-generated-types.ts` (TypeScript-compiler-API
parser for `src/integrations/supabase/types.ts`'s `Database["public"]`
literal — same `typescript` package `scripts/generate-route-manifest.mjs`
already uses, chosen over regex since the generated file's formatting isn't
a stable contract), `src/test/qa/qa-suite-guard.ts` (a small, independent
"must target QA not production" guard — deliberately *not* a shared import
from `src/test/tenant/rls-suite-guard.ts`, to keep zero risk to the
already-proven P1-C harness for the sake of a few dozen shared lines),
`src/test/qa/contract.test.ts` (the suite itself), and
`.github/workflows/qa-contract.yml` (workflow_dispatch/nightly-schedule
only, `environment: unicorn-qa`, its own `unicorn-qa-p2-contract`
concurrency group distinct from P1-C's).

**Verified by this session:** the parser, both against a hand-written
fixture and against the real 73k-line generated file (found >50 tables and
>50 functions; exact-matched the known `tenants` table and
`check_permission` function shapes) — `parse-generated-types.test.ts`, 3/3
passing. The guard module — `qa-suite-guard.test.ts`, 4/4 passing, mirrors
`rls-suite-guard.test.ts`'s own test shapes. `contract.test.ts` itself
correctly `describe.skipIf`s to 0-run when no service-role key is present
locally (same as `qa:rls`), confirmed via a live local `vitest run`.

**NOT verified by this session, honestly disclosed rather than assumed
correct:** the live PostgREST-OpenAPI fetch/diff has never actually run
against `unicorn-qa` — that requires the QA-only service-role key, a
protected GitHub Environment secret unavailable outside CI. Table/column
existence checks are hard assertions; the RPC argument-shape comparison is
deliberately a soft, warn-only check for v1, since the exact OpenAPI
payload shape for RPC parameter definitions couldn't be confirmed without a
live run. **Next step is for Carl (or a CI run) to trigger
`qa-contract.yml` once** — the same process P1-C's own first live proof
followed — then tighten the soft RPC check once that output is reviewed.
Full local verification chain green: lint (0 errors), lint:ratchet,
typecheck, `test:frontend` (330 passed/19 skipped, up from 323/15 —
+7 new passing, +4 newly-skipped from `contract.test.ts`), `test:edge`
(276/276), build.

**2026-09-08, session 28 — last deliberate lint exception retired,
`generate-meeting-recurrence` typing (`hotfix/generate-meeting-recurrence-typing`):**
Packet P3-A item 3 deferred this file's `catch (error: any)` cleanup until
its auth gate shipped with negative tests — both landed in PR #979
(`l10-real-bugs-found.md` item 25). With that condition satisfied, fixed the
one remaining `@typescript-eslint/no-explicit-any` finding: `catch (error: any)`
→ `catch (error)` with `error instanceof Error ? error.message : 'Unknown
error'`, matching the established pattern used throughout
`supabase/functions/**` (verified via grep — dozens of functions already use
this exact shape). Pure type-narrowing, no behavior change; skipped live
Playwright verification per this plan's own rule for changes that can't
alter emitted JS (this is the textbook example the rule names). Full repo
`npm run lint` now reports **0 errors** — the entire Phase 2.5/2.6
`no-explicit-any` retirement program (begun at ~4,100 errors) is complete
with zero known residual exceptions. Full verification chain green:
lint (0 errors, 44 warnings), lint:ratchet, typecheck, `test:frontend`
(323/15 skipped), `test:edge` (276/276), build.

**2026-09-08, session 27 — SeatCard display-core "prerequisite" resolved as
dead-code retirement, not an extraction (`hotfix/retire-dead-seatcard-cluster`):**
before starting the documented prerequisite (building independent
authenticated drag/drop Playwright coverage for `SeatCard`/`DraggableSeatCard`),
a fresh reachability trace of the actual live consumer chain
(`/eos/accountability` → `EosAccountabilityChart.tsx` → `ChartBuilder` →
`OrgChartView`/`EosChartGrid`) found neither rendered view references
`SeatCard`, `FunctionColumn`, `DraggableSeatCard`, or
`DraggableFunctionColumn` at all — seats are rendered by a separate,
independent `EosFunctionCard.tsx`. Confirmed zero importers of those four
names (plus their shared `SwimlaneDragDropProvider.tsx` dnd-kit context)
anywhere in `src/` outside the cluster itself, and no test references them.
Git history shows `EosFunctionCard.tsx` was created ~14 hours after
`FunctionColumn.tsx` on the same day (2026-02-03) — an apparent same-day
replacement that was never cleaned up, so this cluster (1,633 LOC across 5
files) has been dead for about 7 months. Retired outright rather than
extracted; `SeatHealthBadge`/`SeatCoverageIndicator` (used inside the dead
cluster) were kept since both have independent live callers
(`SeatHealthSection`, `SeatDetailPanel`) reachable from `ChartBuilder`.
`@dnd-kit/*` stays a live dependency (used by 9 other unrelated files) — no
package.json change. Full verification chain green: lint:ratchet,
typecheck, `test:frontend` (323/15 skipped), `test:edge` (276/276), build.
Updated `next-candidate-packets.md` Candidate 4 and this plan's SeatCard
references accordingly.

**2026-09-08, session 26 — P5-A item 3 closed, `InviteUserDialog.tsx`
`unicorn1` adapter shipped (`hotfix/p5a-invite-user-unicorn1-adapter`):**
replaced the reviewed `(supabase as any).schema('unicorn1')...` cross-schema
exception with a bounded `Unicorn1SchemaClient` adapter type (`mapUnicorn1
UserToUuid`), isolating the `as unknown` boundary to exactly the one legacy
write call instead of casting the whole client. Lint baseline drops from 2
errors to 1 (only the deferred `generate-meeting-recurrence` typing boundary
remains); typecheck, `test:frontend` (323 passed/15 skipped), and `test:edge`
(276/276) all stayed green. Live verification (SuperAdmin persona, real
browser, real Demo RTO tenant) surfaced a separate, pre-existing production
bug: the adapter's one write call fails at the PostgREST layer
("The schema must be one of the following: public, graphql_public")
regardless of typing, because this project's PostgREST config never exposed
the `unicorn1` schema — confirmed independent of this fix by exercising the
exact call directly against production. Documented as
`l10-real-bugs-found.md` item 33 rather than fixed: the correct fix is a new
`SECURITY DEFINER` RPC (matching `search-unicorn1-users`'s existing
workaround for the identical constraint), which is real schema/migration
work out of scope for a typing packet, and Unicorn 1 (and this import flow)
is expected to be retired rather than actively developed. All test-import
data (a dummy `test@gmail.com` legacy record, tenant 7547/Demo RTO) was
created and fully cleaned up in the same session — no residual test rows,
and the target legacy row's `mapped_user_uuid` was confirmed to remain
`NULL` throughout (the write never actually executed). Playwright storage
states for both `superadmin` and `client-demo` (Demo RTO) personas were
regenerated fresh in the main checkout (not a worktree) specifically so
Codex can reuse them.

**2026-09-08, session 24 — status reconciliation after KB restructuring:**
The historical packet entries below remain preserved, but their current status
is normalized here. P1-A, P1-B, P1-C, P3-A items 1–3, P4-A, P4-B, P4-C,
P4-D, P6-A and the completed P6-B cohorts are done. P3-A item 4 is a separate
RBAC/security hotfix and is not part of this stabilization implementation.
P5-A is now fully done: item 3 (`InviteUserDialog.tsx`) shipped in session
26, and the last deliberate lint exception (`generate-meeting-recurrence`
typing) closed in session 28 — zero known `no-explicit-any` exceptions
remain repo-wide.
M0, M1, M2, M3-A, M3-C, M4 and M6 are done; M5 is superseded. Jobs 14, 15,
20 and 21 are retired, with their data and functions retained. SeatCard
display-core coverage was resolved in session 27 as a dead-code retirement,
not an extraction. Remaining implementation candidates are the broader
layered-QA coverage-programme scope (P2-QA — see
[qa-environment-and-coverage-strategy.md](qa-environment-and-coverage-strategy.md),
not the master plan's unrelated "Packet P2: feature boundary pilot"), and
Phase 3 preparation/implementation (P7), which remains gated by RBAC and
Tenant Operating Model decisions.

**2026-09-08, session 25 — M4 retired by product decision:** the production
preflight confirmed forecast jobs 20 and 21 were active while their respective
output tables remained empty. Carl selected retirement rather than repair.
Migration `20260908080000_retire_forecast_health_crons.sql` was merged and
applied to production as Supabase migration `20260908074316`; it unscheduled
only those exact schedules with ID-reuse checks and a postflight assertion.
Jobs 14 and 15 were already absent. Postflight found 20 active cron jobs,
both retired names absent, neighboring jobs 19/22 unchanged, all six
forecast/health tables retained, and their row counts unchanged (357,471
stage snapshots, 2,539 workload snapshots, zero forecast outputs). The
forecast/health Edge Functions and historical rows remain intact for the
Client Health replacement. No data deletion is part of this retirement.

**2026-09-08, session 13 — Dedicated QA project provisioned:** created
`unicorn-qa` (project ref `qfpxvumcrnzrjyvqkicq`) in Southeast Asia
(`ap-southeast-1`). Read-only post-provision capture confirms the project is
healthy, has no application migrations, no cron schedules, no branches, no
GitHub integration and no imported application data. The QA baseline manifest
now points at this project and remains `pending-capture` until a reviewed
schema baseline is loaded and parity-verified. No production state or secret
was accessed or changed.

**2026-09-08, session 15 — QA application-scope parity verified:** the
reviewed schema-only baseline is loaded in `unicorn-qa` and passes the scoped
parity checker. The manifest is now `verified` for strict extension/table/view
fingerprints, function/trigger/policy counts, critical RLS columns/foreign
keys/policies, no cron relation, no production URLs and no application rows.
Managed schemas, scheduling extensions and sanitized trigger/type overrides
are explicit exceptions. P1-C remains gated only on the QA-only service-role
secret and isolation-harness proof; future syncs stay explicit and
migration-ledger aware.

**2026-09-08, session 16 — reusable QA coverage model documented:** the QA
project is now recorded as a general application-integration sandbox, not only
an isolation-test target. The new QA strategy defines migration/feature impact
classification, suite selection, schema/RLS/RPC/Edge/data-lifecycle/residue
and Playwright layers, plus the rule that behavioral coverage is expanded by
an explicit contract or waiver rather than guessed test generation. P1-C is
the first protected gate; the broader coverage model is a follow-on after its
live proof.

**2026-09-08, session 17 — P1-C execution guard implemented:** the isolation
suite now fails closed if a service-role key is pointed at anything other than
the allowlisted `unicorn-qa` project, and uses an atomic same-host lock. The
protected `workflow_dispatch`/nightly workflow adds the cross-run GitHub
Actions concurrency lock and injects only QA environment secrets. No secret
has been added; live execution remains intentionally blocked until the
`unicorn-qa` environment is configured.

**2026-09-08, session 18 — P1-C live proof completed:** PRs #1006, #1007 and
#1008 are merged. The protected workflow run
[`34179875080`](https://github.com/vivacityrto/unicorn-cms-f09c59e5/actions/runs/34179875080)
executed all 15 tenant-isolation RLS tests against `unicorn-qa`; all 15 passed.
The run also proved cleanup: a post-run QA query found zero run-scoped tenants,
profiles, memberships, conversations, messages, audit rows or Auth users. QA
needed four non-production parity repairs discovered by the live run: standard
`service_role` and API-role grants, the `dd_access_status` and
`dd_lifecycle_status` lookup values, the identity lookup values (including the
production trigger-normalized `Client Child`/`Vivacity Team` values), and a
fixture-only `consultant_assignment_method = 'manual'` override so the unrelated
consultant auto-assignment trigger does not require capacity data. These were
applied only to `unicorn-qa`; no production schema or data changed. The
repository-level QA secrets are temporary while Angela enables the protected
environment; they must be moved to `unicorn-qa` and deleted from repository
scope afterward.

**2026-09-08, session 23 — P1-C administrative tail intentionally skipped:**
Carl accepted the successful protected-workflow proof as the P1-C exit evidence
and explicitly waived moving the QA-only secrets into the protected
`unicorn-qa` environment or repeating the run afterward. This is recorded as a
deliberate governance exception, not an outstanding implementation task. The
workflow remains manual/nightly, concurrency-locked, allowlisted to
`unicorn-qa`, and unavailable to forked pull requests; the repository-level
secrets must never be referenced by ordinary pull-request workflows or pointed
at production.

**2026-09-08, session 19 — M3-B/M3-C cross-check:** M3-B was already complete
in both source and production. Production currently lists
`process-notification-queue` and `send-automated-email` at version 175; the
queue source is the credential-free `FUNCTION_RETIRED` 410 stub and the email
source contains no `notification_schedule` writer. A read-only production
check found `notification_schedule` present but empty (0 rows), with zero
database-function, view, trigger, or cron references. No queue or automated-
email Edge log events appeared after the latest deployment observed at
`2026-09-07T23:57:35Z`. M3-C is therefore not yet complete: using a
conservative 24-hour quiet-period window, the earliest drop gate is
`2026-09-08T23:57:35Z`; the table, indexes, and policies remain untouched
until that evidence is re-checked and the separately authorized migration is
applied. No hosted state changed in this cross-check.

**2026-09-08, session 20 — M3-C completed:** Carl explicitly overrode the
conservative quiet-period timing after the final read-only dependency check.
The fail-closed `retire_notification_schedule` migration was applied to
production and recorded by Supabase as `20260908031729`. Postflight confirms
`public.notification_schedule` is absent, while `notification_audit_log` and
`notification_outbox` remain present; function, view, and cron scans still
return zero references. No rows were deleted because the retired table was
empty. A schema-only rollback script is committed for recovery if a future
owner revives this contract; it does not recreate the retired audit functions
or queue worker. M3-C is closed.

**2026-09-08, session 21 — M4 production preflight:** the stage-health cron
is already paused in production (job 15 is absent) under the earlier H0.0
containment, while `run-workload-forecast-nightly` (job 14, `0 16 * * *`)
remains active. Production currently has 357,471 stage-health rows with zero
non-zero `progress_percentage` values, 2,539 workload snapshots through
2026-09-07, and zero rows in `tenant_package_burn_forecast`,
`tenant_risk_forecasts`, and `tenant_retention_forecasts`; the predictive risk
snapshot is stale since 2026-02-13. The merged M4 source includes
`output_health`/503 safeguards, but the deployed `run-stage-health-monitor`
and `run-workload-forecast` sources do not yet contain those safeguards. No
deployment or schedule change was made. M4 therefore stops at an explicit
product decision: repair and deploy the workload path with authenticated,
read-only Playwright proof, or retire/unschedule it as part of the Client
Health replacement.

**2026-09-08, session 22 — M4 workload cron retired:** Carl selected the
retirement path after the preflight confirmed the workload job was producing
snapshots but no burn/risk/retention forecast output. The fail-closed
`retire_workload_forecast_cron` migration was applied to production and
recorded by Supabase as `20260908035935`. Postflight confirms job 14 and its
name are absent; the 2,539 workload snapshots and all forecast tables remain
unchanged. The `run-workload-forecast` Edge Function remains deployed for
separate replacement work. No data rows, function, or table were deleted.

**2026-09-07, session 2 — Packet M0 completed:** read-only production cron and
migration inventory captured in [cron-and-migration-inventory-2026-09-07.md](../../../codebase-state/cron-and-migration-inventory-2026-09-07.md)
and its JSON companion. No hosted state changed. M1 is next.

**2026-09-07, session 3 — Packet M1 implemented:** added the repository
migration scanner, unit tests, empty reviewed-exception allowlist, CI
guardrail, and usage documentation. The full-tree audit reports historical
findings without failing; changed-only CI mode blocks new production URLs,
cron/HTTP side effects, migration-time mutations, and edits to existing
migration history unless a concrete, short-lived allowlist entry matches.
No hosted state changed. M2 remains product-owner gated.

**2026-09-07, session 4 — Packet M2 authored after product-owner approval:**
read-only production preflight confirmed jobs 4–6 and their failure/success
evidence, and found that the notification tables still have active Edge
Function readers/writers. Added a guarded, idempotent corrective migration to
unschedule only the three legacy audit job names, with an ID-reuse check and a
postflight assertion. Tables and helper functions are intentionally retained
for M3. The migration was then applied in session 5 after separate explicit
authorization.

**2026-09-07, session 5 — Packet M2 applied after explicit authorization:**
the guarded migration unscheduled only `audit-24hr-confirmation` (job 4),
`audit-evidence-reminders` (job 5), and `audit-flag-overdue-chcs` (job 6) in
production. Postflight confirmed 24 active jobs remain, zero rows for the
retired names, unchanged neighboring schedules, and migration-history entry
`20260907050651`. Historical run details remain; notification tables and
helper functions were not changed. M3 is next.

**2026-09-07, session 6 — Packet M3 dependency review completed (read-only):**
production has zero rows in both `notification_schedule` and
`notification_audit_log`; all three legacy audit functions are executable only
by `service_role`/`postgres`, with no triggers or views depending on either
table. The three database functions have no active schedule after M2 and no
repository caller. `notification_audit_log` is nevertheless written by the
active `process-notification-outbox` worker and must remain. `notification_schedule`
is still read by the deployed but unscheduled `process-notification-queue`
worker and written by the three audit branches of `send-automated-email`; those
branches have no repository caller and currently reference the removed
`payload` column. Recommendation: execute the staged retirement path in Packet
M3-A through M3-C below, retaining `notification_audit_log`.

**2026-09-07, session 7 — M3-A applied after explicit authorization:**
the new migration dropped only the three legacy audit routines. Postflight
confirmed no matching routines remain, jobs 4–6 remain absent, both legacy
tables remain present/RLS-enabled with zero rows, and the notification outbox
remains unchanged at 738 failed and 242 skipped rows. Supabase recorded
`retire_legacy_audit_functions` as migration `20260907052028`. M3-B is next.

**2026-09-07, session 8 — M3-B implemented:** removed the three dormant
`notification_schedule` writes from `send-automated-email` while preserving
its three email response paths, and replaced the unused
`process-notification-queue` worker with a credential-free HTTP 410 retirement
stub. The shared cron-auth inventory no longer treats the retired worker as an
active cron function; `notification_schedule` and the active
`process-notification-outbox` contract remain intact for M3-C/M3-D. Static
regression tests pass. Production state is unchanged pending reviewed PR
merge, after which the native Supabase GitHub sync will deploy the Edge change.

**2026-09-07, session 9 — M3-B merged; deployment verification parked:** PR
#973 merged as `acf0069e7b7a0704485805dbc9ffd8cc52c7a441`. The read-only
post-merge Supabase check still found the pre-M3-B queue and email deployments
(v170); the queue endpoint returned 401 rather than the committed 410 stub.
No manual production deployment or hosted data change was performed. Keep the
deployment/source check parked as an explicit follow-up; M3-C cannot close
until the stub is live and the quiet-period proof is collected.

**2026-09-07, session 10 — M3-C preflight captured:** merged-source and
read-only production checks found no live database function, view, trigger, or
cron reference to `notification_schedule`; the table remains present with
zero rows, six indexes, and four RLS policies. The 24-hour Edge log query
found three old-v170/401 queue requests, including the audit probes, while
the committed 410 stub is still not deployed. The quiet-period gate therefore
has not started; no migration, Edge deletion, or hosted data change was
authorized. Evidence is recorded in
[`notification-schedule-m3c-preflight.md`](../../../../audit-log/entries/2026-09-07-notification-schedule-m3c-preflight.md).

**2026-09-07, session 11 — M3-B deployment verified; M3-C quiet period
started:** after native Git sync lagged, the explicitly authorized manual
deployment published `process-notification-queue` v171 (410
`FUNCTION_RETIRED`) and `send-automated-email` v171 to production. Deployed
source checks confirmed the queue has no `notification_schedule` or
service-role reference and the email function has no remaining legacy-table
writer. A read-only endpoint probe returned HTTP 410 with the retirement code;
no database or data change occurred. The M3-C quiet-period clock starts from
this verified deployment, and the table drop remains separately authorized
work.

**2026-09-07, session 1 — Packets P0-A, P0-B, P0-C, P1-A, P1-B, P4-A merged:**

> **Restoration note:** this whole section was added in PR #961 and then
> silently deleted by PR #963 ("test: track tenant isolation fixture
> identities") — a real content-loss incident, not a deliberate edit; #963's
> diff shows a clean 56-line removal of exactly this section, alongside an
> identical removal in `execution-efficiency-log.md`. Restored here with
> updates for what's happened since.

- **P0-A** (superseded PR closeout): all 8 listed PRs (#794–#800, #822) confirmed
  superseded — every changed file already clean (0 explicit-any, 0 ESLint
  errors) on `origin/main` — and closed without merge, with superseding-PR
  links recorded in each closing comment.
- **P0-B** (PR #612 evidence preservation): [#955](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/955),
  merged. Preserved the dashboard-500 statement-timeout evidence as L10 item
  #26, linked to Client Health H0.0 containment, then closed #612.
- **P0-C** (truth-sync): [#956](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/956),
  merged. Verified and corrected the packet's own claims against source —
  typecheck error count/CI-gate status, Phase 2.5/2.6/3 sequencing notes,
  #22/#24 duplicate root cause. **Found one factual error in this plan
  itself**, not silently accepted: `usePackageUsage.tsx` is NOT live (zero
  importers on `origin/main`, superseded by `usePackageUsageQuery.tsx`) —
  corrected in `execution-efficiency-log.md`, not reclassified as safe to
  retire without its own gated packet. Also flagged the plan's "9,209 lines
  retired" figure as an approximation (~8,867 by direct per-PR sum, a
  ~342-line gap within normal rounding of several `~`-prefixed entries).
- **P1-A** (7 non-`any` lint errors): [#957](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/957)
  and follow-up [#960](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/960)
  (`PackagePhasesTab.tsx`), both merged. §2's "seven non-`any` errors"
  undercounted by one: there were 7 ternary-as-statement findings across 6
  files plus 1 `prefer-const`, not the "seven, including two in the first
  file" description — #957 fixed 7 of the 8, #960 fixed the missed 8th.
  Several of the five named files also live at different paths than stated
  (e.g. `NewEnrolmentModal.tsx` is under `src/components/academy/admin/`,
  not `src/components/admin/`).
- **P1-B** (typecheck to zero + CI gate): [#958](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/958),
  merged. `ClientLayout.tsx` and `useKpiSummary.tsx` fixed; typecheck is 0
  errors; `.github/workflows/typecheck.yml` added as a real, non-exempted
  CI gate.
- **P1-C (isolation-suite hardening): live proof complete.**
  [#962](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/962) —
  placeholders removed, live RLS suite typed against generated schema.
 [#963](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/963) —
  unique per-run `RUN_ID`, fail-closed reverse-dependency cleanup. Step 6
  (concurrent-run serialization) is complete, and the live suite has now
  executed all 15 tests successfully with zero residual fixture rows or Auth
  users. The dedicated `unicorn-qa` project and application-scope parity gate
  are established. The workflow is currently running with temporary
  repository-level QA secrets while environment access is provisioned; move
  those secrets to the protected `unicorn-qa` environment before treating the
  workflow boundary as final. The reusable QA coverage model is documented
  separately and must expand beyond P1-C for future schema/features.
- **P4-A** (small frontend correctness): [#959](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/959),
  merged. Fixed L10 #22/#24 (`ClientRouteGuard` render-time `navigate()`)
  and #11 (`useKpiAccess` missing the `unicorn_role` SuperAdmin check —
  verified live against a real affected account, `carl@vivacity.com.au`,
  whose profile has `global_role: null, unicorn_role: "Super Admin"`).
  Confirmed #23 (`BulkMessageDialog` DialogTitle) was already fixed by an
  earlier, unrelated PR; annotated rather than re-implemented.
- **P6-A retargeted into a full-page retirement, merged.**
  [#964](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/964).
  Started as the
  `AddClientTaskDialog`/`AddStaffTaskDialog` consolidation per the
  task-dialog characterization packet. Live verification of the id-type fix
  surfaced that `PackageDetail.tsx` (the dialogs' only consumer) is itself
  an unreachable, redundant page — reachable only via one unlabeled icon
  button, every feature either disconnected from the real data model or a
  strictly less-capable duplicate of a live equivalent elsewhere. See
  `dead-code-feature-consolidation-investigation.md` §7ter for
  the full investigation. The consolidation work was discarded; the whole
  `/admin/package/:id...` route tree was retired instead, in its own PR.
  This also surfaced a process gap: a stage was briefly added to a real
  client tenant's `tenants.stage_ids` while probing reachability instead of
  using Demo RTO/a seeded tenant, and had to be reverted via Supabase MCP
  after an in-page fetch-based revert attempt was correctly blocked by the
  permission classifier. Logged as a standing rule: future write-testing on
  this plan uses Demo RTO, a seeded tenant, or an inactive tenant — never
  whatever real tenant happens to have convenient data.
- **P5-A batch 2/3 (`tga-rto-sync`, 43 findings), merged.**
  [#968](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/968).
  Rather than casting every property access to `unknown` (which would
  have forced assertions at ~150 downstream sites), modelled the actual
  TGA REST API shapes (`TgaScopeItem`, `TgaOrgData` + its nested
  collection types, `TgaStagingRow`). All 43 fixes are pure
  type-annotation changes — verified via full diff review plus a
  standalone `tsc --noEmit` pass against a stubbed copy of the file (0
  errors), since `supabase/functions/**` isn't covered by either
  tsconfig and has never actually been type-checked otherwise. Added a
  new `auth-gate.test.mjs` (function had no prior test coverage).
  Post-merge Edge-deploy check pending (per `AGENTS.md`'s "Supabase
  deployment workflow" — confirm deployed version/source via Supabase MCP).
- **P5-A batch 1/3 (6 single-finding Edge Functions), merged.**
  [#967](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/967).
  Fixed `add-missing-packages`, `bulk-send-invitations`,
  `create-client-audit`, `create-tasks-from-minutes`, `dashboard-test-seed`,
  `tga-rto-import` — every single-occurrence `no-explicit-any` finding in
  `supabase/functions/**` outside `tga-rto-sync` (43 findings) and
  `ask-viv-assistant` (76 findings), both deferred to their own
  contract-sized batches, and `generate-meeting-recurrence` (excluded per
  this section's own rule, tied to L10 #25's auth review). All 6 fixes are
  compiler-provable type-only changes (catch-narrowing, an existing typed
  `EdgeRuntime`-global pattern reused from 3 other functions, a new
  `MinutesContent` JSON-blob type, a redundant any-cast removal, and a
  `SupabaseClientAny = any` alias swapped for the real untyped
  `SupabaseClient` import already used in `_shared/`) — no live Playwright
  pass required. Added 5 missing `*.test.mjs` static-assertion files
  (test:edge 260→265 passing). Found, documented (L10 #28), but
  deliberately did not fix — behavioral change, out of scope here — a
  pre-existing `bulk-send-invitations` bug: 3 call sites call its own
  `jsonResponse(req, status, body)` helper without `req`, so those
  validation-failure paths throw instead of returning a structured error.
  Post-merge Edge-deploy check pending (per `AGENTS.md`'s "Supabase
  deployment workflow" — confirm deployed version/source via Supabase MCP).
- **P5-A batch 3/3 (`ask-viv-assistant`, 76 findings, the largest remaining
  file), merged and deploy-verified.**
  [#970](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/970),
  merged at commit `db2c46105` (05:29 UTC). Confirmed live via Supabase MCP:
  deployed version advanced 147→148 at 05:41 UTC (~12 min sync lag via
  Supabase's native GitHub sync integration, confirmed independently by
  Codex the same day — see `AGENTS.md`'s "Supabase deployment workflow"
  section, correction pending in PR #972), source verified byte-identical
  to the merged commit, and 3 live Playwright test conversations returned
  correct real data with zero new console errors and clean production
  logs.
  Staff-only agentic tool-calling assistant (21 tools in one `executeTool`
  dispatcher) — the client portal calls a separate, untouched
  `ask-viv-assistant-client` function. Modelled 20 local row-shape
  interfaces, one per distinct query/RPC result shape, replacing per-
  callback `any` annotations with a single cast at first read (same
  pattern as #968). The standalone `tsc --noEmit` pass against the real,
  unmodified `_shared/**` dependency tree (not just a stub) surfaced two
  real narrowing gaps this fixed (`rank_clients_by_activity`/
  `get_activity_trend` both divided a dynamically-keyed column value
  without narrowing `unknown` to `number` first) — genuine bugs the
  linter alone would not have caught. Also surfaced (left alone, out of
  scope) 6 pre-existing type errors in two untouched `_shared` files.
  Added `auth-gate.test.mjs` (function had zero prior test coverage).
  **P5-A is now fully complete** — all 3 PRs merged (#967, #968,
  #970 — 6 + 43 + 76 = 125 of the 166 baseline `no-explicit-any` findings;
  the remaining 41 were the isolation-test findings via P1-C and the two
  frontier frontend files already resolved earlier).
  **Process note:** discovered mid-batch that Edge Functions on this
  project deploy via Supabase's native GitHub sync integration on merge
  to `main` (not a repo-committed Action — none of `.github/workflows/*`
  reference deploy/supabase), contradicting `AGENTS.md`'s current "no
  automatic Supabase deployment workflow" claim. Correcting that claim is
  deliberately deferred until the mechanism is empirically confirmed on a
  real merge (per Carl's instruction), not assumed from this discovery
  alone. No live Playwright pass was done pre-merge for this reason —
  there's nothing new deployed to exercise yet; live verification happens
  after merge once the sync integration deploys it.
- **P4-B (invalid relationship reads) done, plus a P6-B retirement it
  surfaced, pending merge.** Two genuine `packages:package_id`-embed no-FK
  bugs fixed (`StagePreviewDialog.tsx`, `BulkGenerateDocumentsDialog.tsx`) —
  same two-step-fetch pattern as `GeneratedDocumentsTab.tsx`'s existing fix,
  no speculative FK added. Fixing a third instance in
  `TenantDocuments.tsx` was paused mid-task after Carl noticed the page for
  the first time; reachability triage (matching the P6-A lesson above)
  found `TenantDocuments.tsx`, `TenantDocumentsHub.tsx`,
  `TenantDocumentDetail.tsx`, and `TenantDocumentDetailWrapper.tsx` (+ their
  3 routes) were unreachable dead code whose only live equivalent
  (`ClientDetail.tsx`'s embedded Documents tab) was already fixed. Retired
  all 4 files and redirected the 3 routes instead of fixing dead code — see
  `dead-code-feature-consolidation-investigation.md` §7quater and
  L10 item #17's update for the full investigation. Verified live:
  `StagePreviewDialog.tsx`'s fixed query and all 3 retirement redirects,
  zero console errors; `BulkGenerateDocumentsDialog.tsx`'s own dialog could
  not be opened live (`package_stage_documents` has zero non-deleted rows
  in production right now, for any stage — a pre-existing, unrelated data
  fact) so its fix rests on static verification + code-pattern review only,
  disclosed as a coverage gap rather than silently claimed as tested.
- **P4-C (identity and lookup reads) done and merged (PR #976).** Process
  Audit Log (#20), Edit/Add Time person lookup (#21), and `AddTimeDialog`'s
  note-insert (unnumbered) all fixed against confirmed live schema — none
  needed a decision packet. See Packet P4-C's own section (§7) for full
  detail. Also surfaced a parked, explicitly-deferred finding: person-picker
  dropdowns built on `public.users` list system/test/bulk-operation accounts
  unfiltered — logged as RBAC v6 plan §13 item 14, not actioned here.
- **Edge Function auto-deploy confirmed unreliable, not just laggy — all 7
  functions from #967/#968 manually redeployed, correction merged (PR
  #977).** Post-merge checks found none of the 7 functions changed by
  #967/#968 had auto-deployed 20+ minutes after merge (confirmed via a
  real source diff, e.g. `tga-rto-sync`'s live source still had the
  pre-fix `const norm = (v: any) => ...`), directly contradicting the
  "confirmed reliable" claim recorded above for #970 and in PR #972.
  Carl independently confirmed Codex hit the identical failure the same
  day. All 7 (`tga-rto-sync`, `add-missing-packages`, `tga-rto-import`,
  `bulk-send-invitations`, `create-client-audit`, `dashboard-test-seed`,
  `create-tasks-from-minutes`) were manually deployed via Supabase MCP
  and verified byte-for-byte against `origin/main`. Also found and logged
  (L10 item 29, not fixed — out of scope) a second instance of the same
  bug shape as item 28: `tga-rto-import`'s `handleImport`/`handleStatus`
  call `jsonResponse(req, ...)` with `req` out of scope, a guaranteed
  `ReferenceError` on every real invocation, pre-existing since PR #303.
  `AGENTS.md`'s "Supabase deployment workflow" section now documents the
  manual-deploy fallback and treats auto-deploy as something to verify
  every time, not trust.
- **P3-A item 3 (`generate-meeting-recurrence` auth, L10 #25) done and
  merged.** Live schema review found the RLS policies on
  `eos_meeting_recurrences`/`eos_meeting_occurrences` already fully enforce
  per-tenant facilitator/eos-admin authorization on every write
  (`WITH CHECK` against `is_eos_admin`/`can_facilitate_eos`/
  `is_super_admin`) — the flagged gap was a missing application-layer gate,
  not an open write path. Added `requireCaller(req,
  FeatureKeys.staffMeetings)` before any DB access, plus a server-side
  check that the caller-supplied `tenant_id` actually matches the
  referenced `meeting_id`'s real tenant (RLS's `WITH CHECK` only verifies
  authorization *for* the supplied `tenant_id`, not that `meeting_id`
  genuinely belongs to it). Deliberately kept the existing RLS-backed
  forwarded-JWT client for the writes themselves — no switch to a
  service-role client, so the finer-grained facilitator/eos-admin boundary
  is unchanged. Added `auth-gate.test.mjs`; manually deployed (Edge
  auto-deploy still unreliable, see the finding above) and live-verified
  against production using the SuperAdmin persona (this feature is
  Vivacity-staff-only, `/eos/*` — Demo RTO's client persona has no access
  to it; correction to this entry's original wording, which incorrectly
  said Demo RTO) with test data cleaned up afterward.
- **P6-B "title extraction pair" cohort retargeted into a retirement.**
  Both this section's §8 packet definition and the underlying candidate
  writeups (`next-candidate-packets.md`,
  `dead-code-feature-consolidation-investigation.md`) assumed
  `extract-note-title` and `extract-suggest-title` were a live near-duplicate
  pair needing consolidation. Reachability triage (the required
  deployed-caller inventory these docs called for, but that had never
  actually been done) found `extract-suggest-title` has zero callers in
  `src/` or `supabase/functions/**` and zero logged invocations — it was
  added alongside a "suggestion tables and RBAC" feature whose UI never
  got wired to AI-assisted titling. There was no clone pair to consolidate.
  Retired `extract-suggest-title` outright (source + `supabase/config.toml`
  entry removed); `extract-note-title` (5 real callers) is untouched — no
  consolidation needed for a single remaining function. The live Supabase
  function stays deployed and ACTIVE (no `delete_edge_function` MCP tool
  available this session) but is now unreachable from any code path;
  manually deleting it via the dashboard is a disclosed follow-up, not
  done here.
- **P3-A item 3 / L10 #25's "Demo RTO" wording corrected.** That entry and
  this doc's own progress-log line for it originally said the live
  verification ran against Demo RTO; it actually used the SuperAdmin
  persona, since `generate-meeting-recurrence`/EOS Meetings is
  Vivacity-staff-only and Demo RTO's client persona has no access to it.
  Both entries corrected in the same PR as this retirement.
- **P3-A item 1 (Client Health H0.0) partially done: cron paused, one
  direct consumer contained; the wider RPC/AI/executive graph is
  deliberately out of scope here.** Carl explicitly authorized pausing the
  nightly `run-stage-health-monitor-nightly` cron (job 15) — "the client
  health will be superseded by the new client health plan, so you can stop
  the cron" — resolving H0.0's one explicit decision gate. Applied via a
  guarded, allowlisted migration (unschedules only that job by name,
  refuses on ID reuse, postflight-verified); `stage_health_snapshots` and
  the `run-stage-health-monitor` Edge Function are retained as evidence,
  not dropped. Audit entry:
  `docs/audit-log/entries/2026-09-07-pause-stage-health-monitor-cron.md`.
  Also contained the one component confirmed as a direct, standalone
  frontend consumer of the raw metric — `PortfolioHealthWidget.tsx` — which
  now shows an explicit "unavailable — data repair in progress" message
  instead of computing healthy/at-risk/critical percentages from
  known-defective data, and no longer queries `stage_health_snapshots` at
  all. **Deliberately not touched in this pass:** the plan doc's own §4
  "current product and request graph" lists a much wider consumer set —
  `v_dashboard_attention_ranked` (25% stage-weighted, feeds the whole
  `/triage-dashboard`), `rpc_portfolio_client_health()` in `MainDashboard`,
  staff Ask Viv's portfolio fact builder, `ask-viv-assistant`,
  `compliance-assistant`, and executive health/consultant-distribution
  views. Containing those correctly needs the H0.1-style characterization
  work the plan itself calls for (exact formulas, defaults, fallbacks,
  caller permissions per consumer) before a safe "unavailable" swap can be
  written for each — attempting that in the same pass as a single-widget
  fix would risk silently changing AI-generated content or executive
  reporting behavior without the evidence base the plan requires. Left as
  a properly scoped follow-up, not guessed at.
- **P3-A item 1 follow-up (2026-09-08):** characterized the remaining
   Client Health consumers and removed the now-dead `MainDashboard` reads of
   `v_dashboard_attention_ranked.worst_stage_health_status` and
   `rpc_portfolio_client_health()`. The panel remains explicitly unavailable;
   no schema/RPC behavior changed. The characterization matrix is recorded in
   [`p3-a-client-health-consumer-characterization.md`](../phase-3/p3-a-client-health-consumer-characterization.md).
   Ask Viv/Compliance Assistant attention facts and operational Edge readers
   remain deliberately retained as separate follow-up contracts; they are not
   silently relabeled as Client Health.
- **P3-A item 2 (dashboard timeout) done, and it closes part of the
  "deliberately not touched" gap immediately above.** L10 #26 (Attention
  Ranking/Priority Inbox/Behavioural Prompts/Labour Efficiency returning
  HTTP 500) was root-caused via `EXPLAIN (ANALYZE, BUFFERS)` against the
  real authenticated-role query — not the suspected RLS performance
  cliff (the actual filter columns already had indexes and were pushed
  down correctly), but 97% of query time in a per-tenant `DISTINCT ON`
  scan of `stage_health_snapshots` inside `v_dashboard_tenant_portfolio`
  — `v_dashboard_attention_ranked`'s own base view, named above as one of
  the wider consumers deliberately deferred. Carl authorized extending
  H0.0 containment here too (same "unavailable, not relabeled as
  trustworthy" principle as `PortfolioHealthWidget.tsx` above): the `sh`
  LATERAL join is now a fixed `'unavailable'`/0/0 stub instead of a real
  computation; `v_dashboard_priority_inbox` had an independent, equally
  expensive instance (a global stage_health scan generating misleading
  inbox items), also fixed the same way. `EXPLAIN` confirmed 1129.6ms →
  13.9ms (~81x), clear of both the 3s (`anon`) and 8s (`authenticated`)
  timeouts. `v_dashboard_behavioural_prompts`/`v_dashboard_labour_efficiency`
  inherit the fix (both read `v_dashboard_tenant_portfolio`), no separate
  change needed. The 3 frontend components previously fell back to a
  green "Healthy" badge for any unrecognized value — the same relabeling
  risk H0.0 warned against; Codex independently shipped a more complete
  fix to the same 3 files in a concurrent session (`d11c2c3cb`, a shared
  `LegacyStageHealthUnavailable` component rendered unconditionally,
  replacing the badge/color maps entirely) — taken as-is during merge
  rather than layering a redundant containment mechanism on top. **Still
  not touched, matching the note above's own
  scope boundary:** `rpc_portfolio_client_health()`, the Ask Viv
  portfolio fact builder, `compliance-assistant`, and executive
  health/consultant-distribution views — this pass fixed the urgent
  timeout via the same containment principle already decided for H0.0,
  it did not do the full H0.1-style characterization across every
  consumer. Audit entry:
  `docs/audit-log/entries/2026-09-08-dashboard-timeout-h00-containment.md`.
- **P6-B `useStageQualityCheck` evaluator cohort done.** Extracted the
  shared A-E structure/team-task/client-task/email/document checks from
  `useStageQualityCheck.tsx` (745 LOC, two near-duplicated pipelines) into
  a pure `stageQualityEvaluator.ts` with no Supabase calls, used by both
  the live dashboard hook and the `computeStageQuality` certification
  guardrail. Preserved both real behavioral differences the plan's own
  candidate writeup didn't fully characterize: (1) the hook shows a
  generic "Emails"/"Documents linked" pass check for stage types outside
  the categories that specifically require them, which the certification
  guardrail deliberately omits (`includeGenericEmailPass`/
  `includeGenericDocumentPass` options); (2) the "certified integrity"
  self-check (section F) is display-only, appended by the hook after
  calling the shared evaluator, and intentionally not part of
  `computeStageQuality` — that function IS the certification gate, so
  checking "is this already-certified stage still passing" would be
  circular. Both call sites' own Supabase-fetch logic is otherwise
  untouched (same queries, same tables, same package/template branching).
  Added 29 parity fixture tests (`stageQualityEvaluator.test.ts`) per the
  plan's own gate ("No focused fixtures currently exist; add parity
  fixtures first") covering every check category and both option
  combinations. All 4 real call sites (`PublishStageDialog.tsx`,
  `StageQualityPanel.tsx`, `useStageSimulation.tsx`,
  `AdminStageDetail.tsx`) import unchanged names/shapes — no caller edits
  needed.
- **P6-B network-status island retired.** `NetworkStatusIndicator.tsx` +
  `useNetworkStatus.ts` (302 LOC): zero repo-wide references beyond the two
  files themselves, created in the same original commit and never mounted
  anywhere despite the component's own docstring suggesting
  `AuthenticatedLayout`/`App.tsx`. Pure browser-API code (`navigator.onLine`,
  Network Information API) — no server/RPC/Edge Function dependency, so
  none of the caution this cohort's sibling islands need (SharePoint,
  Workboard, Reassignment, Compliance-score all have live backend ties per
  `dead-code-feature-consolidation-investigation.md` §3.2).
  **SeatCard display core explicitly not started** — the packet itself
  gates it behind independent Playwright drag-and-drop coverage for both
  `SeatCard`/`DraggableSeatCard` interactive contexts, which doesn't exist
  yet; building that test infrastructure is its own scoped prerequisite,
  not something to improvise inside a consolidation PR.
- **P6-B "old standalone UI" pair retired.** `client/BulkUploadDialog.tsx`
  (345 LOC) and `dashboard/WeekTasksTable.tsx` (250 LOC): zero repo-wide
  references to either beyond the files themselves, no exclusive backend
  objects (the dialog's one Supabase call is a shared `package-documents`
  storage upload; the table's calls are plain reads on shared tables).
  **Process-integrity finding surfaced by this reachability check:**
  `WeekTasksTable`'s only caller was deleted 2026-08-27 (`c1dcf097f`), but
  a 2026-09-06 PR (#842) explicitly claimed "fresh reachability confirmed
  `WeekTasksTable` is active on `/dashboard`" with a claimed Playwright
  pass — `/dashboard` is served by `MainDashboard.tsx`, which never
  imported it. The component had been orphaned for 10 days when that
  claim was made. Corrected in `execution-efficiency-log.md` and
  `codebase-optimization-plan-2026-08-28.md`'s own PR #842 entries — not
  silently absorbed. This is the same class of gap as PR #0-C's
  `usePackageUsage.tsx` correction earlier in this plan: a "confirmed
  live" claim that reachability triage later disproved.
- **P6-B zero-inbound UX/platform artifacts cohort (5 of 7) retired.**
  `useDevOverflowWarning.ts` (dev-only overflow diagnostic, no-op in
  production), `engagement-guardrails.ts` (pure celebration-governance
  validation logic), `useYouveGotMailToast.tsx` (read-only against the
  shared `conversation_participants`/`tenant_messages` tables — deleting
  the frontend hook doesn't retire either table), `useProgressAnchors.ts`
  (read-only against the shared `v_phase_actions_remaining`/
  `v_progress_anchor_inputs` views, same reasoning), and
  `stage-registry.ts` (pure TypeScript type re-exports, zero runtime
  code). All confirmed zero repo-wide references beyond their own files.
  **Deliberately not touched, product decisions received 2026-09-08:**
  `useClientAICompanion` (kept — Carl confirmed the backend, a
  substantial Standards-for-RTOs-2025-gated AI companion tagged "Phase
  17," is earmarked for reuse in a future client health feature, not
  dead) and `StandardsPicker.tsx` (kept — a ready-made standards-clause
  picker for the otherwise-live PDP feature area, never wired into
  `StaffPdpsPage.tsx`'s form). Both decisions and full rationale
  recorded in the dead-code register's §3.3.
- **P6-B Workboard UI island retired.** `AddWorkboardItemDialog.tsx`,
  `WorkboardBoardView.tsx`, `WorkboardItemDrawer.tsx`,
  `WorkboardListView.tsx`, and `useClientWorkboard.tsx` (1,765 LOC): zero
  repo-wide references to any of the 5 beyond their own internal
  cross-imports — no page or route renders any of the 4 view components.
  **Caution satisfied, not skipped:** `client_action_items`/
  `client_action_item_comments` (the tables this hook reads/writes) are
  genuinely still live — `ClientActionItemsTab.tsx`, `ClientTasksPage.tsx`,
  `TasksManagement.tsx`, several KPI-v2 components, and the Ask Viv fact
  builder's backend all read the same tables through a completely
  different, active UI. This is a superseded duplicate feature, not dead
  database infrastructure. **Also resolves `AddWorkboardItemDialog.tsx`'s
  long-standing P5-A item 2 reachability question** (carried since Phase
  2.5 closeout as one of the residual 3 `no-explicit-any` findings) —
  confirmed genuinely dead rather than typed.
- **P6-B SharePoint document-link UI island retired (frontend only).**
  `LinkedDocumentsList.tsx`, `SharePointDocumentPicker.tsx`,
  `useDocumentLinks.tsx` (1,088 LOC): the cluster's only entry point had
  zero repo-wide references beyond its own internal cross-imports.
  **The caution's own instruction — "do not infer the endpoint or
  `document_links` is unused" — was checked against production data, not
  inferred:** `document_links` has 0 rows, ever, while
  `document_stage_links` (the table the live document-stage-linking
  feature actually uses) has 678 real rows. Retired the 3 frontend files
  only; the `link-sharepoint-document` Edge Function and the empty
  `document_links` table were deliberately left untouched — their own
  retirement needs separate Edge/schema authorization, not inferred from
  a frontend-only cleanup.
- **P6-B abandoned bulk-generation steps retired.** `PackageFilterStep.tsx`,
  `ScopeStep.tsx`, `StageDocFilterStep.tsx`, `useTenantSharepointStatus.ts`
  (386 LOC). **Caution satisfied, not skipped:** confirmed the active
  targeted bulk-generation flow is `TargetedMode.tsx` (imported by the live
  `BulkGenerateNew.tsx`, reached from `BulkGenerateButton.tsx`'s
  `/manage-documents/bulk-generate/new` link), and that `BulkGenerateNew.tsx`
  imports only `TargetedMode` — no reference to any of the 4 retired files,
  confirming the older step-wizard was fully superseded, not one of two
  live variants. All 4 files' Supabase calls are plain reads on shared core
  tables (`packages`, `tenants`, `stages`, `tenant_sharepoint_settings`) —
  no exclusive backend object retired.
- **P6-B Reassignment island retired.** `ReassignConsultantDialog.tsx`
  (129 LOC), `useConsultantAssignment.tsx` (228 LOC). **Caution satisfied,
  not skipped:** confirmed active CSC assignment contracts are preserved
  — `BulkReassignCscDialog.tsx` (live, imported by `ManageTenants.tsx`) is
  a completely independent implementation that doesn't use
  `useConsultantAssignment.tsx` at all. `ReassignConsultantDialog.tsx`'s
  only caller was actually removed 2026-08-27 (`235c3a3ce`), predating a
  later claim in `codebase-optimization-plan-2026-08-28.md` (batch 9a)
  that Playwright "verified live... the Reassign Consultant dialog" —
  **corrected there**, since that claim almost certainly conflated this
  dead dialog with the similarly-named, genuinely-live
  `BulkReassignCscDialog.tsx` typed in the same batch (the same class of
  gap as the earlier `WeekTasksTable` correction). Per this cohort's own
  instruction, removed the dead duplicated staff-listing predicate from
  `docs/kb/handoffs/rbac-v6-gate-closure-plan.md`'s census of files
  needing future `useListableStaff()` migration (9→8 files), rather than
  migrating dead code.
- **P6-B Compliance-score island retired (frontend only).**
  `ComplianceScoreBreakdown.tsx` (146 LOC), `useComplianceScore.ts`
  (115 LOC). **The caution's own instruction — "do not infer its backing
  view or RPC is dead" — was checked against production data, not
  inferred:** `compliance_score_snapshots` (the table `v_compliance_score_
  latest` reads and `calculate_compliance_score` RPC writes) has 0 rows,
  ever, and no `cron.job` invokes the RPC. This feature has never actually
  computed a score for any tenant/package from any path — no frontend
  caller, no cron, no data. Retired the 2 frontend files only;
  `calculate_compliance_score`, `v_compliance_score_latest`, and the
  empty `compliance_score_snapshots` table are deliberately left
  untouched — their own retirement needs separate Edge/schema
  authorization.
- **P6-B `usePackageUsage.tsx` + `useCompletionEligibility.ts` retired; a
  real stale-worktree process-integrity finding surfaced along the way.**
  `usePackageUsage.tsx` (266 LOC): zero repo-wide imports; its "compare
  behavior before retirement" caution was checked, not skipped — the live
  `usePackageUsageQuery.tsx` calls the identical three RPCs
  (`rpc_get_package_usage`, `rpc_check_package_thresholds`,
  `rpc_dismiss_alert`), and `useTenantPackages.ts` also shares them,
  confirming true functional supersession. While verifying this, the
  dead-code register's own §7bis (dated 2026-09-05) was found to contain
  **two wrong "confirmed live" corrections** — for this exact
  `ComplianceScoreBreakdown`/`useComplianceScore` pair (already retired
  earlier today, before this contradiction was caught) and for
  `useCompletionEligibility.ts` (claimed live via `useCompletionCascade.ts`).
  Root cause: §7bis's checks were run against commit `a0cf450b5`, labeled
  as "current `origin/main`" but actually the exact commit the still-open
  `.claude/worktrees/any-retirement-batch6` worktree (branch
  `hotfix/p2p5-any-batch84`) sits on — a branch cut *before* 2026-08-27's
  dead-code batches 4/12 and 11/12 deleted every one of §7bis's claimed
  live callers (`useCompletionCascade.ts`, `ComplianceScoreCard.tsx`,
  `CompletionSummaryModal.tsx`). Both `git merge-base --is-ancestor` checks
  against those deletion commits and fresh repo-wide greps confirmed all
  three files were genuinely dead. Corrected §7bis, the dependent
  `execution-efficiency-log.md` note, and this plan's own earlier P6-B
  entry accordingly — a third, distinct false-verification root cause this
  session (stale/diverged worktree mistaken for `origin/main`, not the
  earlier two sessions' "already-removed caller, claim made later
  anyway" pattern). `useCompletionEligibility.ts` (39 LOC) retired
  frontend-only; its `v_completion_eligibility` view is untouched.
  **Correction (2026-09-08):** the flag added here that the same §7bis
  section's `StageCellEditor`/`MembershipGrid.tsx` finding "hasn't been
  independently re-verified and could carry the same risk" was itself
  wrong — checking the dead-code register directly shows that finding
  was already fully actioned in
  [PR #686](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/686)
  (merged 2026-09-05), predating this session's dead-code work entirely,
  with its own live-verified Playwright pass and a "no other file touched
  across batches 71-81 turned up as unreachable" close-out note. The
  StageCellEditor risk was never live; this flag was raised without first
  checking whether the register already resolved it.
- **P6-B `usePortfolioCockpit.ts` retired, decision preserved.** Zero
  repo-wide imports; its consumer `PortfolioTable.tsx` and the related
  `ConsultantAssignmentCard.tsx` were already deleted 2026-08-27 (dead-code
  batches 8/12 and 11/12) — independently confirmed orphaned even earlier,
  in `docs/audit-log/entries/2026-07-27-csc-assignment-silent-failure.md`,
  predating and unrelated to this session's stale-worktree §7bis findings.
  Per this cohort's own instruction, the old policy this hook encoded
  (restricting the portfolio view to a non-staff user's own assigned-CSC
  tenants) is preserved in the dead-code register rather than lost with
  the code — current live behavior (the real triage dashboard) shows the
  full portfolio to all staff, a deliberate difference from this old,
  unreachable model. All of its Supabase calls are on shared
  views/tables also used by the live triage dashboard — no backend object
  retired.
- **P6-B `useStageReleases.tsx` retired, backend objects confirmed
  partially live.** Zero repo-wide imports (fresh check in this batch's
  own worktree, not carried over from an earlier one — see the §7bis
  stale-worktree lesson above). Its "calls server objects" caution was
  checked, not skipped: `create_stage_release`, `release_to_tenant`, and
  `generate-release-documents` have no other frontend caller and their
  liveness is unconfirmed either way, but `send-stage-email` **is** still
  called elsewhere (`src/hooks/useEmailTemplates.tsx`, direct `fetch` to
  the Edge Function URL) — confirming the caution's exact concern, not a
  hypothetical one. Retired the frontend hook only; the
  `stage_releases`/`stage_release_items` tables, the two RPCs, and both
  Edge Functions are all deliberately left untouched pending their own
  backend-impact review.
- **P6-B `useMeetingSeries.tsx` retired, live replacement confirmed.**
  Zero repo-wide imports, fresh check in this batch's own worktree. Its
  "calls server objects" caution was checked, not skipped: the
  `eos_meeting_series` table has real production data (8 rows, no cron
  job references it) and all 5 RPCs it called (`create_meeting_series`,
  `update_meeting_series`, `generate_series_instances`,
  `start_meeting_instance`, `complete_meeting_instance`) have no other
  frontend caller — none of that backend was touched. Sibling comparison
  found `useEosConfigMeetingActions.tsx` (Stage 2 "type + date only"
  scheduling, M6/M8 migrations) is the live functional replacement — it
  calls `create_meeting_from_configuration`/`sync_meeting_to_configuration`/
  `skip_meeting_occurrence` and invalidates the same `eos-meeting-series`/
  `eos-meetings` query keys, the same supersession pattern as
  `usePackageUsage`→`usePackageUsageQuery`. The shared `eos_meetings`
  table this hook also read is untouched and remains heavily used
  elsewhere (`useNextMeeting`, `useEosReadiness`, `useEosHealth`,
  `LiveMeetingView.tsx`, etc.).
- **P6-B `useMeetingMinutes.tsx` retired, backend confirmed genuinely
  unused (not merely orphaned).** Zero repo-wide imports, fresh check in
  this batch's own worktree. Its "calls server objects" caution was
  checked, not skipped: `eos_meeting_minutes_versions` and
  `eos_minutes_audit_log` are both empty (0 rows) in production, no cron
  references either, and all 6 RPCs it called (`save_meeting_minutes`,
  `finalise_meeting_minutes`, `create_minutes_revision`,
  `lock_meeting_minutes`, `unlock_meeting_minutes`,
  `restore_minutes_version`) have no other frontend caller — unlike
  `useStageReleases`/`useMeetingSeries`, this backend was never actually
  used. **Separate finding, flagged not fixed:** `MeetingExecutionPanel.tsx`
  still links to `/eos/meetings/:id/minutes` and `/eos/meetings/:id/attendance`,
  neither of which is a registered route — pre-existing dead links this
  retirement doesn't create or worsen; building the missing pages or
  removing the links is a product decision, left to the dead-code register.
- **P6-B `useKpiReview.tsx` retired, genuine product gap uncovered (not
  just orphaning).** Zero repo-wide imports, fresh check in this batch's
  own worktree. `kpi_reviews`/`kpi_review_signoffs` each have 1 real row
  (no cron references) and a live sibling — `MyKpiSignOffSection.tsx`
  (routed via `MyKpiDashboardPage.tsx`) — reads/inserts into the same two
  tables directly, for the *subject*-side view/sign-off flow. But
  `compute_kpi_overall_status`, `upsert_kpi_review`, and the `locked_at`
  lock action (the *reviewer*-side create/edit path) have no caller
  anywhere else — this hook was the only frontend path to create or lock
  a review. `MyKpiDashboardPage.tsx` links to `/admin/kpi-review` ("Open
  reviewer view"), and `ProtectedRoute.tsx` carves out `/admin/kpi-*` for
  `kpi_role === 'reviewer'` users, but no such route is registered
  anywhere — the reviewer-side page this hook backed appears removed or
  never finished, independent of this retirement. Retiring the
  already-unreachable hook changes nothing (nothing could call it), but
  the reviewer workflow itself is currently broken — whether to rebuild
  `/admin/kpi-review` or formally retire the create/lock RPCs is a
  product decision, recorded in the dead-code register rather than acted
  on here. Both RPCs and `locked_at` left untouched.
- **P6-B `useAISuggestions.tsx` retired, backend confirmed genuinely
  unused.** Zero repo-wide imports, fresh check in this batch's own
  worktree. Its "calls server objects" caution was checked, not skipped:
  `ai_suggestions` is empty (0 rows) in production, no cron references,
  and neither the `ai-generate-suggestions` Edge Function nor the
  `accept_ai_suggestion` RPC has any other frontend caller — the same
  "genuinely never used" category as `useMeetingMinutes`, not merely
  orphaned later. (A same-named `aiSuggestion` prop in
  `QuestionCard.tsx`'s audit-evidence feature is an unrelated
  coincidence.) Edge Function, RPC, and table all left untouched.
- **P6-B `useEosDrafts.tsx` retired, backend confirmed genuinely
  unused.** Exports `useEosVtoDrafts`/`useEosChartDrafts` (register name
  is the filename), both zero repo-wide imports, fresh check in this
  batch's own worktree. `eos_vto_drafts`/`eos_chart_drafts` are both
  empty (0 rows) in production, no cron references, and neither
  `propose_vto_change` nor `propose_chart_change` RPC has any other
  frontend caller. All left untouched.
- **P6-B `useDocumentScan.tsx` retired, live sibling confirmed.** Zero
  repo-wide imports, fresh check in this batch's own worktree. Its only
  server object, the `scan-document` Edge Function, has a live sibling
  caller — `useExcelBindings.tsx` (imported by
  `ExcelBindingStatusBadge.tsx`) independently invokes the same function
  with an equivalent implementation — genuine functional duplication,
  not a dead backend. The Edge Function is untouched and remains live.
- **P6-B `useEngagementAudit.ts` retired, backend confirmed genuinely
  unused — last "data/workflow hooks" zero-inbound candidate closed.**
  Zero repo-wide imports, fresh check in this batch's own worktree. Its
  only server object, `engagement_audit_log` (insert-only), is empty (0
  rows) in production with no cron references and no other caller — the
  same disposition as the already-retired sibling `engagement-guardrails.ts`
  (same never-shipped celebration-governance feature area). Table left
  untouched. Every hook in the original "data/workflow hooks" zero-inbound
  list (§3.3 of the dead-code register) is now retired.
- **P6-B dead-link/broken-feature cleanup, product decisions received
  2026-09-08.** Carl confirmed `/kpi` (`KpiPage.tsx`, "kpi-v2") is the
  canonical live KPI feature — retire anything tied to the old
  "kpi-review" sign-off concept rather than build it out. Retired
  `MyKpiSignOffSection.tsx` (zero repo-wide imports once removed from
  its one caller), the broken "Open reviewer view" link and its
  now-unused `canViewAnyStaff`/`useKpiAccess` wiring in
  `MyKpiDashboardPage.tsx`, and `ProtectedRoute.tsx`'s dead
  `/admin/kpi-*` carve-out. `useKpiAccess.tsx`'s `isReviewer` check
  itself is untouched — it's what powers `/kpi`'s real Team KPI toggle.
  `kpi_reviews`/`kpi_review_signoffs` tables and the create/lock RPCs
  remain deliberately untouched pending their own schema authorization.
  Also removed the dead "View Minutes"/"View Attendance" links (and the
  now-unused `Eye` icon import) from `MeetingExecutionPanel.tsx` — no
  pages will be built for `/eos/meetings/:id/minutes`/`/attendance`.
- **`useClientAICompanion`/`StandardsPicker.tsx` decided: KEEP, both
  earmarked for future work, documented in the register.**
  `useClientAICompanion.ts`'s backend (`client-ai-companion` Edge
  Function, "Phase 17") is a substantial Standards-for-RTOs-2025-gated
  AI companion Carl confirmed is intended for a future client health
  feature — not dead despite zero frontend imports and empty session
  tables. `StandardsPicker.tsx` is a ready-made standards-clause picker
  for the live PDP feature area, never wired into `StaffPdpsPage.tsx`'s
  form. Investigating the compliance-score item below surfaced the same
  pattern a second time: `calculate_compliance_score` is a real,
  sophisticated composite scoring engine (phase completion,
  documentation coverage, risk health, consult health, plus
  staleness/critical-risk/missing-docs caps) computed from genuinely
  live tables, not a stub — Carl confirmed **keep** this too, same
  reasoning as the AI companion, not a retirement candidate. Full
  rationale for all three recorded in the dead-code register.
- **P6-B `document_links`/`document_link_audit` backend retired, Carl
  explicitly authorized 2026-09-08.** Both 0 rows, ever; the frontend UI
  was already retired 2026-09-07; the live document-stage-linking
  feature was superseded from day one onto the differently-named
  `document_stage_links` table (678 rows, untouched). Guarded migration
  (`20260908010000_retire_document_links.sql`) dropped both tables plus
  the `update_document_links_updated_at` trigger function; postflight
  confirmed. `link-sharepoint-document`'s source and config entry
  removed from the repo — the deployed Edge Function itself stays
  ACTIVE but unreachable (no `delete_edge_function` MCP tool available;
  manual dashboard deletion is a disclosed follow-up, not done here).
  `merge_tenants()`'s defensive per-table loop references `document_links`
  and will log a harmless `document_links_error` on future tenant merges
  instead of failing — disclosed, not fixed. No allowlist entry needed
  (pure DDL, no risk-category match in `audit-migrations.mjs`). Audit
  entry: `docs/audit-log/entries/2026-09-08-retire-document-links.md`.
- **Not yet started:** P2-QA (not blocked by P1-C; its broader layered-QA
  coverage-programme scope is separately scheduled after the proof — see
  `qa-environment-and-coverage-strategy.md`, not the master plan's unrelated
  "Packet P2: feature boundary pilot"), the rest of P3-A item 1 (the wider consumer graph
  above — `rpc_portfolio_client_health()`, Ask Viv fact builder,
  compliance-assistant, executive views) — **P4-D is fully closed**
  (#3/#4/#10/#14/#15/#16/#18 all done 2026-09-08), `InviteUserDialog.tsx`'s
  bounded cross-schema adapter (P5-A item 3), the rest of P6-B (SeatCard
  display core — blocked on missing Playwright coverage), P7 — several of
  these require live-schema investigation, product/security decisions, or
  their own separately authorized packets per §1's rules.

Current `origin/main` state after all merges to date (P0/P1/P4-A/P6-A/P1-C
steps 1–5): 128 errors (all `no-explicit-any`), 43 warnings, 240 routes/0
duplicates, typecheck 0 errors. The P6-A retirement's own drop from 166→128
errors and 243→240 routes reflects the retired page's own `any` findings
and its 3 removed routes, not a regression. **All three P5-A batches
(#967, #968, #970), P4-B/P6-B (#975), and P4-C (#976) have now merged** —
this brings the count to 3 (128 minus 125 across the three P5-A batches) —
the residual 3 being `generate-meeting-recurrence` (1, deliberately
excluded from typing scope, tied to its own L10 #25 auth-review packet —
that packet's auth gate was added in P3-A item 3/PR #979, but the file's
`catch (error: any)` itself was left untouched as out of scope for a
security-only fix) and `InviteUserDialog.tsx`/`AddWorkboardItemDialog.tsx`
(2, per §8's own P5-A item 2-3). **`AddWorkboardItemDialog.tsx`'s
reachability question is now resolved**: retired 2026-09-07 as part of
P6-B's Workboard UI cluster retirement (§3.2) — confirmed genuinely dead,
zero repo-wide references, with a live successor UI
(`ClientActionItemsTab.tsx`) still managing the same `client_action_items`
table. `InviteUserDialog.tsx`'s bounded cross-schema adapter remains not
started. The route count (240) and
retirement history above are current as of the P4-B/P6-B retirement noted
above — this whole paragraph's error/warning counts are otherwise a
snapshot around #970's merge and not re-verified against every later commit;
re-run `npm run lint:ratchet`-adjacent full-repo lint before trusting the
exact numbers if it's been a while.

**2026-09-08 — full-repo lint reconciled, confirms the count above.** Fresh
`npm run lint` + `npm run lint:baseline` at `origin/main@e5930f908` (after
all P6-B zero-inbound retirements this session): **2 errors, 44 warnings**
(46 problems; `lint-baseline.json` — regenerated — tracks 42 rule-attributed
findings, 2 errors/40 warnings, the other 4 warnings being ruleId-less
"unused eslint-disable directive" notices). The 2 errors are exactly the
two this paragraph already named (`generate-meeting-recurrence`,
`InviteUserDialog.tsx`) — no new `any` regressions since #970. Full
reconciliation against §2's original 173/166/39 baseline table, and
`AGENTS.md`'s now-corrected "~4,100 pre-existing eslint errors" line, is
recorded in §2's own reconciliation note. `AddWorkboardItemDialog.tsx`'s
resolution above still stands.

> **Lint-status reconciliation:** the 128-error paragraph above is retained as
> a historical checkpoint from the pre-P5-A merge sequence. The current
> 2-error/44-warning result is authoritative; `AddWorkboardItemDialog.tsx` is
> retired, not residual debt.

## Packet completions

Retrospective "what happened" narrative that was originally embedded inline inside each packet's own definition in the plan, moved out here verbatim so the plan stays forward-looking/current-state only. Organized in the order the packets appear in the plan; each packet's own section there now carries a one-line `**Status:**` pointer back to this file.

### Packet P1-C — isolation suite hardening

Live proof is complete in run
[`34179875080`](https://github.com/vivacityrto/unicorn-cms-f09c59e5/actions/runs/34179875080).

### Packet P4-B — invalid relationship reads

**Status (2026-09-07): done, pending merge.** #5 and #8 fixed via the
two-step-fetch pattern (batched `Map` lookups, `pg_constraint`-verified no
real FK exists, matching the pattern `GeneratedDocumentsTab.tsx` already
used). #17 turned out to be dead code — see the P6-B retirement below and
`dead-code-feature-consolidation-investigation.md` §7quater; no
separate fix was made or is needed. Live evidence: #5's fixed query and
#17's retirement redirects verified with zero console errors; #8's dialog
could not be opened live (`package_stage_documents` has zero non-deleted
rows in production for any stage right now — pre-existing, unrelated to
this PR) so it rests on static verification only, disclosed as a coverage
gap.

### Packet P4-C — identity and lookup reads

**Status (2026-09-07): done, pending merge.** All three fixed — none needed
a decision packet, the correct identity model was confirmed live via
`pg_constraint`/`pg_get_functiondef` in every case:
- **#20** (`useProcessAuditLog`): two-step fetch against `public.users` by
  `user_uuid` (kept in sync with `auth.users.id` by the
  `link_auth_user_to_profile` trigger), matching `useStageAuditLog.tsx`'s
  existing pattern for the same actor-resolution problem.
- **#21** (`EditTimeDialog.tsx`/`AddTimeDialog.tsx`): fixed the wrong
  `tenant_users.user_uuid` → `user_id` column, plus a second bug found
  alongside it — `EditTimeDialog.tsx`'s "Person" select was wired to the
  wrong state (`vivacityStaff` instead of the already-merged `teamMembers`),
  so even a correct query would never have surfaced tenant contacts there.
- **`AddTimeDialog` note-insert** (unnumbered, L10's "also found" list):
  `notes.client_id`/`package_instance_id` aren't real columns; replaced
  with the real `parent_type`/`parent_id`/`package_id` shape, matching the
  existing convention in `useNotes.tsx`'s `createNote` and
  `ClientStructuredNotesTab.tsx` — an existing established mapping, not a
  guess.

Live-verified on Demo RTO (tenant 7547): #20 against a real process with 10
audit entries; #21's Person/Notify dropdowns now list all 7 real tenant
contacts; the note-insert fix end-to-end (real time entry + linked note
created, verified via SQL, then deleted). Zero console errors throughout.
Full detail: `l10-real-bugs-found.md` items #15/#20/#21 and the
execution-efficiency log's P4-C entry.

**Parked, not part of this packet:** live-verifying these dropdowns
surfaced that `public.users` person-pickers list system/bulk-operation/
test accounts unfiltered alongside real people (e.g. "Bulk Generate",
"Test", "Ghost", "K_Account" all appeared next to real staff/tenant
contacts in the Notify dropdown). Logged as RBAC v6 plan §13 item 14 — a
council-scoped decision, explicitly deferred by Carl, not actioned here.

### Packet P4-D — schema/product decision queue

**#3/#4 done 2026-09-08 (single migration, no design ambiguity needed —
both had one clear fix already identified in the L10 register).** Added
a `stages_id_seq` default to `stages.id` (matching the existing
`tenants.id` convention) and widened `packages_status_check` to allow
`'archived'`. Neither needed a frontend code change (both inserts
already omitted `id`; `archivePackage()` already set the right status
string). A second, previously-undocumented occurrence of #3's bug was
found and fixed in the same migration: `useStageDuplication.tsx`'s
"Duplicate Stage" flow had the identical missing-default failure.
Audit entry: `docs/audit-log/entries/2026-09-08-fix-stages-id-and-package-archive.md`.

**#16 done 2026-09-08, also no design ambiguity — a single mechanical
type mismatch.** `fn_academy_enrollment_lesson_detail`'s `RETURNS TABLE`
declared `video_id` as `text`, but `academy_lessons.video_id` is
genuinely `uuid` — every call had always errored (`42804`), so the
Enrolment Progress drawer's Lessons section always showed empty.
Confirmed via `information_schema` that `video_id` was the only
mismatched column of 16. Dropped and recreated the function with the
corrected type, re-granting the same three roles' `EXECUTE` privilege.
Verified live by extracting the function's own `RETURN QUERY` SELECT and
running it directly against a real enrolment — real lesson rows
returned correctly. No frontend change needed. Audit entry:
`docs/audit-log/entries/2026-09-08-fix-academy-lesson-detail-video-id-type.md`.

**#14 done 2026-09-08 — also turned out to need no design decision.**
The L10 register's framing (needs "a new integer/text audit-events variant
column, a lookup table, or accepting that stage-entity audit events use a
different logging path") was wrong on investigation: the correct pattern
(`entity_id: crypto.randomUUID()`, real numeric id kept in
`details.stage_id`) already existed and worked elsewhere in the same
codebase (`AdminStageDetail.tsx`'s other audit calls,
`useStageTemplateContent.tsx`'s own `logStageTemplateAudit()` helper) —
it just wasn't applied consistently. Scope was also undersold: the same
bug existed in ~15 call sites across 10 files, not the single
archive/restore call site originally documented. Applied the existing
correct pattern to every remaining broken site (frontend-only, no
migration) and fixed `useStageAnalytics.tsx`'s matching read-side
assumption. Audit entry:
`docs/audit-log/entries/2026-09-08-fix-stage-audit-entity-id-mismatch.md`.

**#15 done 2026-09-08 — also no design decision needed once the schema was
checked directly.** The L10 register's "correct source column is unclear"
framing pointed at `tenants.unicorn1_id`, a red herring — a different id
space entirely (the old Unicorn1 system's own row number). The real
answer was `clients_legacy.tenant_id`, a `bigint` FK straight to
`tenants.id`, fully populated and 1:1 across all 11 `clients_legacy` rows.
Fixed `GeneratedDocumentsTab.tsx`'s broken `tenants.select
('client_legacy_id')` query (a column that has never existed on
`tenants`) to query `clients_legacy` by `tenant_id` instead.
`TenantDocuments.tsx` (this item's other documented occurrence) no longer
needed the fix — independently retired as dead code in an earlier PR
(`479972a21`). Audit entry:
`docs/audit-log/entries/2026-09-08-fix-excel-generation-legacy-client-lookup.md`.

**#10 investigated 2026-09-08, confirmed to be real feature work (not a
bounded fix), scoped with Carl, then built the same day.** Confirmed via a
full-repo search that no outbound "create Outlook event" capability
existed anywhere — every Graph calendar call was read-only, and the
requested OAuth scope was `Calendars.Read` only. Carl approved building it
after reviewing the scope (new `Calendars.ReadWrite` scope + one-time
reconnect for 13 existing connections, new `create-event`/`cancel-event`
actions in `sync-outlook-calendar` following `send-email-graph`'s proven
outbound-Graph-call pattern, never blocking scheduling/cancelling on a
Graph failure — a visible notice instead of the old silent no-op) and
explicitly asked to skip live Playwright verification ("I don't want to be
making live calendar data" — any real-usage issue gets fixed then). Fixed
the original ordering bug for real: the local `calendar_events` row is now
inserted fully populated from the real Graph response, never as a
placeholder beforehand (that ordering is exactly what made the original
insert always fail its `NOT NULL` constraints). Audit entry:
`docs/audit-log/entries/2026-09-08-add-outbound-outlook-calendar-invites.md`.

**#18 done 2026-09-08 — the tenant-assignment question was deliberately
separated from the schema fix.** Carl asked for a breakdown of the feature/
bug/reason first, then investigated the 72 tenant-less `public.users` rows
further before deciding: confirmed live they're not one homogeneous "staff"
population — ~61 genuine internal Vivacity staff, 4 real external
client-domain users who appear genuinely orphaned from any tenant, 6
test/dev noise. Carl deferred *who* should be assigned to a real tenant
(e.g. the internal "Vivacity Coaching & Consulting" tenant) to the
architectural redesign/RBAC v6 plan — parked in both
`docs/kb/reference/tenant-operating-model-data-architecture-plan-2026-09-02.md`
§18 item 14 and `docs/kb/reference/rbac-v6-authorization-implementation-plan-2026-09-01.md`
§13 item 15 — then authorized the originally-scoped fix regardless of that
open question: allow `NULL tenant_id` (the "Allow NULL" option, not a
separate tenant-less path or hiding the UI). Made `tenant_id` nullable,
added a partial unique index so a second NULL-tenant save updates rather
than duplicates, and fixed both RPCs' `= v_tenant_id` comparisons (never
`TRUE` for `NULL`) to `IS NOT DISTINCT FROM`, branching the upsert's
`ON CONFLICT` target on tenant presence. Verified live via JWT
impersonation in a rolled-back transaction. Also fixed an unrelated
pre-existing bug in `scripts/audit-migrations.mjs` found while shipping
this — `data-mutation`/`destructive-mutation` findings from a plain
INSERT/UPDATE/DELETE/TRUNCATE never carried a `targetProject`, making them
structurally impossible to allowlist; fixed narrowly with 2 new regression
tests, no effect on the URL/cron/http-call categories. Audit entry:
`docs/audit-log/entries/2026-09-08-allow-tenant-less-notification-prefs.md`.

**All seven P4-D items are now done.** The P4-D schema/product-decision
queue that opened this section is closed.

### Packet P6-B — remaining proven retirement cohorts (title/document route-tree cohort)

**Cohort done, 2026-09-07 (surfaced by P4-B, not from the named-cohort list
above): `/tenant/:tenantId/document(s)...` route tree.**
`TenantDocuments.tsx`, `TenantDocumentsHub.tsx`, `TenantDocumentDetail.tsx`,
`TenantDocumentDetailWrapper.tsx` + 3 routes retired as zero-inbound —
exhaustive `navigate()`/`Link to=`/route-manifest sweep found no real entry
point, and the live equivalent (`ClientDetail.tsx`'s embedded Documents
tab) was already fixed independently. Full writeup:
`dead-code-feature-consolidation-investigation.md` §7quater.
Before/after metrics: 1,727→1,724 tracked files, 490,147→489,187 physical
lines (−960). No backend object removed — `documents`,
`document_versions`, `document_stage_links` all remain live schema used by
the real equivalent.

### Packet M2 — controlled retirement of legacy audit jobs

**Completed 2026-09-07:** the
production migration is recorded as `retire_legacy_audit_cron_jobs`; postflight
found zero retired jobs and 24 active jobs. Historical run records remain.

### Packet M3-A — retire the three legacy database functions

**Completed
2026-09-07:** migration `retire_legacy_audit_functions` was applied and
postflight passed; no table, outbox, or cron state changed.

### Packet M3-C — drop `notification_schedule` after dependency proof

**Completed 2026-09-08:** migration `retire_notification_schedule` was
applied and recorded as `20260908031729`; postflight found the relation absent,
both keeper tables intact, and zero remaining database function/view/cron
references. The repository includes a schema-only rollback script.

### Packet M4 — forecast and health output integrity

> **Historical packet note:** Session 12 below records the implementation
> preflight. It is superseded for current status by Sessions 21–22: stage-health
> job 15 was paused and workload forecast job 14 was retired. No deployment
> decision remains open for those retired schedules; replacement metric work is
> owned by the Client Health plan.

**Session 12 status (2026-09-07): H0.0 containment implemented; jobs 14/15
output-health checks implemented; deployment and dashboard Playwright evidence
remain open.** The affected frontend surfaces now show an explicit
“Unavailable — data repair in progress” state, and the stage-health filter and
Ask Viv hotspot tool no longer present the legacy labels as trustworthy. The
nightly stage-health and workload functions now return a visible `503` when
input/output counts do not reconcile or an insert fails, and include an
`output_health` payload on successful/not-applicable runs. No production
deployment was performed for this M4 code in this session.

### Packet M5 — environment-safe migration replay

> **Historical packet note:** Session 12 below concerns the failed
> `tenant-isolation-qa` branch and is retained for auditability. The current
> target is the dedicated `unicorn-qa` project (`qfpxvumcrnzrjyvqkicq`), whose
> schema-only baseline and parity evidence are recorded in Session 15 and the
> QA baseline cutover document. The failed branch is not a replay target.

**Session 12 preflight (2026-09-07): blocked at strategy selection, with
read-only evidence captured.** The dashboard-created `tenant-isolation-qa`
branch (`iqichbimamlyjpaguddl`) is not actually persistent or Git-linked and
remains `MIGRATIONS_FAILED`; it has 17 migrations
through `20260714074812`, while production has 329. The first unapplied
migration is `20260714074920_enable_retention_and_risk_forecast_cron`, whose
`cron` dependency and production URL make blind replay unsafe. The branch
reports `preview_project_status=ACTIVE_HEALTHY`, but that is not evidence of a
migration-complete schema. No reset, rebase, migration marking, extension
enablement, or data/schema write was performed.

**Session 13 implementation (2026-09-07): repository guard added.** The
baseline cutover procedure is documented in
`../codebase-state/qa-baseline-cutover-2026-09-07.md`. The new
`scripts/validate-qa-baseline.mjs` validator and `qa:baseline:validate` script
require a verified, non-production, cron-free baseline with controlled
forward-sync metadata. This is a metadata guard only; it does not mutate
Supabase or claim schema parity. Hosted branch recreation remains blocked until
the manifest is captured and the migration-history cutover is approved.

> **Supersession note:** the historical Session 14 wording below predates the
> applied QA capture. Session 15 above is authoritative for current baseline
> status and replaces its `pending-capture`/"not attempted" statements.

**Session 14 baseline capture (2026-09-07): read-only production evidence
recorded.** The capture found 8 extensions, 662 tables, 136 views, 670
functions, 486 triggers, 1,966 policies and 2 publications; the migration
ledger now contains 332 entries through `20260907052028`. The P1-C critical
surface (`conversation_participants`, `messages`, `tenant_messages`,
`tenants`, `users`) is present with RLS enabled and 23 critical policies. The
organization review found no suitable existing QA project: `vivacity-au` has
only three migrations, while `ComplyHub Project` has a different schema and 49
cron jobs. The manifest remains `pending-capture` until a detailed inventory
and a real QA parity check exist. Hosted creation is not attempted because
Supabase branch creation replays the historical migration tree and would hit
the known cron/production-URL failure again.

### Packet M6 — P1-C QA authorization and isolation proof

> **Current status (2026-09-08):** M6 is technically complete for the live
> proof. The protected workflow exercised all 15 RLS tests with unique-run
> cleanup and zero residue. The repository-to-environment secret move and
> repeat-run administrative tail were intentionally waived by Carl (session
> 23); this is a recorded governance exception, not an untracked blocker.
