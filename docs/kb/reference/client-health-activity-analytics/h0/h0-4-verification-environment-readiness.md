# Client Health H0.4 — verification environment readiness inventory

> **Status:** readiness inventory delivered 2026-09-15; no hosted measurement
> run was performed
> **Parent:** [Client Health Activity Analytics Plan](../../client-health-activity-analytics-plan-2026-09-03.md) — §10 H0.4
> **Related packet:** [H0.4 consultant report template and evidence schema](h0-4-consultant-report-template-and-evidence-schema.md)
> **Related fixture packet:** [H0.1-c dashboard query synthetic fixture scope](h0-1-c-dashboard-query-synthetic-fixture-scope.md)
> **Owner:** Client Health with TOM, RBAC, security, and consultant review
> **Audit entry:** none needed — repository inventory and planning only; no hosted query, write, credential, schema, RLS, function, cron, or runtime change

## Purpose and safety boundary

This packet reconciles the H0.4 plan against the QA workflows and local
fixtures that are actually present in the repository. It is a readiness
inventory, not a measurement result. `unicorn-qa` is the only hosted target
named by the existing QA workflows, and the repository's target validation
must remain in place for any future run.

This packet authorizes no credential creation or retrieval, hosted query or
write, production observation, schema/RLS/RPC/trigger/grant/Realtime/Edge/cron
change, score or metric implementation, AI processing, consultant-data
substitution, pilot, or rollout. Any future hosted measurement requires its
own approved execution request and redacted evidence handback.

## 1. Observed readiness

| H0.4 requirement | Repository evidence | Disposition |
| --- | --- | --- |
| Isolated QA target | `docs/kb/codebase-state/qa-baseline-manifest-2026-09-07.json` identifies `unicorn-qa` (`qfpxvumcrnzrjyvqkicq`) as a verified, application-scope, cron-free controlled baseline. Every hosted QA workflow validates this manifest and target before running. | **Ready for a separately approved run**; this packet did not connect to it. |
| Persistent basic login states | `.github/workflows/qa-seed-e2e-personas.yml` provisions persistent `qa-e2e-superadmin@example.qa` and `qa-e2e-client@example.qa` personas and the `qa-e2e-demo-tenant`; the QA Playwright config has Super Admin and client projects. | **Present**, but not Client Health evidence by itself. |
| Scoped tenant identities | The same provisioner creates TOM client admin A and client user A in fixture tenant A, and client admin B in fixture tenant B, with `tenant_members` and `tenant_users` links. | **Present** for tenant-scope characterization. |
| Unscoped internal identities | The provisioner creates CSC, Integrator, and Team Leader personas with no tenant assignment and internal flags. The QA workflow generates storage states for CSC, Integrator, and Team Leader. | **Present** for login-state preparation. |
| Disabled principal | The provisioner creates a disabled staff persona and the QA workflow generates its storage state. | **Present as seeded data**; a Client Health authorization outcome is not yet captured. |
| Primary-contact inviter | The provisioner creates a dedicated primary-contact inviter in tenant A. The separate TOM P1.1 workflow exercises that identity, but the general H0.4 characterization workflow does not generate its storage state. | **Partial**; do not treat TOM P1.1 evidence as Client Health coverage. |
| Revoked principal | No repository fixture or QA workflow identifies a revoked-principal state. | **Missing**. |
| Live tenant-isolation proof | `src/test/tenant/isolation.test.tsx` contains a service-role-gated, run-scoped live RLS suite; `.github/workflows/qa-rls-isolation.yml` requires QA-only credentials and serializes the suite. | **Present for its message/conversation contract**, not proof of Client Health query scope. |
| Local Client Health characterization | H0.1-c delivers five deterministic synthetic dashboard-query scenarios and focused local assertions, including missing-source, freshness, future-timestamp, and cross-tenant fixture boundaries. | **Present locally**; it does not execute hosted SQL views. |
| Read-only multi-persona browser run | The QA workflow starts a QA-pointed Vite server, generates ephemeral states for anonymous, Super Admin, client, TOM client A/B, CSC, Integrator, Team Leader, and disabled staff, then runs the read-only TOM suite four times per project and uploads redacted logs. | **Present as a reusable harness**; it is not a Client Health benchmark. |

## 2. Evidence still Inconclusive or absent

The following are not established by the current repository artifacts:

1. **Client Health route/query coverage.** The QA browser workflow is TOM
   characterization. No H0.4 workflow or test currently records a defined
   Client Health query family, source watermark, row/byte counts, freshness,
   or caller-scope proof for the dashboard health surfaces.
2. **Revocation negative case.** A disabled staff fixture exists, but a
   revoked or removed relationship and its expected caller-safe outcome are
   not represented in the provisioner or Playwright project list.
3. **Realistic corpus volume and skew.** The local H0.1-c fixture is
   deliberately synthetic and deterministic. It is not a hosted corpus
   sized or shaped to support p50/p95, concurrency, storage-growth, or
   rebuild conclusions.
4. **Database and batch telemetry.** No checked-in H0.4 harness captures
   database buffer/CPU/temp/WAL, batch duration, storage growth/rebuild, or
   alert-load ceilings. Browser waterfall logs are diagnostic evidence, not
   signed database measurements.
5. **Repeatable performance baseline.** The existing `repeat-each=4` run
   repeats UI assertions; it does not define sampling, warm/cold conditions,
   concurrency, outlier handling, or p50/p95 calculation for Client Health.
6. **Deno-dependent coverage.** The repository records that the local
   environment has no Deno runtime. Edge tests requiring Deno remain outside
   the normal local runner unless executed in an approved hosted workflow.
7. **Consultant operating evidence.** AJ and Ezel reports remain outstanding.
   Technical QA evidence cannot establish cadence, useful interventions,
   alert burden, outcome horizons, or metric thresholds on their behalf.

Per the parent plan, unavailable evidence is **Inconclusive**, not Pass, and
must not be used to claim that a persona, budget, or metric gate is met.

## 3. Smallest safe next measurement sequence

After separate approval, the next implementation packet should stay inside
the existing QA boundary and produce redacted, versioned evidence in this
order:

1. Add the missing revoked-principal fixture and a caller-safe negative-case
   assertion, without changing production authorization behavior.
2. Define a Client Health measurement manifest: query family, approved
   subject grain, persona, tenant fixture, fixed clock, warm/cold condition,
   sample count, concurrency level, and redaction rules.
3. Reuse H0.1-c synthetic scenarios as the expected semantic corpus, then
   add only isolated QA data needed for volume/skew characterization. Keep
   the fixture tag and cleanup ledger explicit.
4. Capture query/result metadata and database telemetry through an approved
   QA-only runner. Store p50/p95 and row/byte evidence with run identity and
   source watermark; do not infer budgets before the samples exist.
5. Compare scope outcomes for Super Admin, scoped staff, unscoped staff,
   client A/B, disabled, and revoked principals. Record denied or unavailable
   results generically and keep protected diagnostics out of browser logs.
6. Publish measured baselines and proposed budgets as provisional artifacts,
   then obtain the separate Client Health, TOM, RBAC, security, and Carl
   decisions required before H1 use.

This sequence does not restart either forecast job, schedule a cron, repair a
source table, or approve a health score. It also keeps the consultant-data
dependency open until both reports are supplied and consolidated.

## 4. Exit state for this packet

H0.4 is now explicit about what the existing QA environment can support and
what it cannot yet prove. The environment is **ready for a separately
approved, QA-only measurement packet**, but H0.4's measured-baseline and
proposed-budget exit criteria remain open. No claim of budget compliance,
persona-pass completeness, or Client Health production readiness is made.
