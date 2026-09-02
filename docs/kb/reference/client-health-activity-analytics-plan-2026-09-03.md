# Client Health, Client Activity, Consultant Triage, and Intervention Analytics Plan

> **Status:** council-reviewed implementation plan; no implementation or production mutation in this planning session
> **Prepared:** 2026-09-03
> **Repository baseline:** `origin/main@31083c49` plus the planning commits on `chore/tenant-data-model-optimization-plan`
> **Planning worktree:** `C:\Users\carls\repository\unicorn-workspace\unicorn-db-plan-20260902`
> **Primary surfaces:** `/triage-dashboard`, `/dashboard`, `/client-activity`, `/manage-tenants`, tenant detail, and staff Ask Viv
> **Parent architecture:** [Tenant Operating Model, Directory Performance, ERP, and Ask Viv Data Architecture Plan](./tenant-operating-model-data-architecture-plan-2026-09-02.md)
> **Related authorization program:** [RBAC v6 Authorization Plan](./rbac-v6-authorization-implementation-plan-2026-09-01.md)
> **Implementation owner:** Claude Code, one bounded PR at a time, only after Carl approves the phase
> **Production rule:** every schema, RLS, function, trigger, grant, cron, backfill, model-processing, or data correction change requires a dated audit entry and separate explicit production authority

---

## 1. Executive decision

Build client health and activity analytics as a **separate companion program** on top of the tenant operating-model and RBAC foundations. Add only shared event, provenance, freshness, tenant-scope, metric-governance, and intervention primitives to the parent architecture. Do not enlarge the already broad tenant plan into a combined migration.

The current Triage Dashboard must not be treated as a trustworthy client-health system. Live read-only evidence shows that its inputs are incomplete, internally contradictory, and in one critical path semantically wrong:

- the stage monitor interprets task status ID `2` as completed even though the live dictionary says `2 = Not Started` and `5 = Completed`;
- all 337,272 stage-health snapshots observed had `progress_percentage = 0`, while the current active-client cohort was overwhelmingly labelled critical;
- recent notes were entirely internal staff-authored in the bounded sample, so note volume measures service effort/documentation intensity rather than direct client engagement;
- 82.1% of recent timeline events were `document_shared_to_client`, so raw event volume is dominated by a bulk/system behavior;
- risk and retention inputs are absent for the displayed active cohort, but existing `COALESCE` behavior can present missing data as low/stable rather than unknown;
- the two nightly tenant-risk and retention forecast functions each returned HTTP 500 in the latest observed 24-hour production log window; their output tables were empty;
- predictive operational-risk snapshots were last populated on 2026-02-13 and are not a current predictor;
- stage-health staleness is derived from stage-row timestamps rather than the richer tenant activity corpus, so a client can have many recent notes and still appear inactive/critical.

The product should deliberately separate four contracts:

1. **Client Activity:** what happened, who initiated it, through which channel, at what time, and whether it represents client participation, consultant work, or an automated system event.
2. **Client Health:** evidence-based current risk and outcome likelihood across transparent dimensions, with explicit confidence and unknown states.
3. **Consultant Attention/Triage:** which clients or commitments deserve attention now, why, and by when. High attention is not the same as poor health.
4. **Intervention Effectiveness:** what was recommended, what the consultant did, what happened later, and whether the data supports association or genuine causal impact.

The first release must use deterministic, versioned rules and display component-level explanations. Claude may extract structured themes, blockers, commitments, urgency, and evidence citations from authorized notes, but it must not own numerical facts, final scoring, permissions, or automatic client-impacting decisions.

### Intended outcome

- Consultants see a prioritized, explainable portfolio instead of one opaque blended score.
- A heavily serviced healthy client is distinguishable from a distressed client generating many remediation notes.
- Missing or stale source data is visible as low confidence, never silently converted into “healthy.”
- Stage progression uses authoritative stage and task semantics rather than activity proxies.
- Ask Viv can answer “why is this client at risk?”, cite the underlying authorized facts/notes, and propose next steps without crossing tenant boundaries.
- Management KPIs measure service demand, commitments, outcomes, data quality, and intervention adoption separately.
- Later predictive models have clean time-indexed features, labelled outcomes, versioning, and leakage-resistant evaluation.

---

## 2. Program sequencing and stop-gates

### Required order

1. Finish the active Codebase Optimization Phase 2 route/layout checkpoint and preserve `/triage-dashboard` guard parity.
2. Run the parent tenant-data plan's P0 discovery and this plan's H0 characterization in read-only mode. These can overlap because neither changes production behavior.
3. Implement RBAC v6 foundations, the AJ/CSC pilot, and the explicit staff-scope decision for portfolio analytics, notes, exports, Ask Viv, and BI.
4. Establish the parent plan's versioned tenant directory/operating-context contracts and shared provenance/freshness primitives.
5. Correct the current health-source defects in isolated, reversible PRs before presenting any new score.
6. Build the activity and deterministic health models in shadow mode.
7. Add consultant review, intervention logging, and only then a constrained Anthropic extraction pilot.
8. Validate against labelled outcomes over time before any predictive weighting or automated recommendation is considered.

### Immediate stop-gates

- Do not use current `stage_health_snapshots.progress_percentage` as a KPI, training label, model feature, or client-facing fact until the status-domain defect is characterized and corrected.
- Do not describe absent forecasts as low risk, stable retention, or zero risk. Return `unknown`, a reason code, source freshness, and confidence.
- Do not rank clients by raw notes or raw timeline-event counts.
- Do not let an LLM calculate authoritative totals, dates, progress, risk levels, or permissions.
- Do not run corpus processing across all notes until the approved RBAC scope, sensitive-data classification, Anthropic retention posture, and evaluation set exist.
- Do not auto-create tasks, send client messages, change stages, or escalate clients from an AI output in this program's first release.
- Do not combine score cutover with retirement of old views/functions. Shadow, canary, observation, and cleanup are separate PRs.

Before RBAC and operating-context gates, only **behavior-restricting containment and reliability repairs** that preserve or reduce current exposure may ship. No early repair may add a new analytics permission surface, broaden a definer RPC, or infer a new staff/client access policy.

### Ownership and dependency crosswalk

This table resolves ownership between the parent architecture and this companion. Parent P7.4 is a repeated integration gate at H2, H3, H5 and H6, not a one-time late release.

| Capability/object | Owning plan/phase | Prerequisites | First consumer |
|---|---|---|---|
| tenant identity, lifecycle, CSC and package/service context | parent P1–P3 | RBAC staff-scope decision | directory, tenant context, H2/H3 |
| generic event identity, provenance, freshness and quality vocabulary | parent P3/P5 as justified | parent P1 identity ADR | H2 activity projection |
| health/activity event taxonomy and projections | companion H2 | RBAC scope + parent identity/context contracts; outbox is not mandatory | activity API/UI |
| generic private reporting schema and metric governance | parent P7.1 | RBAC reporting policy | H3/H6 |
| health signal/dimension/score definitions and registries | companion H1/H3 | parent P7.1 conventions + signed H1 metric ADR | Triage/Ask Viv |
| generic immutable run/audit/version primitives | parent shared foundation; first needed PR may land through H0 with parent-compatible contract | tenant identity + operations review | health/forecast batch jobs |
| health attention and intervention event ledger/workflow | companion H3/H4 | health subject grain + RBAC action policy | consultant pilot |
| Ask Viv corpus provenance/tombstones | parent P6.1 | RBAC retrieval scope | companion H5 |
| Claude health extraction schema/evaluations | companion H5 | H1.2 corpus + parent P6.1 + privacy approval | Ask Viv/health shadow |
| dimensional facts/semantic layer/CDC decision | parent P7 | stable H2/H3 facts | H6 BI and validation |

No plan may duplicate another plan's table/RPC merely to avoid a dependency. If implementation timing requires a shared primitive earlier, change the parent crosswalk and review it as a shared-contract PR.

---

