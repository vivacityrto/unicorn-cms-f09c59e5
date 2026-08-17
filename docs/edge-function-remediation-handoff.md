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
| PR #325 — deployment-drift audit | Open; documentation only | Codex | Check/fix CI and request Carl's explicit merge approval. |
| UUID stubs `e77f4567-…`, `dcd6c745-…`, `c22daa64-…` | HTTP 410, no credentials | None | Leave unchanged; already documented. |
| PR #328 — A1 edge function source capture | Open; documentation + source capture only, no deploy | Claude Code | Do not merge until Carl reviews the flagged `schedule-task-reminders` open-write finding and the `_shared/cors.ts` drift note. |
| PR #329 — A2 edge function source capture | Open; documentation + source capture only, no deploy | Claude Code | Do not merge until Carl reviews the flagged `admin-authorization.ts` stale-comment note and the `validate-ai-assist` broad-role note. |
| PR pending — A3 edge function source capture | Open shortly; documentation + source capture only, no deploy | Claude Code | Do not merge until Carl decides U1 (`create-client-audit`) and reviews the `generate-audit-report` legacy-schema note. |

## Codex workstream — workflow safety and focused hardening

| ID | Task | Status | Acceptance criteria |
|---|---|---|---|
| C1 | Verify the lifecycle of `assign-package-to-tenant` | In progress | Confirm every real caller/replacement, including any operator or external caller. Record evidence. No merge or further production change without positive verification. |
| C2 | Validate `backfill-vimeo-durations` | Complete — PR #324 | Academy Builder sends `batchSize: 200` and consumes `updated`, `skipped`, `errors`, and `remaining_null`; production v25 exactly matches PR source; active Super Admin gate and 1–200 bounded batch verified. PR checks are all passing (17 Aug). Await Carl's explicit merge approval. |
| C3 | Capture and harden `test-mailgun` | Complete — PR #326 | Captured exact production v55 source, replaced only wildcard CORS with shared `corsHeaders(req)`, and retained token validation, Super Admin gate, request shape, Mailgun send, and audit log. Deployed as v56; deployed `index.ts` and helper exactly match PR source. Await Carl's explicit merge approval. |
| C4 | Verify `academy-backfill-course-thumbnails` workflow | In progress — PR #327 | Exact production v3 source is captured and wildcard CORS was replaced without changing the Super Admin/full-backfill contract; production v4 exactly matches PR source. The operator entry point remains unverified, so the function stays active and no lifecycle/batch redesign decision is made. |
| C5 | Platform advisor follow-up | Pending | Separate application fixes from console/provider tasks: Postgres security patch level, OTP expiry, and `pg_net` schema exposure. Document any item requiring Carl/Supabase dashboard action. |

## Claude Code workstream — source reconciliation, no lifecycle changes

**Constraint:** Claude captures and compares source only. It must not retire or
deploy a function in this workstream. Open small PRs grouped by compatible
runtime/shared-helper dependencies.

| ID | Deployed function(s) | Status | Acceptance criteria |
|---|---|---|---|
| A1 | `get-email-status`, `report-delivery-issue`, `invite-to-tenant`, `schedule-task-reminders` | Captured — Claude Code, PR #328 (`hotfix/edge-fn-a1-source-capture`), open, not merged. | Pull exact deployed source; add it under `supabase/functions`; identify caller/auth model; document source hash/version and any behavior difference. |
| A2 | `import-vimeo-training`, `admin-change-password`, `record-completed-audit`, `validate-ai-assist` | Captured — Claude Code, PR #329 (`hotfix/edge-fn-a2-source-capture`), open, not merged. `record-completed-audit` was already reconciled/hardened/merged before this task (PR #321). | Same capture/compare process. Preserve explicit custom authentication where present. |
| A3 | `generate-audit-report`, `create-client-audit`, `export-pdp-audit-pack` | Captured — Claude Code, branch `hotfix/edge-fn-a3-source-capture`, PR pending. See "A3 capture notes" below. `create-client-audit` NOT narrowed — awaiting Carl's U1 decision. | Capture exact source and map direct UI callers. Do **not** narrow `create-client-audit` until Carl decides which Vivacity roles may create cross-tenant audits. Flag CORS/auth remediation separately. |
| A4 | `tmp-backfill-sharepoint-drive-ids`, `academy-fetch-vimeo-showcase` | Pending | Capture exact source and establish whether each is an active supported operation or an already-retired stub. Do not make lifecycle changes based only on repository absence. |

