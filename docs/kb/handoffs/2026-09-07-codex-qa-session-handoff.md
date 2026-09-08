# Temporary Codex Session Handoff — QA Baseline and Phase 2.6 Stabilization

> **Historical/superseded (2026-09-08):** this handoff captures the pre-QA
> decision state. The active target is the dedicated `unicorn-qa` project
> (`qfpxvumcrnzrjyvqkicq`); P1-C live proof completed in workflow run
> `34179875080`, and the administrative secret-move/repeat-run tail was
> intentionally waived. Use the [stabilization execution plan](../reference/codebase-optimization/phase-2-6-stabilization/phase-2-6-stabilization-plan.md)
> and [QA coverage strategy](../reference/codebase-optimization/phase-2-6-stabilization/qa-environment-and-coverage-strategy.md)
> for current status.

**Date:** 2026-09-07  
**Repository:** `unicorn-cms-f09c59e5`  
**Purpose:** Resume this investigation from a new Codex chat without losing context.

## Current repository state

- Main checkout: `C:\Users\carls\repository\unicorn-workspace\unicorn-cms-f09c59e5`
- Main HEAD when handed off: `b2e6faab5` (`docs: record M3-A legacy function retirement`)
- Main working tree was clean at handoff.
- Do not delete or reset existing worktrees without reviewing ownership first.
- User preference: use the existing Junction/dependency setup; do not install a second large `node_modules` tree unless explicitly approved.

## Active Codex task / mobile issue

The prior Codex task is **Plan bug cleanup and Phase 3**, id:
`01a07919-85d6-7713-aa9d-ae06a0e5592d`.

Codex inspection confirmed the task is still persisted, pinned, and not archived. Its newest turn is stuck in `inProgress` even though its last recorded command completed. The phone displays the older checkpoint (“installing dependencies”) and the placeholder “caller-safe unavailable result.” This is a stale unfinished-turn/UI-sync issue, not lost history. Do not create duplicate work until the new session has reviewed this handoff.

## High-level objective

Complete the Phase 2.6 stabilization work, reconcile the documented bug/residue backlog, and prepare a safe path into Phase 3. The highest-risk unresolved item is the tenant-isolation RLS suite (P1-C), which must never use production credentials.

## QA / tenant-isolation status

The dedicated QA project has now been created:

- QA project: `unicorn-qa`
- QA project ref: `qfpxvumcrnzrjyvqkicq`
- QA URL: `https://qfpxvumcrnzrjyvqkicq.supabase.co`
- Region: Southeast Asia (Singapore), `ap-southeast-1`
- Current dashboard status: Healthy; no migrations; no branches; no GitHub repository connected.

The previously intended preview branch was not suitable and has been deleted:

- Production ref: `yxkgdalkbrriasiyyrwk` — **never use its service-role key**.
- Preview branch ref: `iqichbimamlyjpaguddl` (deleted)
- Branch id: `a3727ad5-3ea0-4189-9eab-ec60f2f420d6` (historical)
- No hosted data, secrets, or production schedules were modified by this investigation.

The repository now contains QA-baseline tooling and documentation (in the M3-C preflight worktree):

- `scripts/validate-qa-baseline.mjs`
- `scripts/qa-baseline-parity.mjs`
- `scripts/qa-baseline-capture.sql`
- `docs/kb/codebase-state/qa-baseline-manifest-2026-09-07.json`
- `docs/kb/codebase-state/qa-baseline-production-capture-2026-09-07.json`
- `docs/kb/codebase-state/qa-baseline-cutover-2026-09-07.md`
- `docs/kb/codebase-state/qa-provisioning-runbook-2026-09-07.md`

The manifest is intentionally `pending-capture`. Read-only production metadata was captured successfully, including approximately 8 extensions, 662 tables, 136 views, 670 functions, 486 triggers, 1,966 policies, 2 publications, and 332 migrations (latest `20260907052028`). The capture is metadata/fingerprint-only, not a data dump.

