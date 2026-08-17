# Edge Function remediation handoff

**Last updated:** 2026-08-17
**Purpose:** one shared working record for Codex and Claude Code while
reconciling production Edge Functions with repository source. This is not a
retirement checklist.

## Non-negotiable guardrails

- Work in a dedicated git worktree. Never switch the shared checkout.
- Do not deploy, retire, delete, or replace an Edge Function merely because it
  is absent from `src/`, missing from `supabase/functions`, or quiet in recent
  logs.
- Before a production change, open a focused PR containing the exact source to
  be deployed. After deploy, record the deployed version and verification in
  that PR/audit entry.
- Preserve request and response contracts unless the task explicitly says
  otherwise. Auth/CORS hardening must not remove an operator workflow.
- Update this file before starting a task and after completing it: owner,
  branch/PR, status, evidence, and any newly discovered dependency.

## Current production/PR baseline

| Item | State | Owner | Required next action |
|---|---|---|---|
| PR #323 — `assign-package-to-tenant` | Open; production currently returns 410 | Codex | Do not merge until direct workflow/external-caller verification confirms retirement is safe or a supported replacement is supplied. |
| PR #324 — `backfill-vimeo-durations` | Open; secure UI-compatible version is deployed | Codex | Review contract against Academy Builder, check CI, then request Carl's explicit merge approval. |
| PR #325 — deployment-drift audit | Merged | Codex | Complete. |
| UUID stubs `e77f4567-…`, `dcd6c745-…`, `c22daa64-…` | HTTP 410, no credentials | None | Leave unchanged; already documented. |
| `tmp-backfill-sharepoint-drive-ids` | HTTP 410, self-documented neutralized stub | None | Leave unchanged; now also captured to source under PR (A4) for reconciliation completeness. |
| PR #328 — A1 edge function source capture | Merged | Claude Code | Complete. `schedule-task-reminders` open-write finding and `_shared/cors.ts` drift note remain open observations, not fixed. |
| PR #329 — A2 edge function source capture | Merged | Claude Code | Complete. `admin-authorization.ts` stale-comment note and `validate-ai-assist` broad-role note remain open observations, not fixed. |
| PR #331 — A3 edge function source capture | Merged | Claude Code | Complete. `create-client-audit` broad-role gap and `generate-audit-report` legacy-schema note remain open decision items (U1, U5), not fixed. |
| PR #332 — A4 edge function source capture | Merged | Claude Code | Complete. |
| PR pending — `schedule-task-reminders` cron-invoke auth | Open shortly; auth fix + test + audit entry, **not deployed** | Claude Code | Do not merge or deploy until Carl decides U6 (cron schedule vs retire) and whether to deploy now or hold. |

## Codex workstream — workflow safety and focused hardening

| ID | Task | Status | Acceptance criteria |
|---|---|---|---|
| C1 | Verify the lifecycle of `assign-package-to-tenant` | In progress | Confirm every real caller/replacement, including any operator or external caller. Record evidence. No merge or further production change without positive verification. |
| C2 | Validate `backfill-vimeo-durations` | Complete — PR #324 | Academy Builder sends `batchSize: 200` and consumes `updated`, `skipped`, `errors`, and `remaining_null`; production v25 exactly matches PR source; active Super Admin gate and 1–200 bounded batch verified. PR checks are all passing (17 Aug). Await Carl's explicit merge approval. |
| C3 | Capture and harden `test-mailgun` | Complete — PR #326 | Captured exact production v55 source, replaced only wildcard CORS with shared `corsHeaders(req)`, and retained token validation, Super Admin gate, request shape, Mailgun send, and audit log. Deployed as v56; deployed `index.ts` and helper exactly match PR source. Await Carl's explicit merge approval. |
| C4 | Verify `academy-backfill-course-thumbnails` workflow | In progress — PR #327 | Exact production v3 source is captured and wildcard CORS was replaced without changing the Super Admin/full-backfill contract; production v4 exactly matches PR source. The operator entry point remains unverified, so the function stays active and no lifecycle/batch redesign decision is made. |
| C5 | Platform advisor follow-up | In progress | Fresh 17 Aug classification recorded in `docs/audit-log/entries/2026-08-17-security-advisor-residual-findings.md`: seven RLS no-policy notices are deny-by-default backfill/internal tables; `pg_net` has six live notification/reminder call sites (including triggers) and cannot be safely moved with the available SQL role. Remaining provider work: Supabase Postgres patch level and Auth OTP expiry; no blanket RPC-grant change. |