## Claude Code capture notes

### A1, A2

See PR #328 (`hotfix/edge-fn-a1-source-capture`) and PR #329
(`hotfix/edge-fn-a2-source-capture`) — each carries its own copy of this
section since they were cut before this A3 branch. Headlines: `get-email-status`/`report-delivery-issue`
build an anon Supabase client without forwarding the caller's Authorization
header (their real access is whatever an unauthenticated `anon` role gets
under `FORCE ROW LEVEL SECURITY` + `is_super_admin()` policies — likely
always-anonymous in practice); `schedule-task-reminders` has no in-function
caller-identity check at all; `invite-to-tenant`/`schedule-task-reminders`/
`admin-change-password`/`validate-ai-assist` all import the shared
`_shared/cors.ts` (or their own bundled snapshot of it) as a static object,
which is now a request-aware function in the tracked repo copy; and the
tracked `_shared/admin-authorization.ts` has a stale "historical/unused"
header comment despite `admin-change-password` still depending on it.
`record-completed-audit` was found already fully reconciled and merged
(PR #321) before this task reached it.

### A3 — `generate-audit-report`, `create-client-audit`, `export-pdp-audit-pack`

Status: all three captured verbatim from production and added under
`supabase/functions/<slug>/index.ts`. No behaviour, auth, or CORS change.
`create-client-audit` is **not narrowed** — its broad-role finding is
already known (see baseline U1) and stays exactly as deployed pending
Carl's decision.

| Function | Deployed version | `verify_jwt` | SHA-256 of captured `index.ts` | Tracked frontend/RPC caller found? |
|---|---|---|---|---|
| `generate-audit-report` | 19 | false | `63a77ec42403add20fdb7aae6395369d6546ad5a972d0ec0dc5d7dfb0c6cbcfb` | None in `src/`. Operates on `compliance_audits`/`compliance_templates`, which have **0 rows** in production. See U5 above. |
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

## Carl decisions / workflow checks needed

| ID | Decision or check | Why it matters |
|---|---|---|
| U1 | Which Vivacity roles may create a client audit for a different tenant? | Determines the safe replacement for `create-client-audit`'s broad non-empty-role check. |
| U2 | Exercise/identify the operator entry points for `test-mailgun` and `academy-backfill-course-thumbnails`. | A quiet log window and no tracked UI call cannot prove a manual workflow is retired. |
| U3 | Explicitly approve any PR merge after its checks and review are complete. | Repository rule: never merge to `main` without fresh in-session approval. |
| U4 | Complete any Supabase dashboard/provider actions identified in C5. | These settings cannot be safely changed through repository code alone. |
| U5 | Is `generate-audit-report` still a live workflow, or fully superseded by `generate-client-audit-report`/`generate-client-audit-report-docx`? | It reads `compliance_audits`/`compliance_templates`, which have **zero rows** in production (vs. 19 in `client_audits`, the schema the tracked report generators and `create-client-audit`/`record-completed-audit` all use). Looks legacy, but per the no-retirement rule this needs a workflow decision, not an inference from row counts. |

## Definition of done

1. Every deployed function has a source-controlled home, an explicit current
   410 retirement record, or a documented external ownership exception.
2. Each active privileged function has a verified caller/permission model and
   request-aware CORS.
3. No retirement or authorization narrowing caused a confirmed workflow
   regression.
4. Each production change is traceable to a merged PR, deployed source version,
   and audit entry.
