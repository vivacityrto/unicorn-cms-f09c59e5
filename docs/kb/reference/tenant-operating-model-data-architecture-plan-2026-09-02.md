# Tenant Operating Model, Directory Performance, ERP, and Ask Viv Data Architecture Plan

> **Status:** council-reviewed implementation plan; no implementation or production mutation in this planning session
> **Prepared:** 2026-09-02
> **Repository baseline:** `origin/main@31083c49`
> **Planning branch/worktree:** `chore/tenant-data-model-optimization-plan` at `C:\Users\carls\repository\unicorn-workspace\unicorn-db-plan-20260902`
> **Primary surface:** `/manage-tenants` (`src/pages/ManageTenants.tsx`) and its `/tenant/:tenantId` detail workflow
> **Related programs:** [Codebase Optimization and KB Renewal Plan](./codebase-optimization-plan-2026-08-28.md), [RBAC v6 Authorization Plan](./rbac-v6-authorization-implementation-plan-2026-09-01.md), and [Client Health, Client Activity, Consultant Triage, and Intervention Analytics Plan](./client-health-activity-analytics-plan-2026-09-03.md)
> **Implementation owner:** Claude Code, one small PR at a time, only after Carl approves the phase
> **Production rule:** every schema, RLS, function, trigger, grant, constraint, backfill, or data correction needs a dated audit entry and separate explicit production authority

---

## 1. Executive decision

Do **not** begin by splitting the 64-column `tenants` table, replacing its primary key, partitioning tenant-owned tables, deleting “unused” indexes, or building one larger join. Those actions have high write-path and permission blast radius and do not address the clearest current bottleneck.

The first implementation objective is a **versioned, permission-safe Tenant Directory read contract** that replaces the browser's current assembly of approximately 37 PostgREST requests at today's roughly 415-tenant scale. It must preserve every current filter, count, assignment, package, contact, note, Xero, connected-tenant, and authorization behavior while returning only the fields needed by the visible page. The server should page tenant IDs first and aggregate child data only for those IDs.

The longer-term architecture should deliberately separate three models:

1. **Operational write model:** normalized authoritative records, business invariants, audit history, and tenant-safe relationships.
2. **Operational read models:** versioned directory and tenant-context contracts optimized for Manage Tenants, detail pages, dashboards, and exact Ask Viv facts.
3. **Analytics and retrieval models:** private BI facts/dimensions and provenance-rich Ask Viv chunks, updated asynchronously from committed operational changes when profiling proves that asynchronous projection is warranted.

This order delivers the highest UX value while keeping the legacy write model compatible. It also prevents the common ERP failure mode of turning the tenant master into either a wider mega-table or a destructive rewrite whose invariants are not yet known.

### Program outcomes

- Reduce the Manage Tenants cold-load fan-out from a code-derived ~37 requests to one paginated directory request plus at most one explicitly justified count/facet request.
- Stop transferring `tenants.*` and all tenant rows merely to render the first viewport.
- Establish a stable data contract that the frontend, Ask Viv, and later BI code can consume without coupling to private table layouts.
- Preserve current RLS/RBAC outcomes. Data optimization is not authorization redesign.
- Make tenant identity, lifecycle, contacts, assignments, packages, integrations, and activity source-of-truth rules explicit before normalization.
- Give Ask Viv exact, versioned structured facts for ERP questions and a separate, tenant-scoped retrieval projection for unstructured evidence.
- Introduce historical/effective-dated data only where business reporting needs it.
- Create a safe path to stronger integrity constraints using additive migrations, resumable backfills, shadow comparison, `NOT VALID` constraints, and separate contract cleanup.

### Explicit architectural call

Handle the **read path before the write model**. The directory is high-traffic and visibly slow, but a read-only additive contract can be shadowed and rolled back without rewriting tenant records. Schema normalization comes later, table by table, after caller/trigger/RPC inventories and parity evidence exist.

### Cross-program sequencing gate — code optimization, RBAC v6, then tenant data

Claude Code must preserve this agreed program order:

1. **Finish the currently active Codebase Optimization Phase 2 route/layout work.** Reach a clean merged checkpoint with route inventory, guard-tier characterization, build/tests, and Playwright persona evidence passing. Route and guard composition must stop moving before authorization becomes the next implementation focus.
2. **Run this tenant-data plan's P0 discovery only.** P0.1–P0.3 may inventory, benchmark, document, and build disposable verification evidence. They must not change production schema, authorization, directory authority, or user-visible behavior.
3. **Implement the RBAC v6 foundations.** Approve the capability/scope model, establish the server-side decision core in shadow mode, complete the AJ/CSC pilot, and explicitly decide whether each internal staff audience retains all-tenant read access for the directory, tenant detail, staff Ask Viv, cross-client retrieval, BI, and exports.
4. **Then begin this plan's P1/P2+ implementation.** Design and cut over tenant directory, operating-context, Ask Viv, integrity, and analytics contracts against the settled authorization vocabulary and scope decisions.
5. **Coordinate deeper RBAC/RLS migration and schema normalization as vertical slices.** Each slice owns its server enforcement, data contract, persona tests, migration evidence, and rollback; neither program silently changes the other program's policy.

The entire multi-phase code-optimization program does **not** need to finish before RBAC v6. The prerequisite is the currently active route/guard composition phase reaching a stable checkpoint. Conversely, tenant P0 evidence collection does not need to wait for RBAC because it is read-only and behavior-preserving.

**Stop gate:** if route/guard work is still moving, do not start RBAC implementation. If the RBAC staff-scope decision and shadow decision core are not approved, do not start tenant P1/P2 or publish a new directory/context/AI/BI permission surface. P0 discovery remains the only authorized tenant-data work before those gates.

### Companion client-health/activity program

The 2026-09-03 live Triage Dashboard investigation found that the present health graph is not a reliable foundation for ERP analytics: task status ID `2` is interpreted as completed although the live dictionary defines it as Not Started; all inspected stage-health progress values were zero; risk and retention jobs returned HTTP 500 and their current output tables were empty; recent notes were internal staff-authored; and 82.1% of recent timeline events were automated document-share events. Missing inputs must not be coalesced into reassuring “low/stable” values.

Keep the detailed remediation, health definitions, consultant workflow, corpus evaluation, Anthropic extraction, intervention ledger, outcome validation, and score cutover in the separate [Client Health, Client Activity, Consultant Triage, and Intervention Analytics Plan](./client-health-activity-analytics-plan-2026-09-03.md). This parent plan owns only the reusable foundations:

- generic event identity/provenance/freshness/quality vocabulary and optional outbox infrastructure. Companion H2 owns the health/activity-specific `client_activity_event_v1` and `client_activity_daily_fact` projections;
- source freshness, coverage, quality and explicit unknown/reason semantics;
- governed metric registry and effective-dated tenant/CSC/package/lifecycle context;
- private analytics schema, distinct UI/Ask Viv/BI/batch identities, and RBAC-scoped read contracts;
- generic immutable version/run/audit primitives and idempotent rebuild controls. The companion plan owns the health-specific attention/intervention ledger and consultant workflow.

**Sequencing:** companion H0 read-only characterization may run alongside tenant P0. Before RBAC/operating-context gates, only behavior-restricting containment or reliability repairs that preserve or reduce existing exposure may ship—no new analytics permission surface or broader definer RPC. Health/activity implementation otherwise waits for the same RBAC v6 and tenant operating-context gates as P1/P2+. Canonical activity and deterministic health may then be delivered as coordinated vertical slices; Anthropic note processing and predictive weighting remain later gates. Do not delay urgent bounded repairs that stop false health defaults or broken scheduled jobs, but do not present a replacement score until the shared contracts and shadow evidence exist.

---

## 2. Scope and evidence model

### In scope

- `ManageTenants.tsx`, its five tenant data hooks, direct loaders, dialogs, realtime invalidation, filters, sorting, counts, links, and error states.
- `/tenant/:tenantId` and the data contracts needed by tenant detail tabs and drill-downs.
- The tenant operating-model tables and relationships that feed those surfaces.
- Tenant identity, lifecycle/access state, contacts/membership, CSC ownership, packages/services, notes/activity, TGA, Xero, tasks, time, documents, audits, and timeline data.
- Existing views/RPCs that overlap the proposed directory, detail, Ask Viv, or analytics contracts.
- RLS, grants, security-definer helpers, triggers, RPC writers, Edge Function writers, realtime behavior, and audit trails for affected resources.
- Ask Viv staff and client structured-fact paths, corpus retrieval, embedding lifecycle, permissions, freshness, and citations.
- A staged analytical model and a decision gate for private reporting, CDC, read replicas, or an external warehouse.
- KB, current-state schema maps, data dictionaries, operating procedures, and migration/audit documentation.

### Out of scope unless separately approved

- Applying migrations, changing production data, deploying Edge Functions, or changing RLS in this planning session.
- Replacing Xero as the financial system of record or implementing a general ledger.
- Rebuilding all 291 public base tables because they contain `tenant_id`/`client_id`-like columns.
- A wholesale RBAC v6 cutover. This plan consumes the approved decision contract once it exists; it does not silently invent new staff access rules.
- Deleting historical tenant, profile, membership, package, or audit rows merely because an ID does not currently join to `tenants.id`.
- Fixing all current Supabase Advisor findings. Only findings on an in-scope, measured path belong in a phase PR.
- Exposing raw analytics tables, materialized views, or embedding stores through the Data API.
- Table-per-tenant, schema-per-tenant, or tenant-specific columns.
- Partitioning at current scale without measured evidence from a genuinely large fact table and a demonstrated pruning/maintenance benefit.

