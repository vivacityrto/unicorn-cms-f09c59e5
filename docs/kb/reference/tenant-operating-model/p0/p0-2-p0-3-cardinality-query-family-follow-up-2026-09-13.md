# TOM P0.2/P0.3 — cardinality and query-family follow-up

> **Last updated:** 2026-09-13
> **Status:** read-only production/QA cardinality comparison and query-family gap register complete; representative fixture expansion and cross-initiative owner review remain open
> **Owner:** Tenant Operating Model, with RBAC and Client Health review
> **Parent packet:** [P0.2/P0.3 disposable baseline characterization](p0-2-p0-3-disposable-baseline-characterization.md)
> **Production rule:** this document records aggregate reads and source inspection only; it authorizes no schema, RLS, grant, Realtime, Edge, cron, data, or credential change

## Scope and method

This follow-up closes the unattended portion of the remaining P0.2/P0.3
evidence work: compare aggregate cardinalities in the allowlisted `unicorn-qa`
project with production, inspect the current Realtime publication membership,
and reconcile the browser/query-family register against the current source.
The live reads were performed on 2026-09-13 against QA project
`qfpxvumcrnzrjyvqkicq` and production project `yxkgdalkbrriasiyyrwk`, with
repository context `origin/main@2de9e154`. Only counts, percentiles, and
publication table names are retained here; no row values, tenant names,
identifiers, payloads, credentials, or application data are recorded.

## Point-in-time aggregate cardinalities

The following counts came from read-only aggregate SQL over the named public
relations:

| Relation | `unicorn-qa` | Production | QA coverage implication |
| --- | ---: | ---: | --- |
| `tenants` | 6 | 416 | QA is a small fixture, not a portfolio-scale stratum |
| `tenant_members` | 19 | 936 | relationship cardinality exists but is not production-shaped |
| `tenant_users` | 19 | 576 | same QA members/users count is intentional fixture simplification |
| `tenant_contacts` | 10 | 114 | contacts are present, but not at production breadth |
| `tenant_addresses` | 0 | 722 | address read/write surface cannot be exercised from current QA data |
| `tenant_relationships` | 0 | 2 | relationship edge cases cannot be exercised from current QA data |
| `tenant_csc_assignments` | 0 | 149 | assignment/read-model path cannot be exercised from current QA data |
| `connected_tenants` | 0 | 109 | connected-tenant path is absent from current QA fixture |
| `packages` | 3 | 45 | package variety is narrower than production |
| `package_instances` | 9 | 1,052 | package-instance query is present but under-sized |
| `tenant_messages` | 18 | 701 | message reads are present but conversation breadth is smaller |
| `tenant_conversations` | 9 | 506 | conversation reads are present but under-sized |
| `conversation_participants` | 0 | 2,216 | participant authorization paths cannot be exercised from current QA data |
| `ask_viv_conversations` | 0 | 77 | assistant history has no QA rows |
| `ask_viv_turns` | 0 | 294 | assistant turn/history query family has no QA rows |

The QA fixture therefore supports safe empty/populated checks for several core
directory and package paths, but it does not satisfy the plan's
representative full-cardinality requirement. In particular, zero-row QA
relations must not be interpreted as proof that the corresponding production
surface is empty or cheap.

## Tenant-associated distribution comparison

For relations with a `tenant_id`, a second aggregate query calculated the
number of populated tenants, minimum, median, 90th percentile, maximum, and
total rows. These figures are intentionally anonymous and are not performance
budgets:

| Relation | QA populated / min / p50 / p90 / max / total | Production populated / min / p50 / p90 / max / total |
| --- | --- | --- |
| `tenant_members` | 5 / 1 / 4 / 7 / 9 / 19 | 754 / 1 / 1 / 2 / 29 / 936 |
| `tenant_users` | 5 / 1 / 4 / 7 / 9 / 19 | 411 / 1 / 1 / 2 / 29 / 576 |
| `tenant_contacts` | 4 / 1 / 2 / 4.1 / 5 / 10 | 28 / 1 / 2.5 / 9.2 / 15 / 114 |
| `tenant_addresses` | 0 / — / — / — / — / 0 | 373 / 1 / 2 / 3 / 22 / 722 |
| `package_instances` | 4 / 1 / 2 / 3.4 / 4 / 9 | 354 / 1 / 2 / 6 / 19 / 1,052 |
| `tenant_messages` | 4 / 4 / 4 / 5.4 / 6 / 18 | 58 / 1 / 10 / 16 / 88 / 701 |
| `tenant_conversations` | 4 / 2 / 2 / 2.7 / 3 / 9 | 59 / 1 / 10 / 12 / 18 / 506 |

The largest gap is not merely row count: production's message and conversation
families have materially wider per-tenant distributions, while QA has no
participants, addresses, assignments, relationships, or Ask Viv history at
all. A production-like cardinality benchmark therefore needs an explicitly
approved QA-only fixture expansion; it cannot be inferred from this small
seed.

## Realtime publication cross-check

The production `supabase_realtime` publication currently includes only
`public.tenant_conversations` and `public.tenant_messages` among the TOM
relations checked. The QA publication includes none of the checked relations.
This is consistent with the current QA environment's controlled zero-Realtime
state, but it leaves a source/runtime gap: `src/pages/ManageTenants.tsx`
subscribes to `packages` and `tenant_csc_assignments` changes at lines 361–377,
while those tables are not members of the production publication observed in
this read-only check. No event was generated and no publication was changed.
The mismatch is an owner-reviewed Realtime contract question, not an
implementation defect to repair inside this evidence packet.

## Query-family coverage register

| Surface / family | Current evidence | Status and remaining gap |
| --- | --- | --- |
| Portfolio directory list, search, filters, package lookup | Protected staff/CSC navigation and waterfall evidence in the parent packet | Bounded current behavior characterized; full-cardinality strata still open |
| Tenant detail read model | Staff-only navigation passed in protected run `34755463485` | Read shell characterized; child relations and largest-tenant detail breadth remain open |
| Address and relationship reads | Source inspected; QA has zero address/relationship rows | Needs approved QA fixture expansion before browser evidence |
| CSC assignment and connected-tenant reads | Source inspected; QA has zero rows in both relations | Needs approved QA fixture expansion; production Realtime publication gap noted above |
| Export/download paths | No safe export invocation in the current protected run | Requires a specifically scoped read-only export oracle and approved safe fixture |
| Realtime event delivery | Static listener source and publication membership inspected | Delivery/refresh behavior remains unexercised; do not mutate data in this packet |
| RPC/Edge directory/detail paths | Waterfalls captured only for routes actually visited; source inventory identifies additional calls | Requires an approved query-family matrix before broadening browser coverage |
| Ask Viv route and read history | Route reachable; current staff personas receive rollout-unavailable card; QA history/turn rows are zero | No generation or write was attempted; enabled-ring and history evidence remain open |

## Disposition and next gate

The unattended read-only work is complete and narrows the remaining work to
two gates:

1. TOM/RBAC/Client Health owners approve the representative QA query-family
   matrix and the synthetic cardinality strata to add (including whether
   address, assignment, relationship, participant, export, Realtime, and
   Ask Viv history fixtures are required); and
2. a separately authorized QA-only fixture packet provisions those rows and
   runs the corresponding read-only/browser checks. Any publication, schema,
   RLS, grant, Edge, cron, or production data change remains a separate packet
   with its own authorization and audit evidence.

Until those gates are resolved, P0.2/P0.3 should remain marked as expanded
bounded evidence rather than complete baseline or approved performance budget.
