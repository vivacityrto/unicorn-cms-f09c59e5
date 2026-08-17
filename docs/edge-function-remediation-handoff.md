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
| `tmp-backfill-sharepoint-drive-ids` | HTTP 410, self-documented neutralized stub | None | Leave unchanged; now also captured to source under PR (A4) for reconciliation completeness. |
| PR #328 — A1 edge function source capture | Open; documentation + source capture only, no deploy | Claude Code | Do not merge until Carl reviews the flagged `schedule-task-reminders` open-write finding and the `_shared/cors.ts` drift note. |
| PR #329 — A2 edge function source capture | Open; documentation + source capture only, no deploy | Claude Code | Do not merge until Carl reviews the flagged `admin-authorization.ts` stale-comment note and the `validate-ai-assist` broad-role note. |
| PR #331 — A3 edge function source capture | Open; documentation + source capture only, no deploy | Claude Code | Do not merge until Carl decides U1 (`create-client-audit`) and reviews the `generate-audit-report` legacy-schema note. |
| PR pending — A4 edge function source capture | Open shortly; documentation + source capture only, no deploy | Claude Code | Do not merge before Carl reviews. No lifecycle change proposed. |

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
| A3 | `generate-audit-report`, `create-client-audit`, `export-pdp-audit-pack` | Captured — Claude Code, PR #331 (`hotfix/edge-fn-a3-source-capture`), open, not merged. `create-client-audit` NOT narrowed — awaiting Carl's U1 decision. | Capture exact source and map direct UI callers. Do **not** narrow `create-client-audit` until Carl decides which Vivacity roles may create cross-tenant audits. Flag CORS/auth remediation separately. |
| A4 | `tmp-backfill-sharepoint-drive-ids`, `academy-fetch-vimeo-showcase` | Captured — Claude Code, branch `hotfix/edge-fn-a4-source-capture`, PR pending. `tmp-backfill-sharepoint-drive-ids` turned out to already be a self-documented, neutralized 410 stub. See "A4 capture notes" below. | Capture exact source and establish whether each is an active supported operation or an already-retired stub. Do not make lifecycle changes based only on repository absence. |

## Carl decisions / workflow checks needed

| ID | Decision or check | Why it matters |
|---|---|---|
| U1 | Which Vivacity roles may create a client audit for a different tenant? | Determines the safe replacement for `create-client-audit`'s broad non-empty-role check. |
| U2 | Exercise/identify the operator entry points for `test-mailgun` and `academy-backfill-course-thumbnails`. | A quiet log window and no tracked UI call cannot prove a manual workflow is retired. |
| U3 | Explicitly approve any PR merge after its checks and review are complete. | Repository rule: never merge to `main` without fresh in-session approval. |
| U4 | Complete any Supabase dashboard/provider actions identified in C5. | These settings cannot be safely changed through repository code alone. |
| U5 | Is `generate-audit-report` still a live workflow, or fully superseded by `generate-client-audit-report`/`generate-client-audit-report-docx`? | It reads `compliance_audits`/`compliance_templates`, which have **zero rows** in production (vs. 19 in `client_audits`, the schema the tracked report generators and `create-client-audit`/`record-completed-audit` all use). Looks legacy, but per the no-retirement rule this needs a workflow decision, not an inference from row counts. |

## Claude Code capture notes — A4

### A1–A3

See PR #328, PR #329, and PR #331 — each carries its own copy of the A1/A2/A3
capture-notes section since they were cut before this A4 branch. Headlines:
`get-email-status`/`report-delivery-issue` don't forward the caller's auth
header to their DB client; `schedule-task-reminders` has no in-function
caller-identity check at all; several functions import `_shared/cors.ts` (or
a bundled snapshot of it) as a static object against a shared file that's
now a request-aware function; `_shared/admin-authorization.ts` has a stale
"unused" comment despite still being load-bearing; `record-completed-audit`
was already reconciled (PR #321) before this task reached it; and
`create-client-audit` still has the broad non-empty-`unicorn_role` cross-tenant
gap, deliberately not narrowed pending Carl's U1 decision.

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

## Definition of done

1. Every deployed function has a source-controlled home, an explicit current
   410 retirement record, or a documented external ownership exception.
2. Each active privileged function has a verified caller/permission model and
   request-aware CORS.
3. No retirement or authorization narrowing caused a confirmed workflow
   regression.
4. Each production change is traceable to a merged PR, deployed source version,
   and audit entry.
