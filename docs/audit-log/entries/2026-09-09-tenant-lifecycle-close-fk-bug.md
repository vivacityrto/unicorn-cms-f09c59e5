# Audit: 2026-09-09 — tenant-lifecycle "Close" action always failed (missing FK)

**Trigger:** drift-surfaced (found live-verifying Phase 2.6 stabilization Packet P2-QA's `qa:data-lifecycle` suite against `unicorn-qa`, then confirmed against production)
**Scope:** `supabase/functions/tenant-lifecycle/index.ts`'s `executeCloseTransaction`; the `stage_instances`/`package_instances`/`client_task_instances` foreign-key graph. Did not look at any other Edge Function or feature area beyond confirming the identical pattern was already fixed once before in `src/components/client/ClientAuditsTab.tsx`.

## Findings
- `executeCloseTransaction`'s Step 1 queried `stage_instances` via a PostgREST embed — `package_instances!inner(tenant_id)` — to scope open stages to the tenant being closed.
- Confirmed via `pg_constraint` against **production** (`yxkgdalkbrriasiyyrwk`): `stage_instances` has exactly one foreign key (`stage_instances_linked_audit_id_fkey → client_audits`). No FK from `stage_instances.packageinstance_id` to `package_instances` exists, in production or `unicorn-qa`.
- PostgREST cannot resolve an embed without a matching FK — the query fails with `PGRST200` ("Could not find a relationship between 'stage_instances' and 'package_instances'") unconditionally, regardless of whether the tenant has any open stages. This means **every real "Close" action call has failed with a 500 since this code was written**, in production and QA alike.
- Step 2 (cancelling open tasks) used the identical broken pattern one level deeper, embedding `stage_instances!inner(packageinstance_id, package_instances!inner(tenant_id))` under `client_task_instances`.
- The same root cause was already independently discovered and fixed once in `src/components/client/ClientAuditsTab.tsx` (see its own code comment, from `hotfix: fix Client Detail package/stage bugs found in Playwright audit`) — `tenant-lifecycle` was simply never updated to match.
- Separately, `runCloseSafetyChecks`'s unresolved-risk-flags check queries `public.compliance_risk_flags`, which does not exist in production either (`to_regclass('public.compliance_risk_flags')` returns `null`). This is non-blocking (the function only logs and continues on this specific query's error) and pre-existing, not introduced by this fix — documented, not fixed, since the correct fix needs a product decision on what that table should contain.

## KB changes shipped
- `docs/kb/reference/codebase-optimization/phase-2-6-stabilization/l10-real-bugs-found.md`: new item 34 (FIXED), with the `compliance_risk_flags` gap noted as a separate, undecided follow-up.
- `docs/kb/reference/codebase-optimization/phase-2-6-stabilization/progress-log.md`: session entry covering the `qa:data-lifecycle` live-verification path that surfaced this.

## Code changes (if this entry accompanies one)
- `supabase/functions/tenant-lifecycle/index.ts`: `executeCloseTransaction` rewritten to resolve the tenant's `package_instances` ids with a plain query first, then filter `stage_instances`/`client_task_instances` by those ids directly, instead of relying on an embed the schema doesn't support. No behavior change to close semantics (same open-stage/open-task scoping, same status transitions, same audit log) — only the query mechanism changed.
- Deployed to `unicorn-qa` (`qfpxvumcrnzrjyvqkicq`) and, on merge, to production via the standard Edge Function deploy path — see `AGENTS.md` → "Supabase deployment workflow" for the post-merge verification this repo requires (auto-deploy-on-merge has been observed to fail silently).

## Decisions
- Fix the FK-dependent embed now rather than defer, given the action is completely non-functional in production today — confirmed with Carl before proceeding (this session).
- Leave the `compliance_risk_flags` gap documented, not fixed — it needs a product decision on what the table should contain, not a mechanical query fix.

## Open questions parked
- Whether any other Edge Function or frontend query relies on a `stage_instances → package_instances` PostgREST embed was not exhaustively searched beyond a repo-wide grep for the literal `package_instances!inner` pattern (two matches found: this file, and the already-fixed `ClientAuditsTab.tsx`). A differently-shaped embed (e.g. a different alias or reversed direction) would not have been caught by that grep.
- Whether the `compliance_risk_flags` feature was ever actually built anywhere, or the column reference in `tenant-lifecycle` is leftover from an abandoned design, was not investigated.
