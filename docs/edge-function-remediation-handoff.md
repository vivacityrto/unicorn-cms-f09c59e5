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
| PR #328 — A1 edge function source capture | Merged | Claude Code | Complete. `schedule-task-reminders` open-write finding and `_shared/cors.ts` drift note remain open observations, not fixed. |
| PR #329 — A2 edge function source capture | Open; documentation + source capture only, no deploy | Claude Code | Do not merge until Carl reviews the flagged `admin-authorization.ts` stale-comment note and the `validate-ai-assist` broad-role note. |

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
| A2 | `import-vimeo-training`, `admin-change-password`, `record-completed-audit`, `validate-ai-assist` | Captured — Claude Code, PR #329 (`hotfix/edge-fn-a2-source-capture`), open, not merged. `record-completed-audit` was already fully reconciled/hardened/merged before this task (PR #321) — no new work needed there, see notes below. | Same capture/compare process. Preserve explicit custom authentication where present. |
| A3 | `generate-audit-report`, `create-client-audit`, `export-pdp-audit-pack` | Pending | Capture exact source and map direct UI callers. Do **not** narrow `create-client-audit` until Carl decides which Vivacity roles may create cross-tenant audits. Flag CORS/auth remediation separately. |
| A4 | `tmp-backfill-sharepoint-drive-ids`, `academy-fetch-vimeo-showcase` | Pending | Capture exact source and establish whether each is an active supported operation or an already-retired stub. Do not make lifecycle changes based only on repository absence. |

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

### A2 — `import-vimeo-training`, `admin-change-password`, `record-completed-audit`, `validate-ai-assist`

Status: three of the four functions captured verbatim from production and
added under `supabase/functions/<slug>/index.ts`. The fourth,
`record-completed-audit`, turned out to already be fully tracked, hardened,
and merged to `main` by an earlier, unrelated session — see below.

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
  already flagged for `create-client-audit` (A3 row above; capture pending),
  though the blast radius here is materially smaller (draft rows only).
  Flagging the pattern for Carl's awareness; not narrowed in this PR. Still
  imports `../_shared/cors.ts` as a static wildcard object from its own
  bundled snapshot (own top-level `_shared/cors.ts`, not the tracked shared
  one) — same drift class as above, not touched here.

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
