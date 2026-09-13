# TOM P0.2/P0.3 — cross-initiative review matrix

> **Last updated:** 2026-09-13
> **Status:** evidence crosswalk prepared for owner review; it approves no policy, capability row, fixture mutation, or production action
> **Owner:** Tenant Operating Model with RBAC v6 and Client Health Activity Analytics
> **Inputs:** [TOM P0.2/P0.3 baseline packet](p0-2-p0-3-disposable-baseline-characterization.md), [cardinality/query-family follow-up](p0-2-p0-3-cardinality-query-family-follow-up-2026-09-13.md), [RBAC P1-l review draft](../../rbac-v6/p1/p1-l-aj-csc-golden-matrix-review-draft.md), [RBAC staff consumer inventory](../../rbac-v6/p1/p1-g-staff-internal-consumer-inventory.md), [Client Health plan](../../client-health-activity-analytics-plan-2026-09-03.md)
> **Evidence context:** current repository `origin/main@346e75d9`; live aggregate/publication reads in the linked follow-up were captured against `origin/main@2de9e154`; protected address follow-up is recorded in the [address audit entry](../../../../audit-log/entries/2026-09-13-tom-address-browser-characterization.md)

## Purpose and boundary

This matrix is the requested cross-initiative owner-review preparation. It
separates three questions that must not be collapsed into one QA observation:

1. what the current TOM UI and data paths do;
2. what RBAC v6 may eventually authorize for a principal, action, target, and
   relationship; and
3. which Client Health facts are permitted, attributable, fresh, and safe to
   expose as health or Ask Viv evidence.

The matrix records only source-backed boundaries and unresolved review items.
It does not convert a route guard into a capability grant, treat internal
identity as sufficient for a sensitive action, or treat missing health data as
normal/stable. No schema, RLS, grant, Realtime, Edge, cron, data, or
credential change is authorized.

## Intersection matrix

| Surface | TOM current-behavior evidence | RBAC v6 boundary | Client Health boundary | Review disposition |
| --- | --- | --- | --- | --- |
| Portfolio directory and first tenant detail read model | Staff personas reached `/manage-tenants` and a tenant detail route in protected run `34755463485`; production has 416 tenants | ADR-030 preserves broad all-tenant read for active internal staff; this does not grant sensitive writes | Tenant identity/lifecycle/package context is a parent TOM dependency for health consumers | Read characterization is consistent; keep broad-read observation separate from future action rows |
| Tenant members/users/contacts | QA has 19 members/users and 10 contacts; production has 936 members, 576 users, 114 contacts | Relationship and target proof remain distinct from broad internal read; ghost/contact actions need specific gates | Contact/member provenance must remain explicit before an activity or health fact is attributed | QA fixture is useful for bounded rows but not representative cardinality |
| Addresses, relationships, CSC assignments, connected tenants | QA has 3 synthetic addresses, 1 relationship, 2 assignments, and 2 connected tenants; production has 722 addresses, 2 relationships, 149 assignments, and 109 connected tenants; the protected address route/card reached but its populated query returned HTTP 400 | Assignment/relationship semantics remain TOM-owned inputs to any capability scope | Health/triage must use resolved tenant identity and not infer ownership from missing rows | Relationship/assignment/connection reads are observed; address query/lookup contract remains open |
| Messages, conversations, participants | QA has 18 messages and 9 conversations but zero participants; production has 701 messages, 506 conversations, 2,216 participants | Cross-tenant retrieval requires target scope and relationship proof; staff identity alone is not a universal retrieval grant | Ask Viv may cite only authorized, attributable facts and must preserve tenant boundaries | Query family is partially present but authorization-negative participant cases are unexercised |
| Export/download and SharePoint actions | No export invocation was made in the protected read-only run; source contains SharePoint Edge calls | Export-like, credential, and external-side-effect actions need action-specific security review | Health data cannot be exported or sent to an external system by inference from read access | Keep outside current QA run until an explicit safe export oracle and owner are named |
| Realtime directory refresh | `ManageTenants.tsx` subscribes to `packages` and `tenant_csc_assignments`; production publication check included only `tenant_conversations` and `tenant_messages` | A listener is not an authorization decision; any future change needs explicit server/publication review | Realtime refresh must not manufacture freshness or health certainty | Current source/runtime mismatch is characterized; no repair in this packet |
| Ask Viv route, history, and generation | Staff route reached the current rollout-unavailable card; QA has 1 synthetic conversation and 2 turns; the observed route read turns but did not issue a separate conversation-history request; no generation was attempted | Retrieval scope, exact capability, target tenant, and privacy/security review remain required | Missing/stale sources stay unavailable/unknown; LLM does not own totals, dates, risk, or permissions | Route/turn reachability is characterized; conversation-list, enabled-ring history, and generation remain open |
| Forecast/risk/retention inputs | This packet does not read or repair forecast outputs; the Client Health plan records empty/failed source behavior | No new analytics permission or broad definer path may be inferred from current UI | Existing consumers must preserve unavailable/unknown semantics until source/freshness gates close | Keep in Client Health owner gate, not TOM QA fixture scope |

## Review conclusions

The three initiatives do not require a contradictory interpretation of the
current evidence:

- TOM can characterize broad staff read behavior and tenant identity without
  claiming that every internal staff member may perform every action.
- RBAC can preserve ADR-030's all-tenant staff reads while keeping exports,
  mutations, cross-tenant retrieval, and external effects action- and
  relationship-specific.
- Client Health can consume only resolved, attributable, freshness-aware
  facts, retaining `unavailable`/unknown for absent or failed sources and
  leaving consultant-data and replacement-shadow decisions open.

The remaining owner review is therefore finite: approve the synthetic QA
strata and query-family list, confirm the interpretation of the Realtime
publication gap and staff read observations, and confirm that Ask Viv/export
coverage remains separately gated. No candidate row in this document is an
implementation-ready policy row.

## Owner decisions still needed

1. **TOM/RBAC/Client Health:** review the executed QA-only fixture expansion,
   including the address query/lookup 400 and the observed Ask Viv owner-scoped
   history behavior.
2. **TOM/RBAC/security:** decide whether the current package/CSC listener
   publication gap is an accepted legacy behavior to document or a separately
   authorized Realtime repair candidate.
3. **RBAC/security:** name the action-specific owner and negative-case oracle
   for export/download and SharePoint paths.
4. **Client Health:** confirm that any future Ask Viv/health characterization
   uses only the approved retrieval scope and consultant-data provenance;
   this packet does not infer metric definitions or pilot acceptance criteria.

Until these decisions are recorded, the P0.2/P0.3 status should remain
expanded bounded evidence with open representative-query and owner-review
gates.