### Evidence tiers

| Tier | Meaning | Evidence used here |
|---|---|---|
| A | Live, read-only production metadata or statistics | catalog queries, row estimates/counts, constraints, triggers, views, extensions, Advisors, bounded `pg_stat_statements` sample |
| B | Current repository source at the named commit | Manage Tenants hooks, route/detail code, Ask Viv Edge Functions and shared fact builder, migrations/types |
| C | Recorded production history | `docs/audit-log/entries/**` and KB current-state documents |
| D | Current primary guidance | PostgreSQL, Supabase, Microsoft architecture/Power BI, and pgvector documentation |
| E | Proposed target or threshold | explicitly labelled “proposed; confirm in P0” rather than reported as achieved |

Point-in-time table estimates and `pg_stat_statements` accumulations are not transactional truth. Re-run every inventory at the start of the implementation phase and record the statistics reset time where available.

---

## 3. Why Manage Tenants is the operating-model centre

The KB identifies the CSC workflow as Unicorn's first flagship surface. `/manage-tenants` is the portfolio entry point for client identity, lifecycle, access, CSC load, packages, renewal, usage, primary contact, location, latest activity, registration expiry, Xero status, risk, anniversaries, and client drill-downs. It is not merely a CRUD list.

Repository history since May 2026 confirms active iteration rather than a legacy/dead page:

- June and July changes repeatedly adjusted table behavior and layout.
- July fixed status/lifecycle mismatch and overflow/filter behavior.
- August added archived indicators, native tenant links, Xero invoice status/filtering, error recovery for supporting lookups, the live-cohort default, and actionable insights.
- Related audit history records active production fixes for CSC assignment, primary/secondary contacts, lifecycle/churn timestamps, TGA legal names, Xero cache state, client timeline events, tenant mutation hardening, and Ask Viv fact correction.

The April 2026 performance work introduced React Query and pagination after a 13-query sequential implementation caused blank/stuck loads. Subsequent product behavior required whole-book KPI/filter semantics, and the current `useTenantsBasic` intentionally requests all tenants with `.range(0, 9999)`. The browser now parallelizes and caches work better than the pre-April code, but the fundamental read-model fan-out remains.

### Product invariants to preserve

- The default view is the currently defined live cohort, not necessarily every historical tenant.
- Search has deliberately special behavior and may bypass other filters; characterize it exactly before changing it.
- KPI cards and filter counts must remain correct for the intended whole cohort even when rows become paginated.
- `status`, `lifecycle_status`, and `access_status` have different meanings today; UI labels must not silently collapse them.
- A tenant can have at most one primary contact under current indexes/RPC behavior.
- A tenant can have at most one active primary CSC assignment under the current invariant.
- Contact role swaps must remain atomic and preserve timeline/audit events.
- Current Vivacity staff tenant visibility is broad by product decision; portfolio assignment currently ranks/organizes work and is not automatically an access boundary.
- Client users remain scoped to their own authorized tenant through RLS/gated client contracts.
- Xero and TGA fields are cached integration state with freshness and source ownership, not ordinary manually mastered columns.
- Existing historical audit entries are immutable.

---

## 4. Current Manage Tenants read path

### 4.1 Code-derived cold-load request graph

At 415 tenant IDs, the current source can issue approximately 37 PostgREST requests before optional dialog mutations. This is a code-path calculation, not yet a browser HAR measurement; P0 must record the real request timeline and payload.

| Source | Requests at ~415 tenants | Current work |
|---|---:|---|
| `useTenantsBasic` | 1 | `tenants.select('*').order('name').range(0,9999)` |
| `useTenantPackages` | 2 | all active `package_instances`, then package definitions; JS aggregation of renewal/usage |
| `useTenantContacts` | 5 | tenant users/member counts, primary contacts, admin users, primary user profiles, state codes |
| `useCscAssignments` | 2 | tenant assignments, then user profiles |
| `useTenantNotes` | 19 | nine 50-tenant batches × `notes` and `client_notes`, plus global `tga_rto_summary` |
| Direct page loaders | ~8 | three code tables, package catalogue, active users/CSC filtering, current and other `connected_tenants`, other assignee profiles |
| **Total** | **~37** | application-side join and aggregation into one local `Tenant[]` |

The notes path alone scales in request count with the number of tenants. Several hooks perform a second query using IDs returned by the first. Realtime subscriptions invalidate package, CSC, and note queries, potentially replaying broad reads. React Query prevents some redundant fetches, but it cannot make an application-side distributed join atomic or small.

### 4.2 Current data displayed or used by the page

- identity: tenant ID, name, slug, legal/RTO naming and registration context;
- operational state: raw status, lifecycle, access, closed/archive/churn state and risk;
- client relationship: primary contact, user/member count, state/location;
- ownership: primary CSC and connected-user assignment context;
- service: packages, renewal date, included/used minutes, remaining/overrun state;
- recent activity: latest note/client note and TGA registration end;
- integration: Xero recurring-invoice/status cache;
- UX-only source data: code-table labels, filter facets, bulk selection, sort keys, route links and dialog options.

### 4.3 Measured database hot-path evidence

A bounded read of `extensions.pg_stat_statements` at `2026-09-02 07:29 SGT` found repeated PostgREST statements on the exact family:

| Statement shape | Calls | Mean execution time | Total execution time |
|---|---:|---:|---:|
| `tenants.* ORDER BY name` shape | 1,523 | 340.6 ms | 518,770 ms |
| second `tenants.* ORDER BY name` shape | 1,059 | 235.0 ms | 248,826 ms |
| `tenant_users.tenant_id = ANY(...)` | 2,612 | 139.5 ms | 364,385 ms |
| `tenant_users` contact/profile shape | 2,635 | 91.4 ms | 240,741 ms |
| `package_instances` tenant/package/renewal shape | 2,904 | 79.9 ms | 232,129 ms |
| `tenant_csc_assignments.tenant_id = ANY(...)` | 3,322 | 57.9 ms | 192,275 ms |
| per-tenant `v_package_burndown` shape | 5,648 | 98.8 ms | 558,175 ms |

These are accumulated means for normalized statements over an unknown workload/statistics window, not Manage Tenants p95s and not proof of a specific index prescription. They establish that this family is both frequent and costly enough to profile properly.

### 4.4 Desired read shape

```text
browser
  └─ get_tenant_directory_v1(filters, cursor, limit)
       ├─ authorize caller using current policy
       ├─ derive stable page of tenant IDs
       ├─ aggregate only those tenants' contacts/packages/CSC/activity
       └─ return explicit versioned columns + next cursor

optional, only if product requires exact whole-cohort cards:
  └─ get_tenant_directory_facets_v1(filters_without_selected_facet)
```

Dialog option data should load when the dialog opens or come from independently cached small reference queries. It should not block the directory's first meaningful render.

---

## 5. Live data-model findings

### 5.1 Core scale snapshot

Read-only live metadata showed approximately:

| Relation | Current scale/size signal |
|---|---:|
| `tenants` | 415 rows; ~1.12 MB total; 64 columns |
| `tenant_profile` | 758 rows |
| `tenant_users` | 574 rows |
| `tenant_members` | 934 reported by table listing; later planner estimate ~888 |
| `connected_tenants` | 109 rows |
| `tenant_csc_assignments` | 146 rows |
| `package_instances` | 1,050 rows; ~1.1 MB |
| `stage_instances` | 6,307 rows; ~2.1 MB |
| `notes` | 11,487 rows; ~14 MB |
| `client_notes` | 22 rows |
| `time_entries` | 1,362 rows; ~1.3 MB |
| `client_task_instances` | 23,513 rows; ~8.5 MB |
| `staff_task_instances` | 72,218 rows; ~15 MB |
| `document_instances` | 111,282 rows; ~52.3 MB |
| `client_timeline_events` | 14,094 rows; ~37.6 MB, of which indexes ~24.3 MB |
| `audit_events` | 451,734 rows |
| `tenant_rto_scope` | 18,715 rows |

At this scale, the `tenants` heap is not itself large. The directory problem is primarily query composition, payload, RLS/view cost, repeated round trips, and aggregation. Partitioning `tenants` is not justified.

### 5.2 Tenant master concerns

`tenants` currently mixes:

- canonical-looking bigint `id`, UUID `id_uuid`, non-null import sequence `import_id`, and sparse legacy `unicorn1_id`;
- legal/business identity and TGA fields;
- raw status, derived lifecycle, access state, archive/close/churn fields;
- CSC/consultant-related state;
- package and stage legacy references (`package_id`, `package_ids[]`, `stage_ids[]`);
- feature flags/counters;
- Xero URLs/status/sync timestamps;
- other operational/display fields.

All 415 current tenants had `id_uuid`, only two had `unicorn1_id`, and 411 had `id != import_id`. Thirty-one rows still had non-empty `package_ids`, 31 had legacy `package_id`, and six had non-empty `stage_ids`. These facts support a compatibility audit, not immediate column deletion.

**Decision:** treat `tenants.id` as the current application contract until P0 proves otherwise. Do not switch the primary identifier to UUID as a side effect of performance work. New contracts must expose one named canonical ID and, where integration needs it, an explicitly named external UUID—not ambiguous generic `id` variants.