## Claude Code workstream — source reconciliation, no lifecycle changes

**Constraint:** Claude captures and compares source only. It must not retire or
deploy a function in this workstream. Open small PRs grouped by compatible
runtime/shared-helper dependencies.

| ID | Deployed function(s) | Status | Acceptance criteria |
|---|---|---|---|
| A1 | `get-email-status`, `report-delivery-issue`, `invite-to-tenant`, `schedule-task-reminders` | Merged — PR #328. See "A1 capture notes" below. | Pull exact deployed source; add it under `supabase/functions`; identify caller/auth model; document source hash/version and any behavior difference. |
| A2 | `import-vimeo-training`, `admin-change-password`, `record-completed-audit`, `validate-ai-assist` | Merged — PR #329. See "A2 capture notes" below. `record-completed-audit` was already fully reconciled/hardened/merged before this task (PR #321). | Same capture/compare process. Preserve explicit custom authentication where present. |
| A3 | `generate-audit-report`, `create-client-audit`, `export-pdp-audit-pack` | Merged — PR #331. See "A3 capture notes" below. `create-client-audit` NOT narrowed — awaiting Carl's U1 decision. | Capture exact source and map direct UI callers. Do **not** narrow `create-client-audit` until Carl decides which Vivacity roles may create cross-tenant audits. Flag CORS/auth remediation separately. |
| A4 | `tmp-backfill-sharepoint-drive-ids`, `academy-fetch-vimeo-showcase` | Captured — Claude Code, PR #332 (`hotfix/edge-fn-a4-source-capture`), open, not merged. `tmp-backfill-sharepoint-drive-ids` turned out to already be a self-documented, neutralized 410 stub. See "A4 capture notes" below. **This closes out the Claude Code A1–A4 workstream.** | Capture exact source and establish whether each is an active supported operation or an already-retired stub. Do not make lifecycle changes based only on repository absence. |

## Claude Code capture notes

### A1 — `get-email-status`, `report-delivery-issue`, `invite-to-tenant`, `schedule-task-reminders`

Status: source captured verbatim from production via Supabase MCP
(`get_edge_function`) and added under `supabase/functions/<slug>/index.ts`,
byte-identical to the deployed bundle. No behaviour, auth, or CORS change
applied. `supabase/config.toml` gained two `[functions.*]` entries for the two
slugs whose platform `verify_jwt` is `false` (the other two already match the
project default of `true`, so no entry was needed). Merged via PR #328.

| Function | Deployed version | `verify_jwt` | SHA-256 of captured `index.ts` | Tracked frontend/RPC caller found? |
|---|---|---|---|---|
| `get-email-status` | 103 | true | `1f8e190906f3d1b2e526e5945bd3f1f974c71118d76d1d4ac5832edc34a9fe2b` | None — no match in `src/`, `supabase/`, or git history under any name. |
| `report-delivery-issue` | 101 | true | `93527a6648ba430809627958c78827024a06091992182138e00cf94b72096989` | None — same as above. |
| `invite-to-tenant` | 85 | false | `f09a25ebf782a7da55111d264285eedaa32ebf52be84d3a0366a523d9fb09c44` | None in `src/`. Auth is fully in-function (see below); likely invoked from an admin/ops tool or a UI surface built after the last frontend audit. |
| `schedule-task-reminders` | 80 | false | `f1a8b83f1f1a0aca97f653db0039e58780271d8746f7f1f01bcea8c3086da68e` | None in `src/`. No `pg_cron` job references it either (checked `cron.job.command`). |

None of the four slugs, or any caller of them, has ever appeared anywhere in
this repository's git history (`git log --all -S"<slug>"` returns nothing
before this capture) — this is genuine deployment drift, not a stale grep.