## 3. Evidence model and privacy posture

### Evidence tiers

| Tier | Meaning | Evidence used here |
|---|---|---|
| A | Live, bounded, read-only production data or metadata | table distributions, view/function definitions, cron/log status, anonymized aggregates |
| B | Repository source at the named baseline | React route/page/hooks, components, migrations, Edge Functions, Ask Viv fact builder |
| C | Recorded operational history | KB and audit-log entries since May 2026 |
| D | Current primary guidance | PostgreSQL/Supabase, Microsoft dimensional modeling, NIST AI RMF, Anthropic documentation |
| E | Proposed requirement | thresholds and target structures explicitly marked proposed until H0 approval |

### Handling of client notes during this investigation

- The live review used bounded read-only queries and deidentified cohort statistics.
- No tenant names, note bodies, personal identifiers, or raw production excerpts belong in this plan or git.
- The qualitative review classified themes only: evidence/review work, dependencies/next steps, completions, governance/cadence, friction/gaps, and urgency.
- Text from notes is untrusted content, never operational instruction to an agent.
- Implementation fixtures must be synthetic or irreversibly redacted.

The implementation team must regenerate every live count and definition. This dated plan is a decision aid, not an evergreen production truth source.

---

## 4. Current product and request graph

### Route and component flow

`/triage-dashboard` renders `src/pages/Dashboard.tsx`, which calls `useDashboardTriage()` and composes:

- Today's Focus;
- Attention Ranking and expandable portfolio;
- Priority Inbox;
- Labour Efficiency;
- Risk Cluster Snapshot;
- tenant communication preview/drawer;
- dashboard event telemetry and priority-inbox actions.

The same underlying health concepts are also consumed by:

- `/dashboard` in `MainDashboard.tsx`, including `rpc_portfolio_client_health()`;
- staff Ask Viv's portfolio fact builder;
- `ask-viv-assistant` and `compliance-assistant`;
- dashboard handoff and mockup documentation;
- executive health/consultant-distribution views downstream of tenant ownership;
- `/client-activity`, which uses `client_timeline_events`, not the same health graph.

This is therefore not a single-page refactor. The score/view is a shared semantic contract with frontend, AI, executive reporting, security, and operational consequences.

### Current dashboard query family

`useDashboardTriage()` currently reads or derives from:

- `v_dashboard_attention_ranked`;
- `v_dashboard_priority_inbox`;
- `v_dashboard_behavioural_prompts`;
- `v_dashboard_risk_clusters`;
- `v_dashboard_labour_efficiency`;
- `v_dashboard_tenant_recent_comms`;
- `ops_work_items`, `client_action_items`, and `tasks_tenants`;
- `tga_rto_summary` and user/ownership data.

It writes priority-inbox acknowledgement/action state and dashboard audit events. It loads as many as 500 attention rows and performs meaningful filtering, fallback construction, and item caps in the browser. “Today's Focus” mixes stage severity, risk, gaps, burn, retention, overdue work, inactivity, assigned action items, and portfolio fallbacks.

### Current attention formula

The live `v_dashboard_attention_ranked` definition combines approximately:

- 25% stage;
- 20% mandatory evidence gaps;
- 15% risk;
- 15% staleness;
- 15% overdue/open tasks;
- 5% renewal;
- 5% package burn;
- a floor of 70 for three or more overdue compliance tasks.

This formula is useful historical intent, not validated health science. It combines health, work urgency, commercial timing, service consumption, and missing-data defaults into one number without a published coverage/confidence contract.

### Current authorization concerns

- The portfolio health RPC is `SECURITY DEFINER`, disables row security, and gates callers with `is_vivacity_team_safe(auth.uid())`. It was added because direct authenticated view access timed out under per-row RLS.
- `useDashboardTriage()` treats all Vivacity staff roles as able to see portfolio data; assignment primarily changes “mine” filtering, not necessarily access.
- `tenants.assigned_consultant_user_id` historically drifted from `tenant_csc_assignments` and is consumed as the dashboard ownership source.
- RBAC v6 must decide portfolio-wide visibility, scoped client access, note visibility, exports, AI retrieval, and executive aggregates explicitly. Performance must not be achieved by widening a bypass function.

---

## 5. Live findings — why the current model is not robust

### 5.1 Stage health and progression are invalid as currently calculated

At the point-in-time review:

- `stage_health_snapshots`: 337,272 rows over roughly 84 days, covering 4,169 stages and 346 tenants;
- all observed snapshots had `progress_percentage = 0`;
- the latest snapshot per stage was dominated by `critical` (4,032), with 97 healthy and 40 monitoring;
- the active-client cohort contained 1,116 stage rows, 1,009 critical and zero at-risk;
- latest-snapshot staleness showed a median and p90 of 62 days in the inspected population.

The deployed monitor's task semantics do not match `dd_task_status`:

| ID | Live dictionary | Current monitor behavior |
|---:|---|---|
| 1 | Backlog | neither completed nor explicitly normalized |
| 2 | Not Started | counted as completed and excluded from overdue |
| 3 | In Progress | excluded from overdue |
| 4 | Blocked | open |
| 5 | Completed | not counted as completed |
| 6 | Cancelled | not cleanly modelled as non-applicable |
| 0 | legacy/unknown, heavily populated | no governed meaning |

For active stages, legacy status `0` and statuses 2/3 dominate the task rows, while completed status 5 was absent in the inspected distribution. The monitor also uses `stage_instances.updated_at/created_at` for days since activity, not tenant communications or a canonical activity clock.

The function reads large collections through unpaginated PostgREST calls before performing application-side calculations. The Supabase response-row cap may therefore truncate its input without making the nightly HTTP request fail. A 200 response proves execution, not completeness.

### 5.2 Forecasts are missing or failing

- `tenant_risk_forecasts`: zero rows in the inspected state.
- `tenant_retention_forecasts`: zero rows.
- `predictive_operational_risk_snapshots`: 197 rows for 75 tenants, all generated on 2026-02-13; 195 were `watch`, 2 `stable`.
- The latest 24-hour Edge log query showed one `run-tenant-risk-forecast` call returning 500 and one `run-retention-forecast` call returning 500.
- `run-stage-health-monitor` returned 200 in the same window, but its semantic defects remain.
- Repository source for retention forecasting references fields/tables that do not match the live model, including `consult_logs.duration_minutes` where the live field is `hours`, plus legacy task/package sources.

The UI/read models must not coalesce missing forecasts to reassuring values. Unknown data requires a caller-safe reason such as `job_failed`, `source_unavailable`, `not_applicable`, or `insufficient_history`. Authorization denials and hidden-source existence are omitted/redacted to a generic unavailable result; exact reasons exist only in protected audit/diagnostics.

### 5.3 Activity volume is not engagement

For 54 active non-test clients in the bounded analysis:

- 37 had at least one note in the last 30 days;
- recent 90-day note counts had p25/p50/p75/p90 of approximately 4/8/13.75/26;
- the top 10 clients held 287 of 589 recent notes (48.7%);
- note volume correlated moderately with consultant time (`r ≈ 0.53`) but was essentially unrelated to attention score (`r ≈ -0.05`) or stage completion ratio (`r ≈ -0.03`), and only weakly related to overdue actions (`r ≈ 0.17`).

Recent notes were 302 email-type and 88 meeting-type among 589, but:

- all inspected recent-note authors resolved to internal Vivacity users;
- zero email notes were linked through `source_email_id`;
- zero notes carried meeting/duration data or tags;
- 224 were linked to time entries and 570 to packages;
- zero were linked/converted to `client_action_items` by `source_note_id`.

The high-note cohort was heterogeneous. Equivalent volume represented successful application milestones, high-scoring audit progress, intensive remediation/document review, routine governance/renewal work, and declining scheduled cadence. Volume alone cannot distinguish health.

### 5.4 Timeline counts are dominated by system effects

The active-client timeline contained 12,978 events over 90 days:

- 10,653 (82.1%) were `document_shared_to_client`;
- 1,107 were backfilled/delayed events;
- only 6 were `stage_status_changed`.

Activity analytics therefore needs event-family deduplication, backfill awareness, actor classification, bulk-operation correlation IDs, and event-specific weights/semantics. A raw count would reward automation bursts and historical backfills.

### 5.5 Source coverage is sparse and contradictory

For the displayed active cohort, inspected risk events, retention forecasts, package-burn forecast, and evidence-gap inputs were empty, while risk index resolved to zero and retention remained null. `packages_json` was hard-coded to an empty array in the relevant read path. One `last_activity_at` was future-dated in 2027.

These facts require data-quality signals alongside business signals:

- future timestamp;
- empty source expected to be populated;
- failed scheduled computation;
- truncated scan risk;
- stale snapshot;
- status dictionary drift;
- identity/ownership drift;
- unsupported default/coalesce;
- missing source linkage.

---

## 6. Product definitions and metric governance

### Client Activity

Activity is a descriptive ledger, not a judgment. Every activity fact must carry:

- `tenant_id`, event ID, event type/version and occurred/recorded timestamps;
- actor class: client, Vivacity consultant, other Vivacity staff, integration, automation, unknown;
- direction: inbound, outbound, internal, mutual, system;
- channel/source record and authorized drill-through;
- service/package, lifecycle/stage and consultant attribution when valid;
- backfill/bulk/replay flags and correlation ID;
- sensitivity, source ACL, provenance, extraction/version and data-quality state.

The UI should report a composition, not just a count: client-initiated interactions, consultant effort, mutual working sessions, automated events, meaningful stage transitions, deliverables, commitments, and cadence deviation.

### Client Health

Health estimates the likelihood that the engagement will achieve agreed client and service outcomes without avoidable escalation. It is not customer sentiment alone and not a consultant-performance score.

Each dimension returns:

- status/range and normalized score only if coverage is sufficient;
- observed value, expected value/cohort baseline, trend and freshness;
- source IDs/timestamps;
- confidence/coverage and missing reason;
- contribution to any overall score;
- human-readable “why” and recommended next review—not an automatic action.

Proposed dimensions, to confirm with consultants in H0:

1. **Compliance delivery and outcomes:** validated milestones, stage completion, evidence acceptance, audit/assessment outcomes, major non-conformities and remediation closure.
2. **Commitment discipline:** client-owned commitments met/overdue, consultant-owned commitments met/overdue, blocker ownership, response/cycle time, rescheduling pattern.
3. **Relationship and engagement:** client-initiated responses, attended working sessions, reciprocal cadence, key-contact continuity, unresolved communication gaps. Internal notes alone do not count as client engagement.
4. **Service capacity and execution:** consultant effort relative to package/lifecycle expectations, burn variance, workload concentration, blocked work, dependency age. High effort can be either planned service or distress.
5. **Lifecycle and commercial risk:** renewal proximity, arrears/financial signals where authorized, suspension/churn state, scope mismatch, package exhaustion, regulatory deadlines.
6. **Data confidence:** freshness, source coverage, known defects, timestamp validity, extraction confidence, cohort sufficiency, and job health.

### Consultant Attention/Triage

Attention is a queueing decision based on urgency, impact, due date, ownership, confidence, and intervention opportunity. It may prioritize a healthy client with a near-term deadline or a low-confidence client needing data cleanup. It must display the contributing reasons separately from health.

Recommended rank components:

- hard deadlines and regulatory impact;
- high-severity verified risk or unresolved audit outcome;
- overdue client commitment and overdue consultant commitment as separate signals;
- worsening health trend with adequate confidence;
- cadence breach relative to the client's plan/cohort;
- data-quality failure that blocks a safe assessment;
- renewal/package event requiring a decision;
- outstanding intervention with no follow-up.

### Intervention Effectiveness

Record the full decision trail:

- triggering signal snapshot and scoring version;
- suggestion shown and whether it came from rules, Claude, or a consultant;
- viewed, accepted, modified, dismissed, snoozed and reason;
- action owner/due date/completion;
- follow-up horizon and outcome observation;
- confounders and concurrent interventions;
- human override and audit history.

Score movement after an intervention is an association, not proof of causality. Causal claims require a randomized, stepped-wedge, or defensible quasi-experimental design approved separately.

### Metric catalogue

Every KPI must declare:

- business question and owner;
- exact grain, formula, numerator/denominator and exclusions;
- event time vs processing time, timezone and late-arrival behavior;
- cohort/package/lifecycle normalization;
- source-of-truth tables and semantic version;
- RLS/capability/sensitivity class;
- freshness SLO, minimum coverage and unknown behavior;
- known confounders and prohibited interpretations;
- quality tests and retirement process.

---

## 7. Candidate metrics and confounders

| Metric family | Useful candidates | Required caveats |
|---|---|---|
| Activity composition | client-initiated contacts, consultant touches, mutual meetings, meaningful deliverables, automated events, unique active days | deduplicate bulk/backfill; classify actor and direction |
| Cadence | days since reciprocal contact, planned vs actual touch cadence, missed/cancelled working sessions | package/lifecycle-specific; absence may be planned |
| Progress | validated stage transitions, completed mandatory deliverables, evidence accepted, remediation closure velocity | fix status domains; do not infer from note count |
| Commitments | client-owned due/met/overdue, consultant-owned due/met/overdue, median resolution time | ownership and due-date completeness are mandatory |
| Outcomes | audit/assessment result, non-conformity severity, regulatory submission/approval, closure/rework rate | distinguish leading signals from lagging outcomes |
| Service demand | consultant minutes, active authors, after-hours/escalation work, burn variance, rework loops | effort can indicate planned scope, complexity, or distress |
| Relationship | response latency, reciprocity, contact continuity, decision-maker participation | email/note linkage is currently incomplete |
| Lifecycle/commercial | renewal horizon, package exhaustion, arrears, suspension/churn, scope changes | authorize sensitive financial data separately |
| Data quality | coverage %, stale sources, failed jobs, invalid/future timestamps, unmatched identities | directly reduces confidence; never maps to healthy |
| Intervention | recommendation adoption, time-to-action, follow-up completion, outcome delta | no causal claim without experiment design |

Do not compare raw metrics across clients without stratifying at least by lifecycle phase, package/service, expected cadence, regulatory pathway, client size/complexity where available, and time under management. Separate client-caused blockers from Vivacity-caused blockers. Seasonality, consultant documentation habits, staff changes, migrations/backfills, package design, and bulk automation are material confounders.

---

## 8. Target data architecture

### Health subject and rollup grain

The atomic health subject is not automatically the tenant. A tenant may have concurrent package instances/service engagements at different lifecycle stages and with different commitments. H1 must approve a stable `health_subject` identity, normally **tenant × service engagement/package instance**, plus explicit tenant-only subjects for genuinely tenant-wide signals.

Tenant-level health is a separately versioned rollup. Its aggregation rule, hard-stop behavior, missing-coverage rule and explanation must be declared; it may not silently flatten one distressed engagement and one healthy engagement into an unexplained average. Every source, signal, score, attention item and extraction carries both `tenant_id` and `subject_id`, with composite relational integrity or an equivalently validated server-side invariant preventing a source from another tenant being attached to the subject.

### 8.1 Preserve operational sources; add versioned projections

Do not rewrite note, timeline, stage, task, risk, package, audit, meeting, email, or time-entry tables into one mega-table. Keep authoritative writes normalized and create additive, private analytical projections.

Candidate logical objects—final names require the parent's P1 ADR:

| Object | Grain | Purpose |
|---|---|---|
| `client_activity_event_v1` | one canonical business event | normalized event taxonomy, actor/direction, source/provenance, backfill/bulk flags; nullable validated service-engagement attribution |
| `client_activity_daily_fact` | tenant × date × event family × actor class, optionally service engagement | fast trends without rescanning raw text/events; ambiguous events remain tenant-level rather than being forced into a package |
| `client_health_signal_snapshot` | health subject × signal × observed window × version | deterministic raw/normalized value, freshness, coverage, sources and reason codes |
| `client_health_dimension_snapshot` | health subject × dimension × observed window × score version | dimension result, contribution, confidence and explanation |
| `client_health_score_snapshot` | health subject × observed window × score version | optional overall score/status plus coverage; immutable history |
| `client_attention_item` | health subject × deterministic reason instance | actionable urgency/impact/owner/due-state, separate from health |
| `client_intervention` | one recommendation/action lifecycle tied to tenant and subject | adoption and outcome trail |
| `client_note_extraction` | source note revision × prompt/schema/model version, associated to tenant/subject where valid | structured Claude output, citations, confidence, review and override |
| metric/dimension registries | one semantic version | formula, owner, validity interval, thresholds and lifecycle |

These should live in a private/non-Data-API schema when they are analytical internals. Publish narrowly scoped invoker-context RPCs or views for UI/Ask Viv. Service-role batch writers receive only the minimum required privileges.

Minimum key/state contract across these objects:

- stable source identity: `source_system`, source type/table, source primary key, source revision/input hash;
- deterministic idempotency/dedup key and tenant/subject composite integrity;
- `occurred_at`, `available_at`, `recorded_at`, `processed_at`, measurement-window bounds, semantic version and run ID;
- tombstone/deletion, quarantine, supersession and correction state;
- snapshot uniqueness over subject, metric/dimension, measurement window or `as_of`, semantic version and run policy;
- feature computations include only facts with `available_at <= as_of`; reconstructed/backtest output records `calculation_mode`, event cutoff, source-availability cutoff and processing time;
- recomputation inserts a new run/version or explicit superseding correction and never rewrites what was historically observed.

`client_attention_item` needs a deterministic reason fingerprint and append-only state history so scheduled runs do not create duplicates. Interventions use append-only intervention events plus a current-state projection. Note extraction separates immutable machine output from consultant-accepted assertions, supports retry/supersession, and never copies raw note text into the analytical row.

A private schema alone is not a security boundary: exclude it from Data API exposure, revoke `PUBLIC`, `anon` and `authenticated` schema/table privileges, grant only narrow wrapper signatures, and prove direct PostgREST/RPC denial.

### 8.2 Time and provenance

- Preserve `occurred_at`, `recorded_at`, `processed_at`, source update time, and snapshot `as_of` separately.
- Use immutable snapshots for score history; never overwrite past scores after formula changes.
- Recompute through versioned, idempotent jobs and record run completeness, input watermark, counts, errors, duration and code/model versions.
- Late/backfilled events update the appropriate historical fact and trigger explicit affected-window recomputation.
- Every surfaced signal links to authorized source IDs, not copied free text.
- Future dates or clock anomalies quarantine the signal and reduce coverage.
- Daily facts declare the business timezone and DST/date-boundary behavior. Per source/version/window, reconciliation must prove `eligible = projected + intentionally filtered + quarantined + tombstoned`; deduplication is recorded rather than hidden.
- Define snapshot cadence, raw/derived retention and compaction, index/storage/WAL ceilings, deletion SLA and full-rebuild cost before H3. The existing 337,272 snapshots in roughly 84 days are the amplification warning.

### 8.3 PostgreSQL performance pattern

- Page candidate tenant IDs before aggregating child facts.
- Replace per-tenant N+1 Edge calls with bounded set-based SQL/RPC contracts.
- Use composite/partial/covering indexes only after `EXPLAIN (ANALYZE, BUFFERS)` in an isolated production-like environment proves the access path.
- Prefer keyset pagination for long event/attention feeds.
- Apply constraints and FKs only after every frontend, RPC, trigger, Edge and integration writer is inventoried.
- Keep transactions short; make batch runs resumable and idempotent.
- Do not partition at current scale without measured pruning, retention, and maintenance benefit.
- Track `pg_stat_statements`, relation/index growth, batch lag, invalid indexes, locks and RLS execution cost.

Incremental workers require a durable watermark plus overlap window, lease/claim and concurrent-run exclusion, bounded retries/backoff, poison-record quarantine, maximum run duration and idempotent publication. The run ledger distinguishes invocation success, processing completeness and publication success. For data-bearing releases, rollback normally means feature cutback, job stop and forward correction—not a destructive down migration.

Invoker-context read contracts are the default. For every unavoidable `SECURITY DEFINER` wrapper: place internals in a private/non-exposed schema; use `search_path = ''` and fully qualified names; use a fixed non-login owner; revoke all unintended signatures; derive the human principal from `auth.uid()`; validate active principal, capability, target tenant and resource-to-tenant ownership inside the trusted boundary; reject supplied tenant/resource mismatch; and assert `proacl`, `prosecdef`, `proconfig`, owner and transitive definer dependencies. `row_security = off` is not a general performance shortcut.

### 8.4 BI model

Use a dimensional semantic layer rather than querying operational views directly:

- dimensions: tenant, date, consultant/staff, package/service, stage/lifecycle, channel, event type, risk/outcome type;
- type-2 histories: tenant lifecycle, CSC ownership, package/service subscription and regulatory classification;
- facts: activity, effort, commitments, stage transitions, deliverables/evidence, audit outcomes, health signals/snapshots, attention items and interventions;
- factless bridges: authorized staff↔tenant and tenant↔service/regulatory scope.

Facts must have one declared grain. BI identities, Ask Viv identities and batch-writer identities remain separate. The warehouse/read-replica/CDC decision stays behind the parent P7.3 measurement gate.

All type-2 joins are `as of` the fact time, with explicit denominator/censoring rules, cohort minimums/suppression and no invented historical ownership/package state. Leading indicators, lagging outcomes and operational workload KPIs remain distinct. Portfolio aggregates and exports require per-measure capability/sensitivity checks, current scope, small-cell/difference-query protections where applicable, export audit and visible data-as-of watermark.

---

## 9. Anthropic/Ask Viv design

### Allowed first use

Claude may extract, in strict structured output:

- client-stated and consultant-stated commitments, owner and due date;
- blockers/dependencies and attributed owner;
- progress/evidence milestones;
- unresolved questions/decisions;
- urgency/escalation language;
- relationship/cadence observations;
- ambiguity, abstention and confidence;
- exact source note IDs and supporting spans/timestamps.

Deterministic SQL remains authoritative for counts, dates, stage/task state, package usage, financial values, permissions, score calculation and cohort comparisons.

### Required controls

- Source notes are untrusted text; the system prompt must prohibit following embedded instructions. Delimit notes as inert data and give extraction calls no tools or credentials.
- Authorize tenant and note access before retrieval and again before returning a citation. Treat model-returned source IDs as untrusted candidates: they must be a subset of the authorized request manifest, resolve server-side to the same tenant/subject, match the stored source hash/revision, and contain a deterministically validated supporting span. Persist span offsets plus source-revision hash by default rather than duplicated note text; any necessary excerpt inherits the source ACL, sensitivity, retention and deletion behavior exactly.
- Production inference processes one target tenant per model request. Multi-client evaluation uses synthetic or verified irreversibly redacted material in an isolated harness with no production credentials; pseudonymization alone is insufficient.
- Minimize/redact PII and sensitive data. Prompts, requests, responses, retry/dead-letter payloads, APM/Sentry events and human-review exports inherit the source sensitivity and retention policy; never put raw notes in ordinary logs or traces.
- Sanitize and escape all rendered model text, prohibit model-authored HTML/Markdown links and arbitrary URLs, and construct clickable citations server-side only from validated authorized IDs.
- Use Structured Outputs with an exact schema, enums, bounded arrays, `confidence`, `abstain_reason`, citations and source identifiers.
- Record tenant, source ACL/sensitivity, input hash, source versions, model ID, prompt version, schema version, run ID, timestamps, token/cost, processing region/retention posture, and reviewer/override state.
- Store outputs and evidence, not hidden chain-of-thought.
- If citations and Structured Outputs cannot be combined in one supported request, use a two-step extraction then citation-validation pipeline.
- Establish Anthropic Zero Data Retention/retention eligibility before production note processing. Do not use Message Batches for sensitive notes merely for cost efficiency; Anthropic documents batch retention of up to 29 days and notes that Message Batches are not ZDR eligible.
- ZDR alone is insufficient: obtain DPA/legal/data-residency approval per feature, check caching/files/batches and subprocessors, define provider-change response and deletion SLA, cancel queued work on deletion/revocation, and disable unapproved persistence features by default.
- API keys stay server-side, rotate, and never enter browser bundles, prompts, logs or traces.
- Add per-tenant/model budgets, concurrency limits, retries with idempotency keys, circuit breaker, kill switch, and deterministic fallback.
- No automatic write/action from model output in initial phases.