### 5.3 Tenant/client key drift

Across public base tables, the live catalog found:

- 291 base tables with a `tenant_id` or `client_id`-named surface;
- 324 such columns;
- 162 without a foreign key on that column;
- mixed `int4`, `int8`, `uuid`, and `text` types.

This count includes different domains and historical conventions. It does **not** mean 162 constraints can safely be added. For each candidate, first establish whether the value is the current tenant bigint, a legacy import key, a UUID, an external client identifier, or a deliberately unbound snapshot.

### 5.4 Relationship integrity candidates

Current constraints show:

- `tenant_users` has tenant/user foreign keys, unique `(tenant_id,user_id)`, role/access checks, and relationship/position references.
- `tenant_members` has a user foreign key and unique `(tenant_id,user_id)` but no tenant foreign key.
- `tenant_profile` uses `tenant_id` as its primary key but has no FK to `tenants`.
- `package_instances` has parent and membership-state FKs but no tenant or package FK.
- advisor-flagged unindexed FKs include `tenant_csc_assignments.csc_user_id`, `tenant_users.position_type`, `tenant_users.relationship_role`, and `stage_instances.linked_audit_id`.

Join checks against current `tenants.id` found zero unmatched rows in `notes`, `client_notes`, `tenant_users`, and CSC assignments; 349 in `tenant_members`; and 25 in `package_instances`. `tenant_profile` has 758 distinct IDs against 415 current tenants. These rows may encode legacy identity or retained history. They are quarantine/investigation candidates, never deletion candidates without provenance.

### 5.5 Lifecycle vocabulary drift

Live combinations include a dominant inactive/disabled/suspended cohort plus active/enabled/active and several smaller combinations such as cancelled/enabled/closed, on-hold/enabled/suspended, active/disabled/active, completed/enabled/active, and the raw typo `In Arears` in both enabled and disabled forms.

The April status-filter incident already proved that raw `status` and derived `lifecycle_status` are easy to confuse. Target semantics should be:

- **commercial/service status:** preserve the customer-facing/raw business state during migration;
- **lifecycle state:** canonical state machine controlling active/suspended/closed/archived transitions;
- **access state:** independent authentication/application access enablement;
- **reason/effective time/actor:** first-class transition history, not inferred later from a mutable current row.

Do not enforce a new check or remap values until every writer and reporting dependency is inventoried and existing combinations are adjudicated.

### 5.6 Trigger and write-path density

Core tables are not passive storage. Live/source inspection found trigger families for:

- tenant lifecycle synchronization, lifecycle/churn audit and timeline, profile/RTO synchronization, automatic consultant assignment, Xero timeline, and package-added behavior;
- tenant-user audit and primary/secondary relationship synchronization;
- package usage roll-up, membership state, billing/renewal validation, stage seeding, and timeline events;
- time allocation/validation/alerts;
- stage/task timeline and health behavior.

Any table split or constraint change must inventory frontend `.from(...)` writes **and** RPC function bodies, triggers, Edge Functions, cron/queue workers, importers, webhook handlers, and direct integration syncs. A frontend grep alone is insufficient.

### 5.7 Existing read-model overlap

Unicorn already has a large view/RPC surface, including:

- `v_client_home_hero`, `v_client_dashboard_progress`, `v_progress_anchor_inputs`;
- `v_predictive_signal_inputs`, `v_tenant_academy_summary`;
- `v_tenant_last_activity`, `v_client_engagement_summary`;
- `v_dashboard_attention_ranked`, `v_dashboard_tenant_recent_comms`;
- `v_client_tenant_users`, `v_audit_schedule`, `v_stage_health_latest`;
- `v_package_burndown` and materialized `v_package_burn_trends`.

Some use correlated subqueries per tenant. Supabase Advisor currently reports `v_client_package_dashboard` and `v_package_burndown` as security-definer views. Do not create a new overlapping “tenant summary” until P0 records every contract's owner, columns, consumers, security mode, freshness, dependencies, and performance.

---

## 6. Supabase security and performance baseline

### 6.1 Advisor snapshot

The live project reported 515 security and 875 performance findings. Relevant categories include:

- two security-definer views named above;
- 77 warnings for anonymous execution of security-definer functions;
- 426 warnings for authenticated execution of security-definer functions;
- three auth/RLS init-plan findings, including `tenant_users`;
- multiple permissive `tenant_users` SELECT policies;
- 170 unindexed foreign keys;
- 27 duplicate-index findings;
- 658 unused-index findings;
- 11 tables without a primary key;
- one bloat finding.

Relevant duplicate-index candidates include `client_action_items`, `client_timeline_events`, `package_instances.package_id`, and three equivalent `tga_rto_summary` tenant/RTO indexes.

These counts are a baseline and triage queue. An Advisor “unused” result is not sufficient evidence to drop an index: statistics may have reset, rare operational jobs may depend on it, and write/read trade-offs need observation. Every index PR must show the before/after plan, size, usage window, and write-cost estimate.

### 6.2 Available capabilities

The project has `pg_stat_statements`, `vector 0.8.0`, `pg_cron`, `pg_net`, `pgcrypto`, UUID support, and Vault installed. `index_advisor`/HypoPG, pgTAP, and PGAudit are available but not installed. Do not enable extensions in production merely because they are available; prove need and operational impact in a branch first.

### 6.3 Security invariants for all new contracts

- RLS remains the final row boundary for browser-accessible data.
- Browser-facing views should use `security_invoker=true`; browser RPCs should be invoker-context by default.
- A security-definer helper, if unavoidable, lives in a non-exposed schema, has pinned `search_path`, exact grants, no public execution, and direct persona tests.
- Internal all-tenant access is an explicit capability/predicate, not the accidental absence of a tenant filter.
- Client users never supply a trusted tenant ID that bypasses their authenticated tenant scope.
- Service-role use in Ask Viv does not count as RLS proof and must follow a verified caller/target authorization check.
- New tables in exposed schemas receive deliberate grants and RLS; future Data API defaults must not be relied on.
- Realtime authorization, exports, RPCs, Edge Functions, and direct PostgREST calls are tested separately from hidden/visible UI controls.

### 6.4 Consumer/access contract to freeze in P0

Before designing SQL, P0 must complete this matrix with the exact RBAC v6 action/resource vocabulary and current effective behavior:

| Consumer | Principal/database role | Capability | Tenant scope source | Enforcement point | Service role? | Data class |
|---|---|---|---|---|---:|---|
| Manage Tenants | active staff JWT / `authenticated` | approved directory-read action | current staff policy | route UX + RPC/view + base RLS | no | internal portfolio |
| Tenant detail | active staff JWT / `authenticated` | approved tenant-detail action | current staff policy/target | route + data boundary | no | internal operational |
| Staff Ask Viv | verified staff caller + Edge service client | `staff.ai` plus approved tenant-fact scope | explicit decision, not picker/assignment inference | Edge gate + private context/retrieval contract | yes | internal operational/sensitive |
| Client Ask Viv | active client JWT / `authenticated` | approved client assistant action | active membership derived server-side | Edge gate + client contract + RLS | no for tenant facts | client-visible only |
| Operational analytics | dedicated machine identity | named reporting action | approved portfolio/global scope | private reporting interface | never shared with Ask Viv | classified reporting |
| Warehouse/BI | dedicated ingestion/query identities | named export/query actions | classified projection policy | CDC/export + warehouse policy | dedicated only | classified historical |
| Machine jobs | dedicated machine principal | declared job action | fixed workflow scope | job gate + exact DB grants | as approved | minimum required |

For every new view/RPC, the PR must record caller/database role, action, resource, tenant resolution, invoker/definer mode, `search_path`, owner, grants/revocations, exposed/private schema, RLS behavior, and denial behavior. An invoker view called through service role still has service-role authority; `security_invoker` is not a substitute for the staff Ask Viv target-scope decision.

---

## 7. Target operational architecture

### 7.1 Bounded source-of-truth model

The target is not necessarily one physical migration. It is a vocabulary and ownership model that can be reached additively:

| Domain | Authoritative concern | Likely bounded shape after characterization |
|---|---|---|
| Tenant master | immutable tenant identity, legal entity reference, lifecycle pointer | narrow `tenants` compatibility table initially; later identity/master tables only if value is proven |
| External identifiers | UUID/import/Unicorn1/TGA/Xero/SharePoint references | typed provider + external ID records with uniqueness and validity rules |
| Profile and locations | names, addresses, contacts, state, regulatory profile | one-to-one profile plus explicit locations/addresses; avoid repeating into master |
| Membership and contacts | tenant-user membership, relationship role, contact status | one canonical membership boundary with explicit contact role/history |
| Staff ownership | CSC/consultant assignments and workload | effective-dated assignment records; one active primary constraint |
| Services/packages | service subscription/instance, package definition, allowance and renewal | explicit assignment/instance tables; legacy arrays become compatibility-only after parity |
| Lifecycle/access | business state, platform access, reasons and transitions | validated state machine + append-only transition history |
| Activity | notes, communications, tasks, time, documents, audits, timeline | domain-owned facts; unified read projection, not forced into one write table |
| Integrations | Xero/TGA/SharePoint sync and provenance | external system remains source where applicable; store sync state/freshness/errors |