**Auth/permission model per function:**
- `get-email-status`: platform requires a valid JWT to invoke, but the
  handler itself opens a fresh Supabase client with the **anon key** and does
  not forward the caller's bearer token, so the DB query runs as the
  unauthenticated `anon` role. `email_sends`/`email_events` both have
  `FORCE ROW LEVEL SECURITY` with a single `is_super_admin()` policy. Net
  effect: the underlying select is RLS-gated to super admins, and since the
  caller's identity is never forwarded, it likely evaluates as anonymous on
  every invocation — worth an operator smoke-test, not a fix, in this PR.
- `report-delivery-issue`: same anon-key-without-forwarding pattern, inserting
  into `email_delivery_issues`, which is also `FORCE ROW LEVEL SECURITY` /
  `is_super_admin()`-only. Likely has the same anonymous-write RLS interaction
  as above.
- `invite-to-tenant`: verify_jwt is off at the gateway, but the handler
  manually validates the `Authorization` bearer token via
  `supabase.auth.getUser()`, then requires `check_permission(..., "admin.invites.manage", "full")`
  or `has_tenant_admin_safe(tenantId, ...)` before writing with the
  service-role key. This is a correct custom-auth pattern — preserved as-is.
- `schedule-task-reminders`: verify_jwt is off at the gateway **and the
  handler performs no caller-identity check of any kind** — it trusts
  `task_id`/`tenant_id`/`assigned_to`/`due_date` from the raw request body and
  writes to `notification_schedule` and `package_workflow_logs` using the
  service-role key, which bypasses RLS entirely. **Any caller who has the
  function URL, authenticated or not, can currently create arbitrary
  notification/workflow-log rows for any tenant.** Flagging this for Carl's
  awareness per the "do not tighten auth in this workstream" guardrail — not
  narrowed in this PR. **Update:** this was picked up as the follow-up's
  highest-priority item and remediated — see "schedule-task-reminders
  cron-invoke auth" below.