Derived data never launders privilege. It inherits at least the strictest source sensitivity and retention. Every read rechecks current authorization for the extraction and each citation; historical CSC assignment is BI context, not current authority. Source deletion, tenant reassignment, ACL/sensitivity or consent change, retention expiry, or membership revocation tombstones/suppresses affected output and queues purge/rebuild.

### Corpus and evaluation set

Do not train or validate on “high-note clients” alone. Build a consultant-curated, deidentified stratified reference set across:

- high/medium/low activity;
- healthy/stalled/escalated outcomes defined independently of the model;
- lifecycle and package/service types;
- different consultants and documentation styles;
- sparse, contradictory, delayed and backfilled data;
- adversarial prompt-injection and sensitive-data cases.

Proposed starting set: 200–500 notes/events, two independent annotators, adjudication, explicit label guide and inter-rater agreement. Freeze an untouched temporal holdout. High-note examples are valuable for discovering patterns, but not representative ground truth.

Annotator access is approved and logged. The restricted/encrypted workspace, export prohibition, reidentification review and destruction date are recorded; raw note bodies never enter git or ordinary local artifacts.

### Ask Viv presentation

An answer should state:

- health dimension and trend;
- confidence/coverage and freshness;
- deterministic contributing facts;
- note-derived themes clearly labelled as extracted/consultant-reviewable;
- citations to records the caller can open;
- recommended next review/action with owner and due date if one exists;
- uncertainty and missing data.

Ask Viv must be able to answer “why?”, “what changed?”, “what evidence supports this?”, “what is unknown?”, and “what would change the assessment?”

---

## 10. Implementation plan — small PR stack

Every PR starts from fresh `origin/main` in its own worktree. Regenerate source/live inventories and preserve unrelated concurrent changes.

### H0 — characterize and contain current risk

#### H0.0 — Contain misleading legacy health

- Add an additive `data_status`/quality/reason/freshness contract and a one-switch consumer flag.
- Where stage/forecast inputs are known defective, deprecate/suppress the health label or show an explicit “unavailable—data repair in progress” badge; retain the operational triage workflow and raw evidence links.
- Do not expose `not_authorized` or hidden-source existence as a caller-visible missing reason. Omit/redact the field or return generic unavailable; exact denial detail belongs in protected audit/diagnostics.
- Carl must explicitly decide whether the faulty stage cron continues temporarily for forensic continuity or is paused. Implementation must not infer that operational decision.

**Exit:** no user or Ask Viv consumer can interpret known-defective/missing inputs as healthy/stable; feature cutback is tested.

#### H0.1 — Current-state contract and reproducible read-only audit

- Add bounded inventory scripts/queries for the dashboard graph, status dictionaries, scheduled functions, cron/log outcomes, row coverage, timestamps, ownership and downstream consumers.
- Document exact formulas, defaults, caps, fallbacks and caller permissions.
- Add synthetic characterization fixtures for high activity/healthy, high activity/distressed, low activity/on-plan, low activity/stalled, missing sources and future timestamps.
- Mark the July dashboard-health KB conclusions as historical/superseded by the September evidence; do not rewrite the audit trail.

**Exit:** every current card/rank/Ask Viv fact has a source, formula, freshness, known defect and authorization boundary.

#### H0.2a — Stage/task status-domain ADR and fixtures

- Inventory all task status domains (`staff_task_instances`, client/package/compliance/task tables), dictionaries, RPC writers, triggers, imports and UI consumers.
- Decide canonical completion/overdue semantics and classify legacy status `0` without coercing it.
- Add tests proving status 2 is not completed and status 5 is completed where that dictionary applies.

**Exit:** 100% status-domain mapping coverage and reproducible expected progress/overdue fixtures; no production cutover.

#### H0.2b — Set-based versioned stage-health calculator

- Replace unpaginated scans with a bounded set-based computation and prove completeness beyond the default response cap.
- Use the approved subject grain, status mapping, event-time cutoff and explicit unknown behavior.
- Benchmark in the isolated production-like environment.

#### H0.2c — Shadow writer, run ledger and bounded comparison

- Keep old snapshots intact and generate a new semantic version in shadow mode.
- Reconcile inputs/results and compare bounded historical/current cases without presenting a reconstruction as the score known at that historical time.
- Decide retention/cadence before accumulating new snapshots.

#### H0.3a — Shared run-ledger and unknown-state contract

- Add run ledger/health checks: input watermark/count, processed/skipped/error counts, output count, duration and version.
- Alert on cron HTTP failure and on “success” with incomplete/truncated inputs.

#### H0.3b — Risk-job consumer inventory and disposition

- Characterize the `run-tenant-risk-forecast` 500 with logs and source/live-schema comparison.
- Prove whether it has a live consumer. Repair into a validated versioned shadow job or retire/mark unavailable; do not rebuild an obsolete job by assumption.

#### H0.3c — Retention-job consumer inventory and disposition

- Characterize the `run-retention-forecast` 500 and known source-schema mismatches.
- Prove live consumers and business ownership. Repair into a validated versioned shadow job or retire/mark unavailable.

#### H0.3d — Unknown-state consumer adoption

- Make failed/missing/stale sources return generic caller-safe unknown/unavailable reasons.
- Remove misleading healthy/stable defaults across dashboard, Ask Viv and executive consumers after characterization.
- Ship independently from any replacement score.

**Exit:** jobs either produce validated versioned shadow outputs or expose explicit unavailable state; no silent zero-risk fallback.

#### H0.4 — Verification environment, measured baselines and proposed budgets

- Provision synthetic multi-tenant identities for scoped/unscoped CSC, team leader, Super Admin, client A/B and disabled/revoked principals in an isolated database/Edge environment.
- Close or explicitly retain the current gaps: only Super Admin/client-demo authenticated Playwright states, service-role live-RLS tests skipped without their secret, and no local Deno runtime.
- Capture signed p50/p95, row/byte, concurrency, database buffer/CPU/temp/WAL, batch duration, storage growth/rebuild and alert-load ceilings at realistic volume/skew.
- Publish measured baselines and proposed numeric coverage floors, minimum evidence counts, outcome horizons, corpus sample/confidence requirements, performance ceilings, alert-burden ceiling and consultant-usefulness threshold for H1 approval.

**Exit:** the environment gaps, measured baseline and proposed numeric artifacts are explicit. Later phases cannot use “budget met” or “persona tests pass” while required evidence is absent; unavailable evidence is Inconclusive, not Pass.

### H1 — define semantics with the Vivacity team

#### H1.1 — Health/activity/attention metric ADR

- Workshop the four product contracts and six proposed health dimensions with CSCs, team leaders, compliance specialists and management.
- Define lifecycle/package cohorts, expected cadence, commitment ownership and adverse/positive outcomes.
- Approve prohibited uses: consultant ranking from client health, raw-note-volume health, unsupported causal claims, automated client actions.

**Exit:** Carl/product/data/security sign-off, named metric owners, and signed coverage/evidence/outcome/performance and pilot thresholds before H2/H3.