Core many-to-many relationships should use explicit bridges, not JSON or arrays. For tenant-owned child relationships, consider unique `(tenant_id,id)` parent keys and composite tenant-safe foreign keys only after historical data and every writer pass. This can make cross-tenant references structurally impossible in addition to RLS.

### 7.2 Versioned query contracts

Create explicit contracts rather than letting screens couple to private tables:

1. `get_tenant_directory_v1` — list/search/filter/sort/keyset page and visible row data.
2. `get_tenant_directory_facets_v1` — optional exact counts only if one directory call cannot satisfy current cards within budget.
3. `tenant_operating_context_staff_v1` — exact staff facts after an explicit staff capability/scope decision.
4. `tenant_operating_context_client_v1` — a separate client-safe contract that derives tenant scope from the authenticated principal and remains safe without application redaction.
5. Narrow tab/detail contracts for large domains such as documents, audits, tasks, timeline, and package usage.

The staff and client contracts may share private, pure derivation internals, but they must not share a browser-callable service-role endpoint or a caller-controlled `mode = staff|client` switch.

The final SQL object type is a profiling decision:

- choose a normal `security_invoker` view/invoker RPC if indexed current-data queries meet targets;
- choose an RLS-protected snapshot table only for expensive, frequently reused aggregates that can tolerate declared lag;
- keep materialized analytical views in a non-exposed schema and publish a secured interface if required.

### 7.3 Directory contract rules

- Explicit column list; never `select('*')`.
- Cursor/keyset pagination using a unique stable order, initially proposed `(normalized_name, tenant_id)`.
- Page tenant IDs before joining/aggregating child relations.
- No contact × package × assignment row multiplication.
- Search semantics documented for name, legal name, RTO code, contact, and any current special bypass behavior.
- Exact filter/facet semantics for live, active, suspended, closed/archived, Xero status, CSC, package, state, risk, and connected context.
- One declared source for last activity/note, package allowance/usage, primary contact, primary CSC, registration end, and each status label.
- Stable `contract_version`, freshness timestamps for cached integration/projection values, and a deterministic next cursor.
- No large document/note bodies or full audit histories in directory rows.
- Count strategy measured: exact count, cached facet, or “has next page”; do not make every request scan the full book without product need.

### 7.4 Operational projection update strategy

Start with a live invoker query. Add asynchronous projection infrastructure only if the measured query remains outside target after correct indexes and query shape.

If a snapshot is justified:

- update from a transactional outbox committed with the business mutation;
- include event ID, tenant ID, aggregate ID/version, event type/version, actor, correlation ID, occurred time, payload version, and deletion/tombstone state;
- make consumers idempotent and ordering-aware;
- monitor backlog and oldest-event age;
- rebuild/reconcile from authoritative tables;
- never perform remote embedding, BI, email, or HTTP work inside the mutation trigger.

Authorization is always evaluated from current principal/capability/scope state even when facts come from a cached projection. Membership disablement, grant revocation, or tenant-scope reduction must not wait for ordinary projection freshness.

For each mutation, define read-your-writes behavior explicitly: optimistic patch, authoritative reread, or wait-for-projection-version. Broad cache invalidation is not a consistency design. A stale projection exposes `as_of`, source watermark/version, and freshness state; it fails closed when a security-sensitive freshness limit is exceeded.

Business/domain events, application audit history, and database security audit logging remain separate concerns.

---

## 8. ERP-readiness principles

### 8.1 Master-data governance before schema expansion

For every field shown or planned, record:

- business definition and owner;
- authoritative system/table/function;
- allowed values and null meaning;
- tenant/global scope;
- effective time and historical requirement;
- writer list and mutation API;
- audit/provenance requirement;
- freshness SLA for integrations;
- analytics grain and sensitivity classification.

No new “convenience” column belongs on `tenants` without this record.

### 8.2 Historical truth

Use effective-dated history selectively for:

- lifecycle state;
- primary CSC/ownership assignments;
- service/package subscriptions and renewals;
- regulatory classification/scope when reporting requires “as of” truth;
- future commercial/account-manager relationships.

Do not add SCD-style history to every reference field. Operational current tables can remain current-state sources while the analytics model maintains Type 2 dimensions where required.

### 8.3 Integration boundaries

- **Xero:** remain authoritative for invoices/accounting until a separate product decision. Unicorn stores external IDs, summarized status, last successful sync, source timestamp, and error state. Do not build a second ledger accidentally.
- **TGA:** record source timestamp and distinguish regulator-sourced legal/RTO names from user overrides. The August legal-name/SharePoint incident proves this provenance matters.
- **SharePoint:** folder identity and sanitized display names are integration concerns; do not treat a mutable display name as a durable folder key.
- **Microsoft/ClickUp:** use external identifiers and sync state, not loose name joins.

### 8.4 Rejected ERP shortcuts

- widening `tenants` for every new module;
- storing core relationships in JSON/arrays;
- one recursively nested “tenant everything” response;
- inferring historical ownership/status from current mutable rows;
- direct BI joins across mutable many-to-many OLTP tables;
- letting an AI-generated summary become source of truth;
- introducing microservices merely to look like an ERP.

---

## 9. Ask Viv architecture after tenant optimization

### 9.1 Current structured-fact path

The staff `ask-viv-assistant` validates the caller, then uses a service-role client for its agentic tools. `search_clients` queries `tenants` directly; `get_client_context` invokes the shared fact builder. The fact builder performs a long sequence over tenants, package instances/packages, client stage state/stages, tasks, action items, documents, time entries, recent communications, audits/findings/actions, tenant users, and timeline events. A single context can require roughly 15 or more database round trips and can observe different commits between queries.

The builder also retains legacy tenant `package_ids`/`stage_ids` fields alongside newer authoritative relations. Those fields are parity/deprecation candidates, not silent deletion candidates. One documents/evidence source comment also warrants explicit source-of-truth verification.

### 9.2 Structured facts versus retrieval

- Exact current questions—status, CSC, package balance, deadlines, counts, RTO scope, Xero state—come from curated, versioned structured contracts.
- Explanatory/evidence questions—notes, emails, document contents, meeting summaries, standards—use retrieval with citations.
- Embeddings are never authoritative for totals, lifecycle state, access, or financial facts.
- The staff context contract and client context contract may share derivation logic, but not an unsafe common authorization shortcut.

### 9.3 Separate staff and client operating-context contracts

Both `tenant_operating_context_staff_v1` and `tenant_operating_context_client_v1` should:

- produce a coherent version/timestamp and explicit freshness per source;
- return named domains rather than an unbounded object;
- resolve current authoritative package/stage/contact/assignment/status sources;
- carry canonical record links and provenance;
- expose sanitized reason codes for missing/stale data;
- support a shadow comparer against the current fact builder;
- be callable only through a permission path that derives the verified caller and target scope.

For the staff Edge Function, a private service wrapper may be appropriate, but it must have exact grants, pinned search path, and a caller/target decision before invocation. For client Ask Viv, keep the target tenant closed over from the validated client session and use invoker/RLS-scoped reads. The client contract must remain safe if its application redaction layer is removed. Service role is not a shortcut around client RLS, and a body-supplied tenant ID is never trusted.

### 9.4 Retrieval projection v2

The current `ask_viv_corpus` has tenant/source/vector indexes and internal-staff RLS, but its durable contract should explicitly include:

- `tenant_id` plus global/source scope;
- source type, source record ID and source version/content hash;
- ACL/capability scope;
- effective dates and deleted/tombstone state;
- chunk ordinal and canonical citation URI;
- embedding provider/model/dimensions/version;
- ingestion state, retry/error state, embedded/updated timestamps;
- source sensitivity/retention class.

The search RPC must apply authorization in SQL/contract scope. Staff portfolio search currently retrieves a top set and then filters by assigned tenants in application logic; even where broad staff access currently makes this authorized, post-retrieval filtering can reduce recall and will not support future restricted scopes safely.

Use hybrid full-text + vector retrieval for names, codes, and compliance terminology. Measure approximate-search recall under tenant/ACL filters against exact search; pgvector can apply filters after approximate scanning and return too few matches unless HNSW parameters/iterative scanning or another shape is used.

### 9.5 Ask Viv acceptance gates

- Zero unauthorized source/chunk results across staff and client personas.
- Structured result parity for every current fact field across all tenants, with exceptions adjudicated explicitly.
- Exact reconciliation for numeric/status questions against curated SQL.
- Citation source/record/version correctness in a maintained evaluation set.
- Proposed retrieval recall target: ≥95% at selected top-k versus exact search; confirm in the AI phase.
- Proposed source update/deletion propagation: ≤5 minutes if asynchronous; confirm against operational cost and need.
- No stale deleted chunk after tombstone SLA.
- Context latency, token size, tool round trips, and failure reasons observable without logging sensitive content.
- Access telemetry records actor or machine principal, action/capability, tenant scope, contract/source IDs and versions, correlation ID, outcome, and denial reason—never full note/document content or embeddings.

---

## 10. Analytics and business intelligence path

Do not turn the operational `public` schema into a star schema. Progress only as workload requires:

1. optimize and instrument OLTP/read contracts;
2. add bounded operational projections for directory/current-state dashboards;
3. add a private reporting schema or private materialized summaries at modest scale;
4. use CDC/logical replication to a warehouse when analytical scans materially affect the application;
5. define a governed semantic/metric layer.

### Candidate analytical model