**Shared-helper drift (flag, not fixed):** `invite-to-tenant` and
`schedule-task-reminders` both `import { corsHeaders } from "../_shared/cors.ts"`
and use it as a static header object (`headers: corsHeaders`, `...corsHeaders`).
The tracked `supabase/functions/_shared/cors.ts` in this repo has since been
hardened into a **request-aware function**, `corsHeaders(req)`, used by every
other already-tracked function. These two deployed bundles are self-contained
snapshots built from an older, wildcard-CORS copy of that file, so production
is unaffected today — but if either function were redeployed from this
repo/CLI as captured, spreading a function value (`...corsHeaders`) yields no
headers, silently dropping CORS on next deploy. This PR does **not** touch the
shared `_shared/cors.ts` (it's relied on by many already-tracked functions) and
does **not** update these two call sites — flagging only, per the no-CORS-change
guardrail for this workstream. A follow-up, Carl-approved PR should update both
call sites to `corsHeaders(req)` before either function is ever redeployed from
source. **Update:** `schedule-task-reminders`' copy of this drift was resolved
as a side effect of its auth fix (see below) — it now uses a local static CORS
object instead of the shared import, avoiding the bug without adopting the
newer allowlist behaviour. `invite-to-tenant` is unchanged and still affected.

### A2 — `import-vimeo-training`, `admin-change-password`, `record-completed-audit`, `validate-ai-assist`

Status: three of the four functions captured verbatim from production and
added under `supabase/functions/<slug>/index.ts`. The fourth,
`record-completed-audit`, turned out to already be fully tracked, hardened,
and merged to `main` by an earlier, unrelated session — see below. Merged via
PR #329.

| Function | Deployed version | `verify_jwt` | SHA-256 of captured `index.ts` | Tracked frontend/RPC caller found? |
|---|---|---|---|---|
| `import-vimeo-training` | 76 | true | `d7caa775488429cf081da652475f0f5acdd7d926c0cf53aaffb86c299a9d248f` | None in `src/` or git history. A `-S"import-vimeo-training"` hit in an unrelated Lovable prompt-history commit is a scope-boundary mention ("no change to `import-vimeo-training` import path"), not a caller. |
| `admin-change-password` | 48 | false | `2f28c0ccaacb176289d367dcd630a0ef3f4ca870eef0bef68849ef4152bb5c9a` | None in `src/` or git history. |
| `record-completed-audit` | 14 | false | n/a — unchanged; see below | Already reconciled (PR #321, merged to `main`). |
| `validate-ai-assist` | 11 | true | `f2936be12273e521c1861221bded526c820d3f2e46870b7299d31291f675ca7b` | None in `src/` or git history. |

**Important process note — stale local `main` caused a near-duplicate:** this
session's local `main` checkout was 37 commits behind `origin/main` at
session start (per the "no automatic git pulls" session-start rule, it was
never refreshed). An initial existence check against that stale checkout
reported all nine A1–A4 slugs as untracked, including
`record-completed-audit`. After branching this A2 worktree from the current
`origin/chore/edge-function-drift-audit` tip (not the stale local `main`),
writing the captured `record-completed-audit/index.ts` produced a **zero-diff
modification** — the file was already tracked, and the captured production
source is byte-identical to what's already committed. `git log -S` confirms
why: `09f672d8` ("fix: secure completed audit recording") and `9996750a`
("audit: verify completed audit security deployment") already did this exact
capture-and-harden work in an earlier session, shipped as PR #321, and are
merged to `main`. That work required `FeatureKeys.staffInternal`, moved to
request-aware CORS, and is confirmed still matching production at the
current v14 (two silent redeploys since v12, same source). No new source
change was needed or made for `record-completed-audit` in this PR — only
a `supabase/config.toml` entry, since PR #321 didn't add one despite
`verify_jwt` already being `false` in production (see `docs/audit-log/entries/2026-08-17-record-completed-audit-auth.md`
for the original finding/remediation). **Lesson for future sessions in this
workstream:** always check function existence against the branch's actual
base commit (or `origin/main`), not a possibly-stale local `main`.

**Auth/permission model per function:**
- `import-vimeo-training`: verifies the caller's bearer token via
  `supabase.auth.getUser()`, then requires `users.unicorn_role === 'Super Admin'`
  read through a service-role client. Correct pattern, preserved as-is.
- `admin-change-password`: forwards the caller's `Authorization` header into
  a user-scoped client (unlike A1's `get-email-status`/`report-delivery-issue`,
  which build an anon client *without* forwarding the header), reads the
  caller's own profile through that user-scoped client, and gates on
  `canAdministerPasswords` (Super Admin, `user_type` in
  `Vivacity`/`Vivacity Team`, not disabled/archived) before using the
  service-role key to update the target user's password. This is the
  *correct* forward-the-token pattern A1 was missing — worth noting as a
  contrast, not a fix.
  - **Drift note (flag, not fixed):** the tracked
    `supabase/functions/_shared/admin-authorization.ts` carries a header
    comment stating it is "historical … formerly used by `admin-reset-user`
    (now a 410 FUNCTION_RETIRED stub)" and that active flows use
    `check_permission(..., 'admin.team_users.manage', 'full')` instead. That
    comment is **stale**: the currently-active, just-captured
    `admin-change-password` still imports and depends on
    `canAdministerPasswords` from this exact file. The captured function's
    own copy of the helper (`AdminPasswordProfile` type, `Set`-based check)
    is textually different from the tracked one (`AdminAuthProfile` type,
    sequential `if` checks) but logically equivalent — same three
    conditions, same result. Not touched here: this PR doesn't modify the
    already-tracked shared file, only flags that its "historical/dead code"
    framing is incorrect and a future cleanup should not delete it without
    first checking `admin-change-password`.
  - `admin-change-password` also imports `../_shared/cors.ts` as a static
    object, the same drift already flagged for `invite-to-tenant`/
    `schedule-task-reminders` in A1 (PR #328) — not repeated in full here.
- `record-completed-audit`: already hardened to `requireCaller(req, supabase, { featureKey: FeatureKeys.staffInternal, ... })`
  and request-aware `corsHeaders(req)`. No action needed.
- `validate-ai-assist`: forwards the caller's `Authorization` header into a
  user-scoped client (correct pattern), then re-checks the caller has *any*
  non-empty `users.unicorn_role` via a service-role client before allowing
  AI-drafting writes (all flagged `ai_*`, requiring human review before use —
  every write path is a draft insert/upsert, not a direct compliance-record
  mutation). The "any non-empty role" gate is the same broad-check shape
  already flagged for `create-client-audit` (A3, see below), though the
  blast radius here is materially smaller (draft rows only). Flagging the
  pattern for Carl's awareness; not narrowed in this PR. Still imports
  `../_shared/cors.ts` as a static wildcard object from its own bundled
  snapshot (own top-level `_shared/cors.ts`, not the tracked shared one) —
  same drift class as above, not touched here.

### A3 — `generate-audit-report`, `create-client-audit`, `export-pdp-audit-pack`

Status: all three captured verbatim from production and added under
`supabase/functions/<slug>/index.ts`. No behaviour, auth, or CORS change.
`create-client-audit` is **not narrowed** — its broad-role finding is
already known (see baseline U1) and stays exactly as deployed pending
Carl's decision.

| Function | Deployed version | `verify_jwt` | SHA-256 of captured `index.ts` | Tracked frontend/RPC caller found? |
|---|---|---|---|---|
| `generate-audit-report` | 19 | false | `63a77ec42403add20fdb7aae6395369d6546ad5a972d0ec0dc5d7dfb0c6cbcfb` | None in `src/`. Operates on `compliance_audits`/`compliance_templates`, which have **0 rows** in production. See U5 below. |
| `create-client-audit` | 22 | false | `490bf5ea27d10a2cf771dda9105ce0c336ce1b1103dd99bbbe2f07834850fb32` | No literal `functions.invoke('create-client-audit')` match in `src/`, despite many historical Lovable-planning-commit references and two files sharing its request-body field names (`src/hooks/useClientAuditPortal.ts`, `src/components/client/ClientUpcomingAuditSection.tsx`) that likely call it through a shared invoke helper this grep didn't resolve. `client_audits` already has 19 rows, so the function is clearly receiving traffic from somewhere — absence of a literal match is not evidence of retirement. |
| `export-pdp-audit-pack` | 4 | false | `b447243b63caadefa99376b01405461260e63b964919cd76a7bbb34cb8e9880e` | Confirmed: `src/features/pdp/exportAuditPack.ts` calls `supabase.functions.invoke("export-pdp-audit-pack", { body: { tenant_id, user_id? } })`, matching the function's contract exactly. |

**Auth/permission model per function:**
- `generate-audit-report`: verifies the caller's bearer token via
  `supabase.auth.getUser()` (service-role client), then allows internal
  staff (`is_vivacity_internal` or `global_role` in `superadmin`/`admin`) or
  a tenant match against the loaded `compliance_audits` row. Sound pattern
  in isolation, but see the legacy-schema note below.
- `create-client-audit`: verifies the caller's bearer token via a
  **user-scoped** client (correct forward-the-token pattern), then allows
  either (a) `isStaff = !!users.unicorn_role` — **any non-empty internal
  role at all**, not a specific staff/consultant role — or (b) tenant
  membership via `tenant_users`. Path (a) is the known broad check: any
  internal user with *any* `unicorn_role` value can create a `client_audits`
  row naming an arbitrary `subject_tenant_id`, i.e. audit a tenant they have
  no relationship with. This exact shape (any non-empty `unicorn_role`) was
  also the finding already fixed for `record-completed-audit` (PR #321,
  narrowed to `FeatureKeys.staffInternal`) — `create-client-audit` is the
  same class of gap, still open, and explicitly **not fixed here** per U1 and
  the no-auth-tightening guardrail for this workstream. On success it also
  best-effort triggers `research-audit-intelligence` (not part of this A3
  scope; noted only because it's a same-request dependency).
- `export-pdp-audit-pack`: verifies the caller's bearer token via
  `supabase.auth.getUser()` (service-role client), then requires either a
  `tenant_users` row with `access_scope = 'full'` and
  `relationship_role` in `primary_contact`/`secondary_contact` for the
  target tenant, or internal Vivacity admin/SuperAdmin. Properly
  tenant-scoped — no flag.

**Legacy-schema note (flag, not a lifecycle decision):** `generate-audit-report`
reads `compliance_audits`, `compliance_templates`,
`compliance_template_sections`, `compliance_template_questions`,
`compliance_audit_responses`, and `compliance_corrective_actions`. All six
tables still exist, but `compliance_audits` has zero rows in production,
while the parallel `client_audits` table (used by `create-client-audit`,
`record-completed-audit`, and — per the existing tracked functions list —
`generate-client-audit-report`/`generate-client-audit-report-docx`) has 19.
This strongly suggests `generate-audit-report` is a predecessor from before
a schema migration to `client_audits`, superseded by the tracked
`generate-client-audit-report` family. Per the workstream's no-retirement
rule, this is recorded as a flag for Carl/Codex's workflow verification
(U5), not acted on — a zero-row table doesn't prove nothing could still call
it with a stale/manual `audit_id`.

### A4 — `tmp-backfill-sharepoint-drive-ids`, `academy-fetch-vimeo-showcase`

Status: both captured verbatim from production and added under
`supabase/functions/<slug>/index.ts`. No behaviour, auth, or CORS change.

| Function | Deployed version | `verify_jwt` | SHA-256 of captured `index.ts` | Tracked frontend/RPC caller found? |
|---|---|---|---|---|
| `tmp-backfill-sharepoint-drive-ids` | 13 | true | `9bfbb6023bd9afde1b95fe199cd9f1e219b471dc1aa54a256cfde4da7316ca85` | N/A — already a 410 stub, see below. |
| `academy-fetch-vimeo-showcase` | 4 | true | `06b95cd4b297ef06e0807fc6935e4a6ada7b1b44538aaa0f216833ac62f4362e` | None in `src/` or git history. |

**`tmp-backfill-sharepoint-drive-ids` is already retired, self-documented in
its own deployed source.** The live `index.ts` is a comment block explaining
it was a one-off backfill (populated `document_versions.source_drive_item_id`/
`source_site_id` for 26 legacy rows on 2026-07-20), ran successfully, was
verified, and was then replaced with a stub that unconditionally returns
`410` with no data access and no credentials used. This matches the shape of
the three UUID-slug stubs already recorded in the baseline table above — it's
now added here too, purely for source-control completeness (per this
workstream's acceptance criteria), not because anything about its lifecycle
needed deciding. No action taken beyond capturing the stub as-is.

**`academy-fetch-vimeo-showcase` is active and structurally parallel to
`import-vimeo-training` (A2):** same Super Admin gate pattern
(`getUser()` → `users.unicorn_role === 'Super Admin'`), same wildcard inline
`corsHeaders` object (no shared-helper import, so no drift risk here). It
fetches a Vimeo Showcase/album's sections and video list — a read-only
"preview a showcase before importing" step, distinct from the already-tracked
`academy-import-vimeo-showcase` (which presumably performs the write). Created
very recently (per its `created_at`/`updated_at` timestamps, within the last
day or two of this audit) with no tracked caller in `src/` yet — consistent
with a recent Academy Builder addition whose frontend wiring may not have
been captured in this checkout, not with an orphaned/dead function. Not
flagged as a problem; recorded for completeness.

### `schedule-task-reminders` cron-invoke auth (follow-up to A1)

Full evidence in `docs/audit-log/entries/2026-08-17-schedule-task-reminders-cron-auth.md`.
Summary:

- **No caller found anywhere, exhaustively re-checked:** repo, full git
  history, `pg_cron`, every Postgres trigger/function body, edge-function
  logs (24h), and docs. `notification_schedule` (its target table) has **0
  rows** in production. A prior, independent 2026-05-19 survey
  (`docs/audit-log/entries/2026-05-19-notification-system-survey.md`)
  already mapped every writer of `notification_schedule` and didn't include
  this function; the equivalent task-reminder workflow runs via
  `generate-notifications` (cron scope `tasks_obligations`) writing to a
  different table (`user_notifications`) with different semantics.
- **Remediation:** gated on the existing shared `isCronAuthorized` /
  `cronUnauthorizedResponse` pattern (`_shared/cron-auth.ts`), the same one
  already used by `process-notification-outbox`, `process-notification-queue`,
  `generate-notifications`, and `send-action-item-due-reminders`. Chosen
  specifically because it's an established pattern rather than a new
  caller-identity assumption invented for this function. `verify_jwt` stays
  `false`, matching the other four. Added to the `AFFECTED` list in
  `_shared/cron-auth.test.mjs` (12/12 tests passing) instead of a new test
  file, matching how those four are covered. Also dropped this function's
  copy of the `_shared/cors.ts` drift (flagged in A1) by switching to a
  local static CORS object — avoids the bug without adopting the newer
  allowlist behaviour, so this PR changes auth only.
- **Not deployed.** This is a PR-only change pending Carl's review; see U6
  and the deploy-timing question below.
- **Also confirmed (not fixed here):** `get-email-status` and
  `report-delivery-issue` are currently broken for every real caller,
  independent of `verify_jwt`. Both build their Supabase client from the
  anon key only, never forwarding the caller's `Authorization` header.
  `email_sends`/`email_events`/`email_delivery_issues` all have `FORCE ROW
  LEVEL SECURITY` with an `is_super_admin()`-only policy, and
  `is_super_admin_safe(p_user_id)` filters on `user_uuid = p_user_id` — for
  an anon-key connection `auth.uid()` is `NULL`, and that comparison is never
  true, so the policy evaluates false for every caller, including a real
  super admin. `get-email-status` always gets 0 rows back and returns its
  own 404; `report-delivery-issue`'s insert is always RLS-rejected and it
  returns its own 500. This is out of scope for this task; recorded as a
  follow-up decision item.

## Carl decisions / workflow checks needed

| ID | Decision or check | Why it matters |
|---|---|---|
| U1 | Which Vivacity roles may create a client audit for a different tenant? | Determines the safe replacement for `create-client-audit`'s broad non-empty-role check. |
| U2 | Exercise/identify the operator entry points for `test-mailgun` and `academy-backfill-course-thumbnails`. | A quiet log window and no tracked UI call cannot prove a manual workflow is retired. |
| U3 | Explicitly approve any PR merge after its checks and review are complete. | Repository rule: never merge to `main` without fresh in-session approval. |
| U4 | Complete any Supabase dashboard/provider actions identified in C5. | These settings cannot be safely changed through repository code alone. |
| U5 | Is `generate-audit-report` still a live workflow, or fully superseded by `generate-client-audit-report`/`generate-client-audit-report-docx`? | It reads `compliance_audits`/`compliance_templates`, which have **zero rows** in production (vs. 19 in `client_audits`, the schema the tracked report generators and `create-client-audit`/`record-completed-audit` all use). Looks legacy, but per the no-retirement rule this needs a workflow decision, not an inference from row counts. |
| U6 | Should `schedule-task-reminders` get a `pg_cron` schedule (mirroring or replacing `generate-notifications`' `tasks_obligations` scope), or be retired? | No caller or schedule exists today; its target table has 0 rows. The auth fix closes the anonymous-write hole either way, but the function's actual future needs a decision, not an inference. |
| U7 | Should the `schedule-task-reminders` auth-fix PR be deployed now (verifying production parity before merge, as the `test-mailgun`/`academy-backfill-course-thumbnails` hardening PRs did), or held until reviewed? | Deploying an edge function is a real production change; not assumed either way. |
| U8 | Fix `get-email-status` and `report-delivery-issue` to forward the caller's `Authorization` header (the same pattern `admin-change-password`/`validate-ai-assist` already use)? | Both are currently non-functional for every real caller — `get-email-status` always 404s, `report-delivery-issue` always 500s — because their anon-key client never presents any identity to the `FORCE`d, super-admin-only RLS on their tables. Confirmed via the RLS policy and `is_super_admin_safe` definitions; not fixed as part of the `schedule-task-reminders` task. |

## Definition of done

1. Every deployed function has a source-controlled home, an explicit current
   410 retirement record, or a documented external ownership exception.
2. Each active privileged function has a verified caller/permission model and
   request-aware CORS.
3. No retirement or authorization narrowing caused a confirmed workflow
   regression.
4. Each production change is traceable to a merged PR, deployed source version,
   and audit entry.