#### H1.2 — Reference corpus and outcome labels

- Select the stratified deidentified sample and write the annotation guide.
- Two annotators label blockers, commitments, progress, urgency, ownership, evidence and outcomes; adjudicate disagreements.
- Define independent outcome labels and observation horizons; prevent future-data leakage.

**Exit:** accepted label quality/inter-rater threshold, immutable temporal holdout, no raw production note bodies in git.

### H2 — canonical activity foundation

#### H2.1 — Event taxonomy and actor/source mapping

- Version the event taxonomy and map notes, emails, meetings, timeline events, stage changes, tasks, evidence, audits, time entries and system events.
- Classify client/staff/system actor, direction, bulk/backfill/replay and semantic importance.
- Quarantine unmapped event types rather than guessing.

#### H2.2a — Private activity schema and permissions

- Add the event and daily-fact projections in a private schema through additive migrations.
- Add late-arrival, deletion/tombstone, rebuild and rollback behavior.

#### H2.2b — Incremental writer and run controls

- Implement watermarks/overlap, lease, retry/backoff, quarantine, concurrency exclusion and run-ledger completeness.

#### H2.2c — Bounded resumable backfill and reconciliation

- Backfill idempotently in bounded windows; record counts/hashes/watermarks.
- Prove by source/version/window: `eligible = projected + intentionally filtered + quarantined + tombstoned`.

#### H2.3 — Activity API and shadow UI

- Publish a narrow RBAC-scoped contract with keyset pagination and activity composition.
- Shadow it against `/client-activity` and existing recent-comms behavior.
- Show client participation, consultant effort and system activity separately.

**Exit H2:** the reconciliation equation balances for every mapped source, backfill/bulk events cannot inflate engagement, cross-tenant negative tests pass, and H0 numeric budgets are met.

### H3 — deterministic health and attention v1

#### H3.1 — Signal registry and versioned computation

- Implement only approved deterministic signals with source provenance, freshness, coverage, cohort expectation and reason codes.
- Separate client-owned and Vivacity-owned commitments/blockers.
- Add hard-stop overrides only for evidence-backed severe events.
- Do not silently redistribute weights when a signal is missing; suppress the dimension/overall score below the approved coverage floor.

#### H3.2a — Current score/dimension snapshot

- Create immutable versioned signal/dimension/score snapshots and a complete run ledger.
- Compare new results with curated cases, independent outcomes and the current heuristic without making the heuristic ground truth.
- Provide per-component contribution and counterfactual explanation.

#### H3.2b — Bounded historical reconstruction/backtest

- Reconstruct only approved windows with `calculation_mode`, event-time and source-availability cutoffs.
- Never label a reconstruction using later-available facts as the contemporaneous historical score.
- Append corrections/superseding versions; do not mutate immutable history.

#### H3.3 — Attention queue contract

- Generate reason-specific attention items from deadlines, verified risks, overdue commitments, worsening trends, data-quality failures and follow-up needs.
- Deduplicate, assign, snooze/resolve and audit items without mutating source records.
- Preserve urgent hard rules independently of an overall score.

#### H3.4 — Shadow Triage Dashboard

- Add a protected shadow/canary UI with activity, dimensions, confidence, trends and reasoned attention.
- Keep the legacy operational workflow available for comparison, but never describe known-defective health labels as authoritative; H0 containment remains active. Visibly distinguish deprecated/unavailable legacy data from shadow values.
- Collect consultant usefulness/false-positive/false-negative feedback.

**Exit H3:** no unexplained parity/data-quality defects, all signals traceable, unknown behavior proven, rollback rehearsed, consultants approve usefulness before cutover.

### H4 — intervention workflow and measurement

#### H4.1 — Intervention ledger

- Add suggestion/view/accept/modify/dismiss/snooze/action/follow-up/outcome states with actor, timestamps, version and reason.
- Enforce RBAC and immutable audit history.

#### H4.2 — Consultant workflow pilot

- Pilot with a small approved CSC cohort.
- Measure acknowledgement, action completion, time-to-action, false alert burden, snooze/dismiss reasons and data correction—not client outcomes alone.
- Do not use health as a staff performance target during validation.

### H5 — Anthropic structured-extraction pilot

#### H5.1 — Threat/privacy/retention gate

- Approve data classification, ZDR/retention, regions, source minimization, prompt-injection model, logging and incident response.
- Add tenant/capability checks before retrieval and citation return.

#### H5.2 — Offline evaluation harness

- Implement strict schemas and versioned prompts against the frozen reference set.
- Compare Claude output with a rules/simple baseline and human labels.
- Test unsupported claims, citation support, prompt injection, abstention, malformed output, sensitive-data leakage, cost and latency.

#### H5.3 — Shadow extraction and human review

- Process only an approved bounded cohort; persist provenance and citations.
- Expose suggestions/themes for consultant confirmation; do not write authoritative facts automatically.
- Provide per-model/prompt/schema rollback and kill switch.

**Exit H5:** all security/privacy gates pass and the acceptance thresholds in §12 are met before any score consumes extracted data.

### H6 — validated analytics and predictive decision gate

#### H6.1 — BI semantic layer

- Publish governed facts/dimensions/metric definitions and reconcile operational totals.
- Add effective-dated ownership/lifecycle/package context and access-tested exports.

#### H6.2 — Outcome validation

- Use temporal holdout, calibration plots/Brier score, precision/recall, top-decile lift and cohort fairness/error analysis.
- Compare deterministic v1 with simple baselines; do not advance a model that does not materially outperform them.
- Check feature leakage and consultant documentation-style bias.

#### H6.3 — Predictive weighting decision

- Only after adequate outcomes/history exist, decide whether statistical/ML weights add value.
- Version training data, features, labels, code, thresholds and model; monitor drift and calibration.
- Keep human override and deterministic hard-stop rules.

### H7 — canary, cutover and retirement

- Canary one consultant cohort and one dashboard/Ask Viv consumer at a time.
- Use an audited atomic active-version registry per consumer/cohort so only one score/model contract is authoritative at a time.
- Run live persona and direct API security tests, operational SLO checks and rollback drill.
- Cutback stops/cancels queued inference/batch work, revokes the bad job version's execution, suppresses affected derived rows, and supersedes—not deletes—attention/intervention items created from that version.
- One confirmed cross-tenant or critical sensitive-data leak triggers immediate stop/cutback and incident response.
- Preserve legacy contracts for an observation window.
- Retire old score/views/functions/cron jobs only after zero-use evidence and a separate cleanup PR.
- Update types, KB, audit log, metric catalogue, runbooks and model cards.

---

## 11. Per-PR verification contract

### Security and tenancy

- anonymous, client tenant A, client tenant B, CSC scoped/unscoped, team leader, Super Admin, disabled staff and batch-service tests;
- direct API/RPC cross-tenant denial, not browser hiding alone;
- exact function owner, grants, `search_path`, row-security mode and transitive definer dependencies asserted;
- note source and returned citation independently authorized;
- revoked membership/assignment, disabled principal with a still-valid token, account/session switch, target/resource swap, source ACL change between extraction/read and citation deletion after generation tested;
- portfolio aggregates respect the approved RBAC v6 scope and aggregation policy;
- small-cell/difference-query inference and export-specific authorization/audit tested;
- no service-role result presented as RLS evidence.

### Data correctness

- status dictionaries and mappings pinned by tests;
- source-to-projection counts/checksums and late/backfill/deletion cases reconciled;
- every signal traceable to source IDs, observed time and semantic version;
- missing, stale, future-dated and failed-job cases return explicit unknown/reason state;
- cohort/lifecycle/package normalization fixtures included;
- fixtures include concurrent packages, ownership reassignment, DST/timezone boundaries, future clocks, late arrival, duplicates/replay, deletion, status drift, partial batches and source revocation;
- no raw activity count used as health;
- no current heuristic used as the sole oracle.

### Performance and reliability