| Type | Candidates |
|---|---|
| Dimensions | tenant, date, staff, role, service/package, compliance domain, lifecycle, location |
| Facts | interactions, tasks/actions, document activity, audit findings, compliance snapshots, training/enrolment, service delivery/time, platform usage, future financial summaries |
| Type 2 dimensions | lifecycle, CSC/ownership, service/package subscription, regulatory classification |
| Factless bridges | staff↔tenant, tenant↔service, tenant↔regulatory scope |

Every fact must declare one grain. Every metric must name its source, formula, exclusions, timezone, freshness, and owner. Ask Viv may call governed metrics for structured analytics; it must not construct arbitrary joins over private OLTP tables.

### Analytics security

- reporting tables/materialized views live in a non-exposed schema;
- data extracts enforce tenant/capability scope and sensitivity classification;
- row-level access and aggregation thresholds are tested for exports and BI, not assumed from the app;
- service principals are distinct from human users and least-privileged;
- BI ingestion/query identities are distinct from Ask Viv's service identity and from each other where write/read duties differ;
- CDC slots, lag, WAL retention, failures, and deletions are monitored;
- no read replica or pipeline product is adopted until its current maturity and recovery behavior are accepted.

---

## 11. Implementation sequence — small PR stack

Every PR starts from fresh `origin/main` in its own worktree. Counts and SQL object definitions must be regenerated; this dated plan is not a substitute for live inspection.

The cross-program gate in §1 controls when these phases may run: tenant P0 discovery may proceed after or alongside the final verification of the active route-optimization checkpoint, but P1/P2+ must wait for the RBAC v6 foundation, shadow decision core, AJ/CSC pilot, and explicit staff-scope decision.

### Phase P0 — freeze truth and make risk measurable

#### P0.1 — Tenant operating-model inventory (docs/scripts only)

- Add reproducible read-only inventory queries/scripts for tables, keys, constraints, policies, grants, functions, triggers, views, realtime publications, Edge callers, and relation sizes.
- Produce a source-of-truth matrix for every Manage Tenants field and filter.
- Produce a signed identity ledger for every in-scope `tenant_id`/`client_id`: semantic domain, type, source system, canonical target, current FK, example mappings, unmatched classification, and migration disposition. Column-name similarity is not mapping evidence.
- Produce a view/RPC contract catalogue and write-path dependency graph.
- Complete an effective-security/dependency review of `v_client_package_dashboard` and `v_package_burndown` before either is reused; remediate them only in separately scoped, persona-tested PRs.
- Classify unmatched profile/member/package rows; do not mutate them.
- Record `pg_stat_statements` reset/window caveat and Advisor baseline.

**Exit:** every displayed field, filter, mutation, and Ask Viv fact has a named source, writer, security boundary, and owner or an explicit unresolved flag.

#### P0.2 — Disposable multi-tenant verification environment

- Create an isolated Supabase branch/disposable environment with synthetic small, median, skewed, archived, suspended, disabled, and cross-tenant fixtures.
- Add deterministic SQL/API persona tests for anonymous, client Admin/User in tenants A/B, CSC, Integrator/Team Leader, Super Admin, disabled staff, and service principal.
- Cover list, count, search, detail, export, realtime, RPC, Ask Viv structured context, and corpus retrieval.
- Missing real credentials remain **Inconclusive**, not Pass.

**Exit:** the current behavior is characterized before new objects exist, including expected broad staff access and strict client cross-tenant denial.

#### P0.3 — Browser/network and query baseline

- Capture Playwright network requests, transferred/decoded bytes, time to directory skeleton/first rows/settled UI, and request waterfalls on fresh auth state.
- Record small/median/largest staff scope and tenant-cardinality cases.
- Benchmark list, search, filters, counts, joins, and detail queries with `EXPLAIN (ANALYZE, BUFFERS)` only in the isolated branch using production-like cardinality/skew.
- Capture production read-only `pg_stat_statements`, index usage, bloat, locks, and relation sizes without running production `ANALYZE` workloads.

**Exit:** agreed numeric budgets replace the proposed thresholds in §16.

### Phase P1 — approve data contracts before DDL

#### P1.1 — Tenant identity/lifecycle/ownership ADR and compatibility map

- Decide canonical ID vocabulary without changing the current PK.
- Approve raw status/lifecycle/access definitions and transition authority.
- Decide whether all active internal staff retain all-tenant read access.
- Name canonical membership/contact and package/service relations.
- Define integration source ownership and freshness.
- Mark every legacy array/ID as authoritative, compatibility, historical, or unknown.

**Exit:** Carl/product/data/security sign-off. No code silently makes these policy decisions.

#### P1.2 — Versioned directory contract specification and fixtures

- Freeze `get_tenant_directory_v1` request/response schema, cursor, sorts, filters, facets, null behavior, freshness, and error contract.
- Generate golden results from the old UI assembly for all 415 current tenants using read-only comparison tooling.
- Redact sensitive fixtures and keep production data out of git.

**Exit:** a separately reviewed oracle exists before SQL implementation.

### Phase P2 — deliver the directory read model

#### P2.1 — Measured supporting indexes only

- Add only indexes proven by P0 query plans, including in-scope unindexed FK/policy columns where beneficial.
- Remove no index in the same PR.
- Use production-safe index creation mechanics, explicit lock/statement timeouts, disk/WAL estimates, and invalid-index cleanup instructions.

**Exit:** plan benefit demonstrated; no new duplicate/Advisor finding; write-cost budget met.

If the directory would otherwise depend on either Advisor-flagged security-definer package view, insert a separate P2 security-parity PR before P2.2. Do not hide that change inside directory SQL.

#### P2.2 — `get_tenant_directory_v1` additive server contract

- Implement invoker-context directory query with page-ID-first aggregation.
- Keep old hooks untouched and authoritative.
- Add direct positive/negative persona tests, grants/owner/search-path assertions, deterministic pagination tests, and schema type generation.
- Include an audit entry because a database contract is added.

**Exit:** 100% golden parity or explicitly approved exceptions; zero authorization widening; performance budget met in branch.

#### P2.3 — Frontend shadow read and telemetry

- Call v1 behind a protected feature flag for approved testers while rendering the legacy path.
- Compare sanitized field hashes/counts, cursors/facets, errors, and latency; never combine old/new rows.
- Add correlation IDs and a visible fallback/error path. Shadow errors do not change authorization or UI data.

**Exit:** observation window has zero unexplained field/facet mismatches and no unexpected v1-only rows.

#### P2.4 — Directory canary cutover

- Switch one approved persona/cohort at a time to v1 as the single authority.
- Run live Playwright navigation/filter/search/sort/bulk/link/realtime tests and direct API denial probes.
- Preserve legacy code behind immediate cutback for at least one release/observation window.

**Exit:** one paginated request plus at most one justified facet request; UX and permission gates pass; rollback rehearsed.

#### P2.5 — Legacy directory-fetch retirement

- In a later PR, remove only legacy hook/code paths proven exclusive to Manage Tenants.
- Preserve hooks that still have consumers elsewhere.
- Update architecture metrics, request graph, KB, and audit references.

**Exit:** no duplicate authoritative directory path remains; unrelated callers unaffected.

### Phase P3 — tenant detail and structured operating context

#### P3.1 — Detail-tab inventory and narrow contracts

- Profile `/tenant/:tenantId` tab requests and introduce only the highest-value bounded contracts.
- Lazy-load large tabs; avoid one tenant-everything payload.
- Preserve alias route behavior and route/guard parity.

#### P3.2 — Separate staff/client operating-context contracts

- Implement `tenant_operating_context_staff_v1` and `tenant_operating_context_client_v1` as separate permission surfaces with coherent structured facts and source/freshness/provenance.
- Shadow-compare against the Ask Viv fact builder and any dashboard consumers.
- Do not change corpus retrieval in this PR.

#### P3.3 — Ask Viv structured-fact cutover

- Cut staff and client paths separately after permission and parity proof.
- Keep client tenant derivation closed over the authenticated gate.
- Measure tool-call count, latency, context size, exactness, and failure behavior.

### Phase P4 — bounded integrity improvements

Each item is a separate expand–migrate–contract stream, not one migration:

#### P4.1 — `tenant_profile` identity reconciliation

- Classify all 758 IDs and establish whether rows are current, legacy namespace, archived, or invalid.
- Add mapping/quarantine records if needed; do not coerce IDs.
- Add an FK only after all writers and history are compatible, initially `NOT VALID`, then validate separately.

#### P4.2 — membership/contact canonicalization

- Decide `tenant_members` versus `tenant_users` responsibilities.
- Characterize invite, accept, delete, swap, bulk action, and client portal flows.
- Add compatibility adapters and shadow comparisons before retiring duplication.

#### P4.3 — package/service relationship integrity

- Resolve the 25 unmatched package-instance tenant keys and package FK gaps.
- Reconcile legacy `package_id/package_ids` against `package_instances`.
- Preserve parent/child usage, renewal, timeline, billing, stage seeding, and Ask Viv semantics.

#### P4.4 — lifecycle state machine

- Add canonical transition API/history additively.
- Dual-record and compare legacy trigger output.
- Backfill historical state only from defensible audit/timeline evidence.
- Retain raw legacy value until all consumers migrate; never rewrite `In Arears` silently.

### Phase P5 — event/projection infrastructure, only if justified