The QA goal is blocked until the user authorizes and provides the infrastructure decision for a safe target:

1. Either repair/recreate a disposable or dedicated QA project from a clean schema baseline, or explicitly accept the cost and lifecycle of a dedicated project.
2. Apply the repository migration history only after confirming it can replay safely; do not blindly replay the current failed preview branch.
3. Generate a QA-only service-role key and decide whether it is local/manual-only or a protected GitHub Actions environment secret.
4. Allow P1-C live-RLS tests only against an allowlisted non-production project ref/URL.

## P1-C requirements (not yet proven live)

Before wiring any credential:

1. Remove the 11 placeholder `expect(true).toBe(true)` tests.
2. Type the 15 real RLS tests using generated Supabase types.
3. Add a unique run id to every fixture row.
4. Clean users, memberships, participants, messages, and audit rows in reverse dependency order from `finally`.
5. Collect cleanup failures and fail the run; do not merely warn.
6. Assert no run-scoped rows or auth users remain.
7. Serialize concurrent runs with a project-level lock.
8. Enforce a disposable-project URL/project-ref allowlist and reject production ref `yxkgdalkbrriasiyyrwk`.

Only after these controls pass should a protected manual/nightly workflow inject the QA secret. Never expose it to forked PRs.

## M-packet progress

- **M0/M1/M2:** completed and documented on main; migration safety and legacy notification/cron retirement work was read-only or explicitly deployed as recorded in the KB.
- **M3-A:** legacy function retirement recorded on main.
- **M3-B:** manually deployed and verified in production; retired queue endpoints return the expected `410 FUNCTION_RETIRED`; no database rows or schedules were changed.
- **M3-C:** quiet-period evidence is running; any destructive table drop remains deferred until the evidence window closes.
- **M4:** H0.0 containment is being implemented in the `m3c-preflight` worktree. Intended behavior: dashboards remain reachable but stop presenting the known-invalid stage-health signal as authoritative; Ask Viv should return a caller-safe unavailable result. Verification was interrupted/stalled around dependency availability.
- **M5/M6:** audit/preview-replay and remaining safe documentation/verification work were queued for investigation; do not claim completion without fresh evidence.

Relevant worktrees:

- `.worktrees/m3b-retire-queue` — `codex/m3b-retire-queue`
- `.worktrees/m3c-preflight` — `codex/m3c-preflight` (M3-C/M4 work)
- `.worktrees/p1c-step3-run-ledger` — `codex/p1c-step3-run-ledger`

## Verification expectations

Use the repository’s normal gates for code changes:

```text
npm run lint:ratchet
npm run typecheck
npm run test:frontend
npm run test:edge
npm run build
```

Run live Playwright only when a change carries behavioral/auth risk. Keep it authenticated, read-only, and scoped to affected routes. Do not use production service-role credentials for P1-C. Avoid duplicate `npm install` trees; use Junction/cache setup where available.

## Immediate next actions for the new session

1. Read this handoff and inspect `git status`, worktree ownership, and the stabilization plan before editing.
2. Decide whether to recover/interrupt the stale Codex turn or simply continue from this new task; do not run duplicate M4 work blindly.
3. Inspect the M3-C preflight diff and determine whether M4 verification can run with the existing dependency/Junction setup.
4. Keep M3-C destructive cleanup deferred until the quiet-period proof is complete.
5. Treat QA provisioning as an explicit infrastructure decision; do not guess, bill, create secrets, or target production.
6. Resume P1-C only after a safe QA target and allowlist are confirmed.

## Safety rules

- Never use `SUPABASE_SERVICE_ROLE_KEY` from production for local or CI RLS tests.
- Never run migration replay or destructive cleanup against production without explicit authorization.
- Preserve all existing documentation and audit evidence; update rather than overwrite.
- Report blockers as infrastructure/authorization decisions, not as completed engineering work.