- baseline and candidate `EXPLAIN (ANALYZE, BUFFERS)` in isolated data with realistic skew;
- the isolated Supabase/Edge environment and required `pg_stat_statements` access are prerequisites; unavailable tools/data are recorded as Inconclusive;
- request count, transferred bytes, database time, p50/p95 UI/API latency and batch duration recorded;
- no N+1 query path; pagination/completeness proven beyond the default response cap;
- index write/storage cost and RLS policy cost measured;
- retry/idempotency, partial failure, alert, stale behavior and rollback tested;
- no new in-scope Supabase security/performance Advisor regression.

### Frontend and Ask Viv

- `npm run test:frontend`, focused affected tests, `npm run typecheck` with existing baseline disclosed, `npm run lint:ratchet`, and production build;
- Playwright live navigation across `/dashboard`, `/triage-dashboard`, `/client-activity`, `/manage-tenants` and a tenant detail route for available personas;
- persistence proof for the shared dashboard layout if route Phase 2 has landed;
- UI shows why/source/freshness/confidence and distinguishes unknown from healthy;
- Ask Viv citations open only authorized sources and remain tenant-correct;
- old/new shadow comparison and one-switch cutback exercised.

### Documentation and operations

- dated audit entry for every database/RLS/function/trigger/grant/cron/model-processing change;
- metric catalogue, schema map, job runbook, data-quality dashboard and model/prompt card updated;
- migration forward-fix/rollback and data-rebuild procedure rehearsed;
- production change remains separately authorized by Carl.

---

## 12. Proposed acceptance thresholds — confirm in H0/H1

These are proposed gates, not claims about current performance:

- 100% passing tenant/RBAC positive and negative tests for each exposed contract.
- 100% of displayed health components traceable to source IDs, `observed_at`, freshness, formula/model version and confidence.
- Report first-pass and post-retry structured-output conformance separately in the offline suite; every production-invalid output fails closed.
- Offline readiness target: at least 95% claim-level citation support and no more than 2% unsupported noncritical claims in the bounded evaluation. Production presentation requires 100% of displayed note-derived factual claims to have a currently authorized, deterministically validated citation, zero unsupported critical claims, and zero leakage. Human review cannot waive authorization or citation validation.
- For blocker and commitment extraction separately, initial target precision ≥85% and recall ≥90%, with H1-approved minimum samples and confidence intervals.
- Zero automatic client-impacting actions in v1.
- Unknown/suppressed overall health whenever approved source coverage is below the dimension/overall floor; no missing-weight redistribution.
- Predictive work, if later approved, must beat a simple baseline, show calibrated probabilities, and achieve at least 2× adverse-outcome lift in the top risk decile on an untouched temporal holdout, with an approved minimum number of positive outcomes and confidence interval; thresholds must also be viable by cohort.
- Batch run ledgers reconcile all eligible inputs as processed, intentionally skipped with reason, or failed; silent truncation count is zero.
- For each mapped source/version/window, activity reconciliation balances `eligible = projected + intentionally filtered + quarantined + tombstoned`, with deduplicated/replayed counts reported explicitly.
- Performance budgets are set from H0 measurements; no release may regress the agreed triage/dashboard p95 or primary-database load budget.
- Consultant pilot explicitly meets agreed usefulness and alert-burden thresholds before broader rollout.

---

## 13. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Health score hides nuance | dimension-first UI, transparent contributions, hard-stop reasons, optional overall score |
| Missing data appears healthy | explicit unknown/reason/coverage; suppress below floor |
| Note volume rewards documentation | separate effort, client engagement and system activity; never raw-count health |
| Consultant behavior biases scores | cohort/style analysis, outcome-based validation, no staff performance use during pilot |
| Historical status drift corrupts labels | dictionary inventory, versioned repair, do not overwrite old snapshots |
| Unpaginated jobs silently truncate | set-based RPCs, pagination proofs, run ledgers and reconciliation |
| Security-definer optimization widens access | RBAC v6 decision contract, narrow outputs, direct negative tests, grants/owner assertions |
| Cross-client LLM leakage | per-source authorization, tenant-scoped requests, citation recheck, adversarial tests |
| Prompt injection in notes | untrusted-content boundaries, structured schema, no tool/action authority |
| Sensitive data retained by provider/logs | minimization, redaction, approved ZDR/retention, no raw-note logging |
| False causal claims | intervention ledger and explicit association language; experiments required for causality |
| Score gaming or Goodhart effects | no single KPI for staff appraisal, metric review, audit and counter-metrics |
| Model or formula drift | immutable versions, temporal monitoring, kill switch and rollback |
| ERP/BI load harms OLTP | daily facts, bounded APIs, parent warehouse/CDC decision gate |
| One future timestamp distorts freshness | validation/quarantine and quality signal |
| Scope balloons into dashboard redesign | semantic/data contract first; UI polish separately approved |

---

## 14. Explicit non-goals

- No production mutation in this planning session.
- No silent fix of unrelated Triage Dashboard, route, onboarding RPC, Outlook, timeline, or tenant-assignment bugs. Flag and scope them explicitly.
- No consultant performance ranking or compensation KPI derived from client health.
- No client-facing score until separately designed, validated, and approved.
- No sentiment-only health model.
- No raw-note-volume, event-volume, login-count, package-burn, or time-spent proxy presented as health by itself.
- No autonomous client messaging, task/stage mutation, escalation, renewal decision, or compliance judgment.
- No causal claim from observational before/after score movement.
- No all-notes embedding/extraction backfill before security, retention and evaluation gates.
- No warehouse, streaming platform, partitioning, vector-store replacement, or new vendor merely because it is fashionable.
- No destructive schema rewrite or same-release source retirement.
- No attempt to preserve every current dashboard number as semantically correct; preserve behavior for comparison, then approve explicit corrections.

---

## 15. Council reviews and plan adjustments

### Seat A — live data, schema and operational behavior

**Challenge:** Is the present dashboard merely incomplete, or actively misleading?

**Finding:** It is not safe as a health oracle. The task-status mapping is inverted against the live dictionary, progress is universally zero in the inspected snapshots, active clients are overwhelmingly critical, scheduled forecast jobs fail, and absent inputs can collapse toward reassuring defaults. High note/event volume is dominated by internal/service/system behavior.

**Adjustment:** Added H0 stop-gates, a dedicated status-domain repair PR, explicit unknown states, job run ledgers, truncation proof, and a prohibition on using current snapshots as labels.

### Seat B — customer-success methodology and BI

**Challenge:** Will one weighted score help consultants, or erase the operating context?

**Finding:** Mature health practice separates activity, health and intervention outcomes, supports dimension-level scoring/history, and treats missing coverage explicitly. Dimensional BI requires stable grains and effective-dated context.

**Adjustment:** Split four product contracts, made the UI dimension-first, required a metric catalogue and cohort normalization, and kept overall scoring optional/suppressible.

### Seat C — AI safety, evaluation and privacy

**Challenge:** Can Claude safely convert rich notes into a more robust health signal?

**Finding:** Yes, as a bounded evidence extractor and narrative assistant—not as the calculator or policy engine. High-note sampling is biased, note text is untrusted, citations/structured outputs need explicit orchestration, and retention/ZDR behavior matters.

**Adjustment:** Added a stratified two-annotator reference set, temporal holdout, structured extraction with abstention/citations, provider-retention gate, prompt-injection suite, human review, no raw-note logs and zero automatic action.

### Seat D — security/RBAC and rollback

**Challenge:** Can portfolio analytics remain fast without repeating a broad row-security bypass?

**Finding:** The current definer RPC solved a real timeout, but a new analytics surface can silently broaden notes, financial, health or export access. UI filters are not authorization. Formula/model rollback does not guarantee data-contract rollback.

**Adjustment:** Made RBAC v6 a precondition, required direct cross-tenant probes and exact grant/owner assertions, separated UI/API/batch identities, and required independent model/prompt/metric/data-contract kill switches and canaries.