#### P5.1 — Transactional outbox foundation

- Add event schema, idempotency, ordering, tombstones, retention, replay, backlog monitoring, and exact grants.
- Start with one domain event family, not every table.

#### P5.2 — Operational snapshot, only if live query misses budget

- Build an RLS-protected directory/context snapshot from outbox events.
- Reconcile full rebuild versus incremental state.
- Publish freshness and stale/error behavior.

If P2 live queries meet latency and load budgets, defer P5 rather than adding complexity.

### Phase P6 — Ask Viv retrieval v2

#### P6.1 — Corpus provenance/tombstone expansion

- Add nullable v2 metadata, backfill idempotently, and keep v1 retrieval authoritative.
- Define retention/deletion and re-embedding rules.

#### P6.2 — Permission-safe hybrid retrieval shadow

- Apply caller/tenant/capability scope in the retrieval contract before ranking.
- Compare exact and ANN results under filters; tune HNSW/iterative search from evidence.
- Shadow retrieval and run cross-role evaluation sets.

#### P6.3 — Retrieval cutover and old-index cleanup

- Cut over only after recall, citation, deletion, latency, and zero-leak gates.
- Remove old callers and execute grants in a later verified cleanup, then drop old indexes/columns only after an observation window. A UI rollback must not leave a broadly executable alternate RPC unnoticed.

### Phase P7 — analytics foundation

#### P7.1 — Metric catalogue and private reporting schema

- Approve grains, dimensions, facts, SCD rules, formulas, sensitivity, and owners.
- Add only private, non-Data-API objects.

#### P7.2 — One analytical vertical slice

- Recommended pilot: tenant lifecycle + CSC ownership + service/package delivery, because it tests effective dating and supports operating decisions without copying the entire ERP.
- Reconcile 100% against operational sources and enforce reporting permissions.

#### P7.3 — CDC/warehouse/read-replica decision gate

- Measure primary impact, refresh windows, data volume/growth, BI concurrency, WAL/slot cost, RPO/RTO, and product maturity.
- Adopt external CDC/warehouse or read replica only when operational isolation is demonstrably needed.

#### P7.4 — Client-health/activity companion integration gate

- Confirm that the companion plan consumes the governed tenant, ownership, package, lifecycle, generic event/provenance/freshness/quality vocabulary and authorization contracts rather than rebuilding them. Companion H2—not this parent phase—owns `client_activity_event_v1` and `client_activity_daily_fact`.
- Publish approved client activity, health-signal, attention and intervention facts into the private semantic layer at one declared grain each.
- Keep client activity, client health, consultant attention and intervention effectiveness as separate metrics/products.
- Do not permit Claude-derived note themes into health scoring until the companion plan's security, retention, structured-output, citation, human-review and evaluation gates pass.
- Require explicit unknown/coverage behavior; absent or failed sources never mean healthy/stable.
- Apply this gate at companion H2, H3, H5 and H6 rather than treating it as one late release checkpoint.
- Current authorization always overrides historical CSC/tenant context. Derived facts inherit source sensitivity/retention, revalidate current access at read time, and tombstone/suppress after source deletion, scope/ACL change or retention expiry.

**Exit:** shared facts reconcile to operational sources, RBAC/BI/Ask Viv scopes pass direct and revocation-race negative tests, derived-data deletion/suppression is proven, and the companion program can evolve metric/model versions without changing the tenant write model.

### Phase P8 — contract cleanup

- Remove legacy columns/views/RPCs/indexes only after all consumers, deployed functions, cron jobs, integrations, and production shadow telemetry prove zero use.
- One object family per PR; no same-release read stop and source drop.
- Update generated types, KB, route/data maps, audits, runbooks, and disaster recovery references.

---

## 12. Acceptance criteria for every implementation PR

### Before editing

- fresh `origin/main`, isolated worktree, clean status, current `AGENTS.md`;
- exact in-scope object/caller/consumer inventory regenerated;
- read-only live definitions for tables, views, policies, functions, triggers, grants, publications, and indexes captured;
- current allowed/denied persona behavior characterized;
- frontend, RPC body, trigger, Edge, cron, queue, webhook, import, export, realtime, Ask Viv, and BI paths checked;
- baseline plan/requests/payload/latency and rollback owner recorded;
- phase decision questions approved or explicitly blocking.

### Database and security

- additive/compatible migration unless this is a separately approved cleanup;
- exact owner, grants, `security_invoker`/`security_definer`, volatility, `search_path`, and exposed-schema status asserted;
- caller/database role, capability, target-tenant derivation, RLS behavior, denial behavior, and transitive definer dependencies documented;
- RLS enabled where exposed and direct cross-tenant negative tests pass;
- service-role probes are never presented as RLS proof;
- constraints tested against every RPC/trigger writer; `NOT VALID`/validation separated when appropriate;
- no new Supabase Advisor findings; any intentionally accepted finding documented;
- migration and rollback/forward-fix rehearsed in isolated environment;
- dated audit entry included.

### Performance

- before/after `EXPLAIN (ANALYZE, BUFFERS, WAL)` on production-like branch data for representative and skewed cases;
- request count, payload, p50/p95, CPU/buffer/row estimates, index size, write cost, and RLS-on result recorded;
- stable deterministic keyset pagination under concurrent inserts/updates;
- no unexplained sequential scan on a large in-scope relation;
- no request-constant RLS helper evaluated per scanned row;
- no speculative `INCLUDE`, partial, vector, or duplicate index.

### Frontend and UX

- loading, partial error, full error, empty, stale, retry, realtime invalidation, and offline/timeout states tested;
- live cohort, counts, search bypass behavior, every filter/sort, bulk selection, tenant links, dialogs, and responsive table behavior preserved;
- navigation persistence and route guard parity verified where route/layout code changes;
- Playwright evidence includes actual request waterfall/persistence behavior, not only assertions;
- build, typecheck baseline, frontend/Edge tests, lint ratchet, route manifest, unauth/auth persona tests run as applicable.

### Ask Viv and analytics

- structured exactness and retrieval relevance evaluated separately;
- target tenant/capability enforced before context/retrieval results are returned;
- source, version, freshness, citation, deletion, and sensitivity metadata preserved;
- old/new shadow mismatch report attached;
- AI content is not used as a policy or source-of-truth oracle;
- reporting grain and metric formula independently approved.
- Ask Viv and BI access telemetry contains IDs/versions/outcomes rather than copied sensitive content.

### Done means

- the new slice has one authoritative path, not `old OR new` or merged partial results;
- all mismatches are zero or explicitly approved and documented;
- rollback/cutback was tested;
- required unavailable evidence is marked Inconclusive;
- KB/current-state/audit documentation agrees with code and live objects;
- the PR remains bounded to its phase.
- any retired contract has its remaining callers and execute grants verified separately.

---

## 13. Verification program

### 13.1 Directory golden oracle

For every current tenant, compare old assembly versus v1:

- identity and display names;
- raw/lifecycle/access state and cohort inclusion;
- primary contact/member count/state;
- primary CSC/connected assignment context;
- active packages, renewal, included/used/remaining values;
- latest activity/note and registration expiry;
- Xero status/freshness;
- risk/anniversary/filterable values;
- null/fallback labels and links.

Golden expected outcomes are reviewed business facts, not output generated by the new query itself.

### 13.2 Persona matrix

| Persona | Directory | Detail | Structured context | RAG | Negative requirement |
|---|---|---|---|---|---|
| Anonymous | deny | deny | deny | deny | no row/content flash |
| Active Super Admin | approved full scope | approved | approved | approved | disabled state denies |
| Active CSC | current approved staff scope | approved | approved | approved | future scope changes do not happen silently |
| Integrator/Team Leader | current approved staff scope | approved | approved as policy says | approved as policy says | capability/disabled cases deny |
| Client Admin A | no staff directory | own tenant surfaces | own tenant only | own permitted corpus | tenant B always denies |
| Client User A | no staff directory | own allowed surfaces | own tenant/role only | own permitted corpus | admin-only and tenant B deny |
| Service principal | no human route assumption | declared job scope | declared function only | declared ingestion/search scope | arbitrary human impersonation denied |

RBAC v6 may later narrow staff scope. Until approved, optimization must reproduce current behavior exactly and make the broad capability explicit.

### 13.3 Proposed numeric targets — confirm in P0

| Measure | Proposed gate |
|---|---|
| Initial directory requests | 1 list + at most 1 justified facets/count request; no per-row follow-ups |
| Initial response payload | ≤100 KB compressed/decoded budget to be separately recorded |
| Directory DB p95 | ≤300 ms and ≤60% of measured baseline, subject to P0 adjustment |
| Frontend first useful rows | materially faster than baseline; absolute target set from P0 hardware/network |
| Projection parity | 100% of tenants/fields; zero unexplained exceptions |
| Pagination | zero duplicate/gap in concurrency suite; deterministic order |
| Write regression from indexes/triggers | <10% p95/throughput regression on benchmark |
| Operational projection lag | ≤60 seconds if a snapshot is introduced |
| Analytics freshness | ≤15 minutes for initial operational BI unless business requires otherwise |
| Ask Viv update/delete lag | ≤5 minutes if asynchronous |
| ANN recall | ≥95% at selected top-k versus exact filtered search |
| Cross-tenant negative retrieval | at least 1,000 automated attempts; zero leaks |
| Release latency/error | within 10% of baseline during backfill/index/validation |

