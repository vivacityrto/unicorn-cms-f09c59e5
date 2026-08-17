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
| A1 | `get-email-status`, `report-delivery-issue`, `invite-to-tenant`, `schedule-task-reminders` | Captured — Claude Code, PR #328 (`hotfix/edge-fn-a1-source-capture`), open, not merged. See "A1 capture notes" below. | Pull exact deployed source; add it under `supabase/functions`; identify caller/auth model; document source hash/version and any behavior difference. |
| A2 | `import-vimeo-training`, `admin-change-password`, `record-completed-audit`, `validate-ai-assist` | Pending | Same capture/compare process. Preserve explicit custom authentication where present. |
| A3 | `generate-audit-report`, `create-client-audit`, `export-pdp-audit-pack` | Pending | Capture exact source and map direct UI callers. Do **not** narrow `create-client-audit` until Carl decides which Vivacity roles may create cross-tenant audits. Flag CORS/auth remediation separately. |
| A4 | `tmp-backfill-sharepoint-drive-ids`, `academy-fetch-vimeo-showcase` | Pending | Capture exact source and establish whether each is an active supported operation or an already-retired stub. Do not make lifecycle changes based only on repository absence. |

## Claude Code capture notes

### A1 — `get-email-status`, `report-delivery-issue`, `invite-to-tenant`, `schedule-task-reminders`

Status: source captured verbatim from production via Supabase MCP
(`get_edge_function`) and added under `supabase/functions/<slug>/index.ts`,
byte-identical to the deployed bundle. No behaviour, auth, or CORS change
applied. `supabase/config.toml` gained two `[functions.*]` entries for the two
slugs whose platform `verify_jwt` is `false` (the other two already match the
project default of `true`, so no entry was needed).

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
  narrowed in this PR.

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
source.

## Carl decisions / workflow checks needed

| ID | Decision or check | Why it matters |
|---|---|---|
| U1 | Which Vivacity roles may create a client audit for a different tenant? | Determines the safe replacement for `create-client-audit`'s broad non-empty-role check. |
| U2 | Exercise/identify the operator entry points for `test-mailgun` and `academy-backfill-course-thumbnails`. | A quiet log window and no tracked UI call cannot prove a manual workflow is retired. |
| U3 | Explicitly approve any PR merge after its checks and review are complete. | Repository rule: never merge to `main` without fresh in-session approval. |
| U4 | Complete any Supabase dashboard/provider actions identified in C5. | These settings cannot be safely changed through repository code alone. |

## Definition of done

1. Every deployed function has a source-controlled home, an explicit current
   410 retirement record, or a documented external ownership exception.
2. Each active privileged function has a verified caller/permission model and
   request-aware CORS.
3. No retirement or authorization narrowing caused a confirmed workflow
   regression.
4. Each production change is traceable to a merged PR, deployed source version,
   and audit entry.
