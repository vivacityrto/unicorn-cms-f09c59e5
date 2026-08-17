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
| A1 | `get-email-status`, `report-delivery-issue`, `invite-to-tenant`, `schedule-task-reminders` | Captured — Claude Code, PR #328 (`hotfix/edge-fn-a1-source-capture`), open, not merged. See "A1 capture notes" below. | Pull exact deployed source; add it under `supabase/functions`; identify caller/auth model; document source hash/version and any behavior difference. |
| A2 | `import-vimeo-training`, `admin-change-password`, `record-completed-audit`, `validate-ai-assist` | Captured — Claude Code, PR #329 (`hotfix/edge-fn-a2-source-capture`), open, not merged. `record-completed-audit` was already fully reconciled/hardened/merged before this task (PR #321) — no new work needed there, see notes below. | Same capture/compare process. Preserve explicit custom authentication where present. |
| A3 | `generate-audit-report`, `create-client-audit`, `export-pdp-audit-pack` | Pending | Capture exact source and map direct UI callers. Do **not** narrow `create-client-audit` until Carl decides which Vivacity roles may create cross-tenant audits. Flag CORS/auth remediation separately. |
| A4 | `tmp-backfill-sharepoint-drive-ids`, `academy-fetch-vimeo-showcase` | Pending | Capture exact source and establish whether each is an active supported operation or an already-retired stub. Do not make lifecycle changes based only on repository absence. |

## Claude Code capture notes

### A1 — `get-email-status`, `report-delivery-issue`, `invite-to-tenant`, `schedule-task-reminders`

Captured verbatim from production via Supabase MCP and added under
`supabase/functions/<slug>/index.ts`. No behaviour, auth, or CORS change.
Full details, per-function auth model, SHA-256 hashes, and two flagged (not
fixed) findings — `schedule-task-reminders` has no in-function caller-identity
check at all, and `invite-to-tenant`/`schedule-task-reminders` import the
now-hardened shared `_shared/cors.ts` as a static object rather than the
current `corsHeaders(req)` function — are recorded in PR #328
(`hotfix/edge-fn-a1-source-capture`), which carries its own copy of this
section since it was cut before this A2 branch.

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
  Flagging the pattern for Carl's awareness; not narrowed in this PR. Still imports `../_shared/cors.ts` as a
  static wildcard object from its own bundled snapshot (own top-level
  `_shared/cors.ts`, not the tracked shared one) — same drift class as above,
  not touched here.

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