Thresholds are planning candidates, not promises. P0 replaces them with measured, approved SLOs and documents exceptions.

---

## 14. Online migration and rollback runbook

Every schema stream follows **expand → migrate → compare → canary → contract**:

1. Inventory and freeze the object/caller contract.
2. Add nullable columns/new tables/new view or RPC without changing existing reads.
3. Add measured indexes using safe production mechanics.
4. Begin dual-recording or outbox emission only with one declared source of truth.
5. Backfill in resumable primary-key/keyset batches with checkpoints, throttling, idempotency, error quarantine, and progress metrics.
6. Add FKs/checks as `NOT VALID` where appropriate so new writes are protected before historical validation.
7. Correct adjudicated exceptions; validate constraints in a separate monitored step.
8. Shadow-read and compare old/new results.
9. Canary behind a protected flag with one authoritative read path per request.
10. Observe through an agreed window; retain immediate cutback.
11. Remove compatibility objects only in a later approved PR.

Keep mutation transactions short, make no remote/integration call while database locks are held, and acquire multi-row locks in one deterministic key order. Golden concurrency tests must cover primary/secondary contact swaps, CSC reassignment, package parent/child updates, and lifecycle transitions.

### Required deployment packet

- exact SQL and object diff;
- affected row/cardinality estimate;
- expected locks and lock duration;
- `lock_timeout`/`statement_timeout` and abort criteria;
- transaction/non-transaction requirements (`CREATE INDEX CONCURRENTLY` cannot be treated like ordinary transactional DDL);
- disk, index, WAL, replication/slot, and bloat estimates;
- backfill command/checkpoint/retry/reconciliation procedure;
- monitoring queries and named owner;
- feature cutback and forward-fix SQL;
- PITR/backup readiness and realistic RPO/RTO;
- audit entry and post-deploy verification;
- cleanup criteria and earliest allowed date.

Never drop a source in the same release that stops reading it. Production rollback normally means feature cutback plus a forward compatibility migration, not rewriting deployed migration history.

---

## 15. Known risks and blast-radius traps

| Risk | Why it is specific here | Required safeguard |
|---|---|---|
| Whole-book UX depends on all rows | pagination previously conflicted with KPI/filter behavior | server-side facets and golden UX parity before cutover |
| Status vocabulary overlap | raw, lifecycle and access states have already caused bugs | approved state definitions and field-by-field parity |
| Trigger/RPC density | writes have lifecycle, audit, timeline, package, and integration side effects | database body/trigger sweep and golden transaction tests |
| Legacy ID namespaces | profile/member/package “orphans” may not be bad data | classify/mapping/quarantine; never auto-delete/coerce |
| RLS changes through views | owner-context views can bypass caller policies | invoker contracts, grant assertions, direct persona probes |
| Broad staff access is intentional today | treating CSC assignment as access could lock out staff | preserve current policy until RBAC decision; shadow future scope |
| Service-role Ask Viv | a correct UI gate does not make arbitrary service queries safe | verified caller/target authorization and private exact grants |
| Cross-product view reuse | `v_package_burndown` has several consumers and a definer warning | secure/replace as its own vertical slice; do not edit casually |
| Application-side shadow merge | combining old/new can hide missing or unauthorized rows | one rendered authority; sanitized comparison only |
| Realtime invalidation storms | broad invalidation may replay expensive directory queries | targeted event keys, coalescing, and live update tests |
| Projection staleness/deletion | faster summaries/RAG can return obsolete facts | freshness metadata, tombstones, backlog monitor, rebuild |
| Materialized view exposure | stale/private data may be reachable through Data API | private schema and secured interface |
| Advisor-driven index deletion | “unused” may mean stats reset or rare jobs | long observation and plan/caller evidence; separate cleanup |
| Vector filtering recall | ANN may rank globally then discard unauthorized/other-tenant rows | filter in contract and benchmark exact-vs-ANN recall |
| BI workload on primary | analytical scans can degrade transactional UX | private summaries first, CDC/replica decision from metrics |
| Accidental second ledger | Xero cache can be mistaken for accounting truth | explicit source ownership and reconciliation/freshness |
| Concurrent tools/worktrees | branch switches can overwrite edits | fresh isolated worktree per PR; never switch shared checkout |

### Stop conditions

Stop the phase and do not improvise if:

- live definitions differ from the plan's inventory;
- a writer or deployed Edge Function cannot be classified;
- current expected permission behavior is disputed;
- a new contract returns any unexpected v1-only tenant/row;
- old/new structured facts disagree without an adjudicated source;
- a migration requires a long blocking lock or unbounded rewrite not rehearsed;
- backfill is not resumable/idempotent;
- RLS persona evidence is missing for a changed boundary;
- Advisor/security findings increase unexpectedly;
- error/latency/replication/WAL/outbox thresholds cross abort limits;
- production-like test data or required credentials are unavailable.

No destructive normalization may start until the identity ledger, authorization matrix, trigger/RPC writer census, performance baseline, lifecycle state-machine definition, and unmatched-row classification are signed off.

---

## 16. Explicit non-goals during implementation

If Claude finds an unrelated defect, dead view, duplicate index, bad historical row, stale comment, role mismatch, or insecure function while implementing a phase:

- record it in the PR description with evidence and severity;
- decide explicitly whether it blocks the phase;
- create a separate issue/plan/PR if it does not;
- do not silently bundle the fix;
- do not “clean up” KB/audit history beyond current-state corrections required by the phase;
- do not infer a production deploy or merge authorization from approval to implement code.

Especially do not silently:

- change which internal roles can see all tenants;
- change client tenant membership semantics;
- rewrite existing lifecycle/status values;
- remove legacy identifiers/arrays;
- delete unmatched rows;
- replace Xero/TGA source fields;
- expose private analytics or corpus data;
- enable broad PGAudit logging;
- install new extensions;
- retire deployed Edge Functions from repository-call absence alone.

---

## 17. KB and documentation updates by phase

Update documentation with the implementation that changes truth, not in one cleanup at the end:

- add a current tenant operating-model map with authoritative entities, keys, relationships, writers, and history;
- document the directory/context contract, filters, cursor, freshness, and error behavior;
- update architecture and codebase map when frontend hooks/contracts change;
- add a data dictionary for status/lifecycle/access and legacy compatibility fields;
- document membership/contact/CSC/package invariants and mutation APIs;
- add the view/RPC/security-mode catalogue and keep it current;
- document Ask Viv structured versus retrieval sources, provenance, deletion, and evaluation;
- add metric catalogue and analytical grains when BI work begins;
- add runbooks for projection rebuild, backfill resume, constraint validation, index failure, outbox backlog, corpus re-embedding, and cutback;
- add one immutable dated audit entry for every schema/RLS/trigger/RPC/grant/backfill/data correction;
- update this plan's execution-progress section after each merged PR.

The April performance audit's 13-query architecture is historical and should remain unchanged; current-state KB should separately document the present ~37-request code-derived graph and later v1 contract.

---

## 18. Decisions Carl/Vivacity must approve

1. Does every active internal Vivacity staff role retain all-tenant read access, or will RBAC v6 introduce portfolio/capability scope? Optimization preserves current behavior until answered.
2. What are the authoritative meanings and allowed transitions for raw commercial status, lifecycle status, and access status?
3. Is `tenants.id` the long-term canonical internal key, with `id_uuid` an integration-safe identifier, or is a future key migration required for a specific reason?
4. What do the 758 `tenant_profile` IDs, 349 unmatched `tenant_members`, and 25 unmatched `package_instances` represent?
5. Which of `tenant_users` and `tenant_members` is authoritative for membership, contacts, invitations, and client administration?
6. Are `package_instances` authoritative for all service assignments, and what remaining callers legitimately use `package_id/package_ids/stage_ids` on `tenants`?
7. Must KPI cards be exact and real-time for the whole book, or is bounded freshness/approximation acceptable?
8. What operational directory and context freshness SLOs are acceptable?
9. Which Ask Viv sources may be indexed, for how long, under what deletion SLA, and with what staff/client capability scopes?
10. What is the first governed BI decision the analytical pilot must support?
11. Will Xero remain the financial source of truth, and which entity/account is connected?
12. What Supabase branch/disposable environment and synthetic persona process is approved for mutation and cross-tenant testing?
13. What observation window, canary cohort, performance budget, and rollback owner apply to each risk class?

No implementation phase should answer these through incidental code.

---

## 19. Council review and amendment ledger

The plan was reviewed from six seats: product/operating model and KB history; React/query-path correctness; PostgreSQL/data integrity and performance; RLS/RBAC/security; Ask Viv/retrieval; and analytics/online migration safety.