### Seat E — Claude Code implementation and data architecture

**Challenge:** Can the document actually be executed as small reversible PRs for multi-package ERP clients?

**Finding:** The first draft lacked immediate containment, left parent/companion ownership ambiguous, used a tenant-only health grain, bundled multiple rollback units into H0/H2/H3, and assumed persona/performance evidence the current environment cannot provide.

**Adjustment:** Added H0.0 containment; an ownership/dependency crosswalk; service-engagement/package-instance subjects plus explicit tenant rollup; finer PR boundaries; key/idempotency/time/run contracts; reconciliation equations; worker and retention budgets; and H0.4 synthetic identities, Edge/database harness and signed numeric gates.

### Seat F — adversarial security, privacy and inference

**Challenge:** Can optimized or AI-derived data expose information after authorization changes or through aggregates/citations?

**Finding:** A private schema or stored source ACL is insufficient. Derived content may outlive authority; model-provided IDs/links are untrusted; cross-client prompts, small cohorts and score explanations can leak restricted data; rollback must address queued and already-derived state.

**Adjustment:** Prescribed hardened definer wrappers, current-ACL and source-to-tenant revalidation, derived-data sensitivity/tombstone propagation, one-tenant production inference, deterministic citations and safe rendering, provider-retention/deletion controls, aggregate/export inference protections, revocation-race tests and atomic active-version rollback semantics.

### Council verdict

**Proceed only as a separate companion plan after the prerequisite gates.** H0 read-only characterization and behavior-restricting containment may begin early. The urgent semantic/job defects should be fixed as bounded reliability PRs, but the replacement health score must wait for RBAC scope, canonical operating context, metric agreement, and shadow evidence. The parent plan owns generic event/provenance/freshness/security/audit primitives; this plan owns health-specific taxonomy, subjects, metrics, attention/intervention ledger and workflow, corpus evaluation, Anthropic extraction, and health cutover.

---

## 16. Decisions Carl and the Vivacity team must approve

1. Which adverse and positive client outcomes define health for each lifecycle/package cohort?
2. Should an overall score exist, or should consultants initially see dimensions plus attention reasons only?
3. What minimum source coverage suppresses a dimension and the overall score?
4. Which roles may see portfolio-wide health, raw notes, financial risk, AI themes, exports and intervention history under RBAC v6?
5. Which commitments are client-owned versus Vivacity-owned, and who may correct ownership?
6. What cadence is expected by package/lifecycle, including intentionally quiet periods?
7. Which consultants will annotate the reference set and participate in the pilot?
8. Is Anthropic processing approved for each sensitive note class, under what retention/ZDR arrangement and region?
9. What alert-burden/usefulness thresholds permit expansion beyond the pilot?
10. Which outcomes and time horizons permit later predictive validation?

---

## 17. Claude Code execution contract

For each phase:

1. Read this document, the parent tenant plan, RBAC v6 plan, `AGENTS.md`, relevant KB/audit entries and current source.
2. Start from fresh `origin/main` in a dedicated worktree; regenerate all facts and record the commit/live observation time.
3. Open one small PR with one semantic purpose. Do not bundle route cleanup, UI redesign, schema repair, AI integration and cleanup.
4. Before tightening a constraint or changing a status meaning, sweep frontend writers, RPC bodies, triggers, Edge Functions, cron/import/integration paths and deployed definitions.
5. Use an isolated Supabase branch with synthetic/skewed fixtures for DDL and performance tests. Production inspection remains bounded/read-only until Carl explicitly approves a production operation.
6. Preserve old contracts, shadow new output, compare, canary, observe, then retire later.
7. Include exact allowed/denied persona proof, query/completeness evidence, UI/Ask Viv evidence, rollback, and audit/KB updates.
8. If an unrelated defect is found, report it in the PR description and stop for scope decision; do not fix it silently.

---

## 18. Evidence reproduction manifest

H0.1 must convert this one-off manifest into checked-in, bounded, read-only queries with comments and exact cohort predicates. Until then, do not compare future numbers without reconstructing the same definitions.

| Evidence | Reproduction family | Cohort/window caveat |
|---|---|---|
| route/page/consumer graph | `rg` over `/triage-dashboard`, `useDashboardTriage`, attention/health views/RPCs and Ask Viv fact builders | repository baseline named above |
| view/function semantics | live `pg_get_viewdef`, `pg_get_functiondef`, function/grant/owner/config catalogs | deployed definitions may differ from migrations |
| stage snapshot distribution | counts/latest-per-stage, progress/status/freshness by tenant/stage | all historical tenants vs active cohort must be labelled separately |
| task status drift | `dd_task_status` joined/compared with active-stage task status counts and deployed monitor source | status `0` is legacy/unknown, not a dictionary value |
| active note distribution | active, non-test tenants; rolling 30/90-day note counts, resolved author class and source linkage | “active non-test” predicate must be checked into H0 script |
| timeline composition | active-client events by type, recorded/occurred time, backfill/delay/bulk markers over 90 days | raw rows are not deduplicated engagement |
| note-theme review | deidentified high-note cohort aggregate keyword/theme classification | exploratory only; not labels or model evaluation |
| correlations | per-active-tenant note counts vs consultant time, attention, stage completion and overdue actions | descriptive, small cohort, missing/constant inputs; no causal inference |
| forecast coverage | output-row counts/max generated time plus current consumer inventory | empty/stale is unavailable, not healthy |
| scheduler health | unified Edge logs for exact function path/status in explicit ≤24-hour window | one observed invocation per named nightly job; re-query exact timestamps |

The 54-client activity cohort, 53 displayed attention rows and broader historical stage/snapshot populations are different denominators. The implementation artifact must put the predicate, timestamp, row counts and excluded/test classifications beside every result.

---

## 19. Primary guidance consulted

- Gainsight, [Customer Health Score overview](https://www.gainsight.com/blog/customer-health-scores/), [measure weights](https://support.gainsight.com/gainsight_nxt/05Scorecards/02Admin_Guides/Measure_Weights_in_Scorecards), [score calculation](https://support.gainsight.com/gainsight_nxt/05Scorecards/02Admin_Guides/Calculation_of_Group_Scores_and_Overall_Scores), and [score history](https://support.gainsight.com/gainsight_nxt/05Scorecards/03User_Guides/View_and_Update_Scorecards_in_360)
- Microsoft, [Power BI star-schema guidance](https://learn.microsoft.com/en-ie/power-bi/guidance/star-schema)
- NIST, [AI Risk Management Framework](https://www.nist.gov/itl/ai-risk-management-framework), [AI RMF Playbook](https://airc.nist.gov/docs/AI_RMF_Playbook.pdf), and [monitoring deployed AI systems](https://www.nist.gov/publications/challenges-monitoring-deployed-ai-systems-center-ai-standards-and-innovation)
- Anthropic, [Structured Outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs), [search results](https://platform.claude.com/docs/en/build-with-claude/search-results), [citations](https://platform.claude.com/docs/en/build-with-claude/citations), [handling tool calls/untrusted results](https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls), [evaluation cookbook](https://platform.claude.com/cookbook/misc-building-evals), and [API data retention](https://platform.claude.com/docs/en/manage-claude/api-and-data-retention)
- scikit-learn, [probability calibration](https://scikit-learn.org/stable/modules/calibration.html)
- Supabase/PostgreSQL guidance applied through the repository's Supabase skills: set-based queries over N+1 calls, keyset pagination, measured composite/partial/covering indexes, explicit constraints, short transactions, RLS/grant verification and private analytical schemas.

---

## 20. Continuity note

If work resumes after a usage-window interruption, begin with this order:

1. verify the worktree/branch and fresh `origin/main`;
2. regenerate H0 live evidence without exposing client identities or note bodies;
3. confirm the active Codebase Optimization and RBAC v6 checkpoints;
4. obtain Carl's decision on the H0/H1 scope before production changes;
5. execute only the next approved PR; never infer production authority from this plan.