| Council finding | Severity | Plan adjustment |
|---|---|---|
| The page is an application-side read model, not a simple tenant query | Critical | Directory v1 and request/payload baseline precede normalization |
| A wide joined query can multiply contacts × packages × assignments | Critical | page IDs first, aggregate children only for the page, separate detail contracts |
| Whole-book counts/search semantics caused pagination reversals before | Critical | golden UX oracle and facet contract are explicit P1/P2 gates |
| Schema cleanup can weaken permissions through owner-context views/service role | Critical | invoker default, exact grants/search paths, direct persona/RLS probes, no service-role-as-proof |
| Current staff all-tenant access is a product policy, not an implementation accident | Critical | preserve it until RBAC v6 decision; assignment is not silently converted into authorization |
| Key “orphans” may be legacy namespaces or historical records | Critical | classification/mapping/quarantine before any FK/backfill/delete |
| Core triggers and RPC writers make table splits high-risk | High | complete writer/trigger/function census and golden transactions in P0 |
| Existing view zoo may overlap or contain definer risks | High | contract catalogue before adding a new summary; definer fixes are separate slices |
| Advisor unused/duplicate findings are not automatic deletion authority | High | usage-window, plan, size and writer-cost evidence; no add/drop in same PR |
| Ask Viv fact builder is sequential and may observe mixed commits | High | coherent `get_tenant_operating_context_v1` with parity shadowing |
| App-layer post-filtered vector results can lose recall and resist future scoping | High | authorization inside retrieval contract; exact-vs-ANN filtered evaluation |
| A snapshot/event platform may be unnecessary at 415 tenants | High | live invoker query first; outbox/snapshot only if measured budget is missed |
| BI star schemas in operational public tables would couple workloads and leak detail | High | private reporting layer, declared grain, CDC/warehouse decision gate |
| Lifecycle normalization can erase meaningful commercial history | High | separate raw/service, lifecycle, access and transition history; retain compatibility |
| Xero summaries can be mistaken for ERP financial truth | Medium-high | explicit integration ownership/freshness and no accidental ledger |
| Proposed SLOs were arbitrary without a baseline | Medium | all numeric targets labelled proposed and replaced in P0 |
| Missing personas can produce false confidence | Medium | deterministic disposable tests plus real-JWT gated tests; missing evidence is Inconclusive |

Council approval means the safeguards are present in the plan. It does not authorize production DDL, data mutation, deployment, PR merge, or a phase whose decision gates remain open.

---

## 20. Claude Code execution contract

For each PR, Claude Code must paste this packet into the PR body:

```markdown
## Tenant data phase execution packet

- Plan phase / exact objective:
- Fresh base SHA / worktree path:
- Objects and consumers regenerated:
- Current source-of-truth and expected permission behavior:
- Live read-only definitions captured:
- Old/new contract and authority mode:
- Migration/backfill/index lock and timeout plan:
- Golden parity result and exceptions:
- Persona/direct API/RLS result:
- Playwright request/payload/UX result:
- EXPLAIN/latency/index/write-cost result:
- Advisor before/after:
- Ask Viv/analytics result if applicable:
- Audit + KB files updated:
- Rollback/cutback command and owner:
- Observation window / stop thresholds:
- Inconclusive evidence and residual risks:
```

Implementation discipline:

1. Re-read `AGENTS.md`, this plan, the optimization plan's current execution section, RBAC v6, and relevant audit entries.
2. Re-run inventories; never trust dated counts blindly.
3. One bounded vertical slice per PR.
4. No production MCP mutation/deploy without fresh explicit authorization.
5. No merge without fresh explicit authorization.
6. Do not run `EXPLAIN ANALYZE` for risky/heavy statements on production; use an isolated branch with production-like scale.
7. Preserve a single authority per request; shadow data is observational only.
8. Treat a missing security/persona boundary as Inconclusive.
9. Attach reproducible evidence, not screenshots/assertions alone.
10. Stop on the conditions in §15.

---

## 21. Continuity snapshot for a later usage window

This section exists so a later session can resume without repeating risky discovery.

### Planning state

- Isolated worktree: `C:\Users\carls\repository\unicorn-workspace\unicorn-db-plan-20260902`
- Branch: `chore/tenant-data-model-optimization-plan`
- Base after refresh: `origin/main@31083c49`
- Shared checkout's unrelated untracked file was deliberately left untouched.
- Live Supabase project was queried read-only; no `apply_migration`, DDL, DML, deploy, extension enablement, or production `EXPLAIN ANALYZE` occurred.

### Highest-confidence findings

- Manage Tenants can issue ~37 PostgREST requests at 415 tenants by current code path.
- `tenants` is small (~1.12 MB) but wide (64 columns); request composition dominates the directory problem.
- current schema has identity, status, membership, package, view-security, index, and trigger complexity that makes normalization unsafe as a first step;
- `pg_stat_statements` confirms tenant/package/contact/CSC query shapes are frequent and materially expensive;
- Ask Viv structured context is another sequential distributed read model and should converge on a versioned exact-fact contract after directory semantics are settled;
- partitioning, broad index deletion, table splitting, and CDC are not first actions.

### First implementation action after approval

Start **P0.1** only: reproducible inventory, source-of-truth matrix, view/RPC catalogue, and write-path graph. Do not create the directory function in the same PR.

---

## 22. Definition of program completion

This program is complete when:

- Manage Tenants renders from one versioned paginated read authority with no per-row fan-out and approved whole-book facet behavior;
- p95, payload, request count, and UX targets are met on representative and skewed data;
- current staff/client permission behavior is preserved or changed only through a separately approved RBAC cutover;
- every tenant operating-model field has an authoritative source, owner, writer, freshness, history, and sensitivity definition;
- tenant/profile/membership/package/lifecycle integrity improvements are validated without unexplained data loss;
- Ask Viv exact facts come from a coherent permission-safe contract and retrieval rows carry tenant/ACL/provenance/version/deletion metadata;
- structured answers reconcile exactly and filtered retrieval meets recall/citation/leakage gates;
- analytical facts have declared grain and live outside exposed OLTP tables;
- migrations/backfills are resumable, observable, rehearsed, and reversible by cutback/forward fix;
- stale compatibility objects are removed only after a proven observation window;
- the KB, current architecture, generated types, audit trail, and live database agree.

---

## 23. Evidence and primary guidance index

### Repository and KB

- `src/pages/ManageTenants.tsx`
- `src/hooks/useTenantsBasic.ts`
- `src/hooks/useTenantPackages.ts`
- `src/hooks/useTenantContacts.ts`
- `src/hooks/useCscAssignments.ts`
- `src/hooks/useTenantNotes.ts`
- `src/pages/ClientDetail.tsx`
- `supabase/functions/ask-viv-assistant/index.ts`
- `supabase/functions/ask-viv-assistant-client/index.ts`
- `supabase/functions/_shared/ask-viv-fact-builder/**`
- `docs/kb/codebase-state/architecture.md`
- `docs/kb/pinned/decisions.md`
- `docs/audit-log/entries/2026-04-28-manage-tenants-perf-optimisation.md`
- `docs/audit-log/entries/2026-04-29-manage-tenants-status-filter-fix.md`
- relevant May–August tenant, CSC, contact, lifecycle, TGA, Xero, timeline, RLS, and Ask Viv entries.

### Primary external guidance

- [Microsoft CQRS pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/cqrs)
- [Microsoft multitenant storage approaches and antipatterns](https://learn.microsoft.com/en-gb/azure/architecture/guide/multitenant/approaches/storage-data)
- [Power BI star-schema guidance](https://learn.microsoft.com/en-ie/power-bi/guidance/star-schema)
- [PostgreSQL LIMIT/OFFSET and deterministic pagination](https://www.postgresql.org/docs/current/queries-limit.html)
- [PostgreSQL materialized views](https://www.postgresql.org/docs/current/rules-materializedviews.html)
- [PostgreSQL `REFRESH MATERIALIZED VIEW`](https://www.postgresql.org/docs/current/sql-refreshmaterializedview.html)
- [PostgreSQL `CREATE VIEW` security behavior](https://www.postgresql.org/docs/current/sql-createview.html)
- [PostgreSQL `CREATE INDEX`](https://www.postgresql.org/docs/current/sql-createindex.html)
- [PostgreSQL `ALTER TABLE` and `NOT VALID`](https://www.postgresql.org/docs/current/sql-altertable.html)
- [Supabase database inspection](https://supabase.com/docs/guides/database/inspect)
- [Supabase database advisors](https://supabase.com/docs/guides/database/database-advisors)
- [Supabase query optimization](https://supabase.com/docs/guides/database/query-optimization)
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase RLS performance guidance](https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv)
- [Supabase hybrid search](https://supabase.com/docs/guides/ai/hybrid-search)
- [Supabase automatic embeddings](https://supabase.com/docs/guides/ai/automatic-embeddings)
- [Supabase RAG with permissions](https://supabase.com/docs/guides/ai/rag-with-permissions)
- [pgvector filtering behavior](https://github.com/pgvector/pgvector/blob/master/README.md#filtering)
- [Supabase replication/CDC](https://supabase.com/docs/guides/database/replication)
- [Supabase read replicas](https://supabase.com/docs/guides/platform/read-replicas/getting-started)
- [Supabase backups/PITR](https://supabase.com/docs/guides/platform/backups)
- [Supabase deployed migration rollback guidance](https://supabase.com/docs/guides/local-development/declarative-database-schemas)
- [Microsoft transactional outbox pattern](https://learn.microsoft.com/en-us/azure/architecture/databases/guide/transactional-out-box-cosmos)

---

## 24. Execution progress

| Phase | Status | PR | Evidence/result |
|---|---|---|---|
| Planning and live read-only investigation | Complete 2026-09-02 | — | this council-reviewed plan; no production changes |
| P0.1 operating-model inventory | Not started | — | — |
| P0.2 disposable verification environment | Not started | — | — |
| P0.3 browser/query baseline | Not started | — | — |
| P1+ implementation | Not started | — | requires phase approval |
