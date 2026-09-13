# Unicorn Academy / Sidekick — Product Research Project Pack

> **Purpose:** a safe, structured context pack for a shared ChatGPT Project to
> determine what Sidekick should be, how Academy-only customers fit into
> Unicorn, and what product, data, lifecycle, commercial, and authorization
> decisions are required before implementation.
>
> **Prepared:** 2026-09-14
>
> **Status:** product discovery and PRD input only. This pack does not
> authorize implementation, production changes, customer migration, billing
> changes, or use of identifiable customer data.

## 1. Recommended use

Create one shared ChatGPT Project named:

**Unicorn — Academy / Sidekick Product Discovery**

Use the Project to answer a foundational question:

> How should Unicorn support Academy-only customers—individuals,
> organisations, and RTOs—while preserving the established tenant, user,
> package, lifecycle, and authorization model?

The Project should distinguish three things that are currently easy to conflate:

1. **The customer account:** who the commercial relationship belongs to.
2. **The subscription or entitlement:** what Academy content and services have
   been purchased.
3. **The person’s access:** which user can see, enrol in, and complete content.

Sidekick may ultimately be one of these, or a product composed of all three.
The Project must not assume that the existing `Sidekick` package row is the
final product design.

Recommended research chats:

1. **Sidekick Product and Commercial Discovery** — product positioning,
   customer types, pricing, subscription, migration, and business operations.
2. **Sidekick Lifecycle and Unicorn Architecture Review** — current tenant
   lifecycle, RTO/onboarding, contacts, users, packages, Academy access,
   expiry, authorization, and implementation alternatives.

The final output should be one consolidated PRD discovery report, not an
implementation PR or schema proposal disguised as a decision.

Do not upload customer-identifiable records, credentials, production exports,
raw emails, notes, certificates, payment data, or screenshots containing
personal information. Use synthetic or irreversibly redacted examples only.

## 2. What Unicorn is today

Unicorn 2.0 is a multi-tenant compliance management system with a hosted
Supabase backend and a React/TypeScript frontend. Its established customer
model is tenant-centred.

The current client workflow generally revolves around:

- creating a tenant/client record;
- capturing legal name, trading name, ABN, and—where applicable—RTO details;
- checking duplicate identities and identifiers;
- optionally looking up and linking the RTO through training.gov.au;
- creating package instances;
- assigning a consultant and operational ownership;
- provisioning related resources such as SharePoint folders;
- inviting users and establishing primary/secondary/contact relationships;
- operating the tenant through active, suspended, closed, archived, or other
  lifecycle/access states;
- delivering work through packages, stages, tasks, documents, audits,
  communications, notes, and timeline events.

The current Add Client flow is therefore RTO/client-first and requires a legal
name for ordinary packages. It can create a tenant and package instance in one
workflow, but it is not designed around an individual learner with no RTO.

The relevant architectural baseline is the current tenant operating model:

- `tenants` is the current account boundary and application contract;
- `tenant_users` and related membership tables represent people connected to
  a tenant;
- one primary contact is an existing business invariant;
- `package_instances` represent operational package engagements;
- lifecycle, access, archive, close, and churn concepts exist but are not
  interchangeable;
- RTO/TGA data, consultant ownership, packages, activity, and integrations are
  all connected to the tenant workflow.

Academy already has a separate client-facing area:

- `/academy` and `/academy/trainer` routes;
- Academy-only users represented by `academy_user` / `academy_only`;
- an Academy layout that checks tenant Academy enablement;
- course audiences such as `trainer`;
- course enrolments, progress, assessments, resources, and certificates;
- package-to-course mappings and automatic enrolment mechanisms.

This is a useful foundation, but it does not yet prove that Sidekick is a
complete Academy subscription product.

## 3. Dated current-state evidence

The 2026-09-14 read-only investigation found:

- a live active package named **Sidekick**, package ID `1061`, with a
  membership/package duration of 12 months;
- no Sidekick package stages;
- no Sidekick Academy course mappings;
- no Sidekick package instances;
- no tenants currently assigned Sidekick;
- no evidence that Sidekick currently controls Academy access;
- 69 tenants with Academy access enabled;
- 46 live Academy-only memberships;
- 88 published courses tagged for the trainer audience;
- 71 published trainer courses marked available to all clients and 17
  trainer courses currently restricted through package rules;
- Superhero configured with 13 active course mappings, while Sidekick has none.

The repository contains the generic Academy-only invitation and routing
foundation, but there is no dedicated trainer entitlement or trainer-specific
account model. `trainer` currently behaves primarily as a course audience and
pathway label.

These are dated technical observations, not approved product definitions. The
live database and repository can also drift; the applied Sidekick seed
migration is not represented by the corresponding migration file in the
current checkout.

## 4. The product problem

The likely historical problem is:

1. `training.vivacity.com` hosted training courses for trainers.
2. That site was retired.
3. Trainers were moved into Vivacity Academy inside Unicorn.
4. Existing RTO clients could be represented using Unicorn's tenant and
   membership model.
5. New Academy customers may not have an RTO, compliance engagement, or
   conventional client lifecycle.
6. Sidekick was added as a package to provide a short-term answer.

The product must now answer whether an Academy customer should be treated as:

- an ordinary RTO client with a lighter package;
- an Academy-only organisation;
- an individual learner;
- a customer account with multiple Academy users;
- a user-level trainer subscription;
- or a new commercial relationship that still uses the tenant boundary for
  isolation but does not use the RTO workflow.

The wrong design would force an individual or non-RTO customer through fake RTO
details, while also allowing a package name to silently determine identity,
permissions, course access, billing, expiry, and lifecycle semantics.

## 5. Core hypotheses to challenge

These are hypotheses only.

### 5.1 Sidekick is an Academy plan, not an RTO service package

Sidekick may be best understood as a subscription tier or course entitlement
that belongs to Academy. The existing package table may remain a compatibility
surface, but Sidekick should not inherit RTO stages, consultant ownership,
SharePoint provisioning, regulatory workflows, or TGA assumptions by accident.

### 5.2 Tenant can remain the isolation boundary

The simplest durable model may retain a tenant/account for every customer,
including an individual, while making RTO information optional and explicitly
classifying the account as an RTO, Academy organisation, or Academy individual.
This preserves user membership, audit, support, and tenant isolation without
requiring a second security model.

### 5.3 Subscription and user access should be separate

An account-level Sidekick subscription may grant eligibility, while individual
users receive access through a named Academy role or membership. This avoids
using a package row as a substitute for a person’s authorization.

### 5.4 Academy access needs a canonical entitlement source

Package mappings and auto-enrolment are provisioning mechanisms. They should
not be the only authorization boundary. Course listing, enrolment, lesson,
assessment, resource, certificate, and progress access should all resolve the
same active entitlement, tenant membership, user state, and expiry rules.

### 5.5 The Academy lifecycle is related to—but not identical with—the RTO lifecycle

An Academy account may have onboarding, trial, active, paused, expired,
cancelled, migrated, and closed states without having compliance stages,
regulatory registration, CSC assignment, or an RTO renewal cycle.

## 6. Stakeholder research questions

### 6.1 Product and positioning

1. What exactly is Sidekick: a plan, subscription, course bundle, membership,
   migration product, or temporary compatibility label?
2. What customer problem is Sidekick meant to solve now?
3. Is it a permanent offer or only a replacement for the retired training site?
4. Who is the buyer: an individual, organisation, RTO, employer, or Vivacity
   partner?
5. Is the target user always a trainer, or can Sidekick include assessors,
   compliance staff, administrators, or learners?
6. How does Sidekick differ from Superhero and other Academy packages?
7. Is Sidekick intended to be the lowest Academy tier, a migration tier, or a
   separate product family?
8. Is Sidekick paid, free, trial-based, invite-only, bundled, or complimentary?
9. What is the promised customer outcome after purchase?
10. Which Academy features are explicitly included or excluded?

### 6.2 Customer/account types

11. Must every customer be represented by a Unicorn tenant?
12. Can a valid Academy customer have no RTO number, ABN, or registered legal
    entity?
13. Which account types are required: RTO, Academy organisation, Academy
    individual, partner, or internal account?
14. For an individual, do we create a one-user tenant or a separate account
    type outside the tenant model?
15. What minimum information is required for an Academy-only individual?
16. What minimum information is required for an Academy-only organisation?
17. Is a legal name required, or is a display/trading name sufficient?
18. Can an organisation have multiple learners, trainers, or administrators?
19. Can one account contain multiple RTOs or business divisions?
20. Can a Sidekick account later become an RTO client without losing history?
21. Can an RTO purchase Academy access for only selected staff?
22. Can one person belong to both an RTO tenant and an Academy-only account?

### 6.3 Onboarding and sales workflow

23. Who creates the account: staff, sales, the buyer, or self-service signup?
24. What event creates the account: payment, invitation, contract, or manual
    approval?
25. Who becomes the first account owner or primary contact?
26. Is the first individual user both owner and learner?
27. Should the current Add Client workflow branch into an Academy-only flow?
28. Which current steps should be skipped for Academy-only customers?
    - TGA/RTO lookup
    - RTO identifier capture
    - CSC assignment
    - SharePoint provisioning
    - compliance package/stage creation
    - client lifecycle tasks
29. Which existing steps should remain?
    - duplicate identity checks
    - tenant/account creation
    - contact creation
    - invitation
    - audit trail
    - billing linkage
30. Can onboarding be left incomplete and resumed?
31. What confirmation and welcome communications are required?
32. What happens when payment succeeds but account provisioning fails?

### 6.4 Users, roles, and membership

33. Is Academy access granted to the account, to a user, or both?
34. Are all users in a Sidekick organisation trainers by definition?
35. Is a trainer role required as a formal membership or position?
36. What roles are needed: owner, Academy admin, trainer, learner, billing,
    observer, or support contact?
37. Can one user hold multiple roles?
38. Can the account owner invite users?
39. Are there seat limits or paid additional seats?
40. Can the buyer transfer ownership?
41. What happens when a user leaves the organisation?
42. Can an Academy-only user be included in ordinary RTO messaging or
    broadcasts? The current RBAC decision says Academy-only users are excluded
    except for explicitly named Academy communications; confirm this remains
    correct for Sidekick.
43. Can staff impersonate or preview a Sidekick user, and what must be audited?
44. Are personal accounts allowed to have multiple emails or delegated access?

### 6.5 Content, enrolment, and learning behaviour

45. Which exact courses belong in Sidekick at launch?
46. Is the bundle all trainer courses, a curated subset, or a changing catalog?
47. Who owns the catalog decision and who can change it?
48. Are courses automatically enrolled, self-enrolled, assigned by an admin,
    or a combination?
49. Can a user see courses they are not entitled to purchase?
50. Can users preview restricted course metadata or lessons?
51. Are certificates included, and are they retained after expiry?
52. Are assessments and completion requirements different from ordinary Academy
    users?
53. Is progress migrated from `training.vivacity.com`?
54. Can a user continue an existing course after moving between packages?
55. Can Sidekick users access webinars, events, community, workbooks, PDP, or
    only courses?
56. Are there mandatory courses or completion deadlines?
57. Does the product support cohorts, cohorts by employer, or peer visibility?
58. Are course resources and recordings available after completion or expiry?

### 6.6 Subscription, expiry, and lifecycle

59. What are the exact Sidekick states: trial, pending, active, paused,
    expired, cancelled, suspended, migrated, closed, and deleted?
60. What is the source of truth for subscription status?
61. What are the start date, end date, renewal date, grace period, and timezone?
62. Is the 12-month duration fixed or configurable?
63. What does expiry block: login, course discovery, lessons, assessments,
    resources, certificates, or only new enrolment?
64. Is completed learning history retained after expiry?
65. What happens on refund, chargeback, cancellation, or failed renewal?
66. Can staff extend or pause an entitlement?
67. Can a customer renew before expiry and preserve the original account?
68. Can a customer hold overlapping Sidekick and Superhero entitlements?
69. What happens when the same user is entitled through multiple accounts?
70. How does Academy-only lifecycle differ from the existing RTO states of
    active, suspended, closed, archived, and churned?
71. Can an Academy-only account be archived without deleting learning history?

### 6.7 Relationship with the existing client lifecycle

72. Should Academy-only accounts appear in Manage Tenants?
73. If so, which columns and filters apply when there is no RTO or CSC?
74. Should Academy-only accounts have a primary contact under the existing
    tenant invariant?
75. Does every Academy account need consultant ownership?
76. Should Academy accounts participate in client health, retention, package
    burn, or consultant-capacity reporting?
77. Should Academy accounts have client notes, timeline events, tasks, and
    communications?
78. Which existing tenant lifecycle events should apply to Academy accounts?
79. Can an Academy account be merged, split, renamed, or transferred?
80. What is the difference between account closure, subscription cancellation,
    user removal, and learning-data deletion?
81. If an RTO account also has Sidekick users, which lifecycle state controls
    those users?
82. Should Academy-only accounts create operational package stages at all?

### 6.8 Migration from `training.vivacity.com`

83. What records are being migrated: accounts, users, enrolments, progress,
    completions, certificates, assessments, and expiry dates?
84. Is migration complete, ongoing, or still planned?
85. How are old accounts matched to Unicorn accounts?
86. What happens to duplicate email addresses or users with changed emails?
87. Does historical completion remain authoritative?
88. Do old certificates need to remain verifiable?
89. What courses map to current Academy course IDs?
90. What content was retired or renamed?
91. Is there a migration cutoff date?
92. Who handles accounts that never activate?
93. Can customers opt out or request correction of migrated data?
94. What evidence is retained to explain the migration result?

### 6.9 Commercial, support, and operations

95. Is Stripe or another billing system the commercial source of truth?
96. What creates, updates, renews, pauses, and cancels Sidekick?
97. Are webhooks required to update entitlements?
98. Who can grant complimentary access?
99. What staff permissions are needed to correct a subscription or membership?
100. What customer-facing emails are required?
101. What support tools are required: resend invite, reset access, transfer
     owner, extend expiry, restore progress, or merge accounts?
102. What audit trail is required for every entitlement or access change?
103. What reports are needed for sales, finance, support, and Academy operations?
104. What is the expected scale and peak enrolment volume?

### 6.10 Security, privacy, and compliance

105. What data may an Academy-only user see about other users in the same
     organisation?
106. Can a trainer see learner progress, or only their own progress?
107. Can an organisation administrator see all course activity?
108. What information must remain unavailable to Academy-only users?
109. How are tenant isolation and account switching enforced?
110. What happens to access when a user is disabled or archived?
111. What happens when an entitlement expires while a session is active?
112. Are certificates, assessment results, or trainer credentials sensitive?
113. What retention and deletion rules apply after cancellation?
114. Are there children, vulnerable people, or regulated learner records in
     scope?
115. What support or migration access requires elevated staff permissions?

## 7. Alternatives to evaluate

The research should compare at least these models:

### Option A — Reuse the existing tenant and package model

Create a tenant with optional RTO data, assign Sidekick as a membership
package, and use existing Academy-only users.

Advantages: smallest change and maximum reuse.

Risks: package semantics remain overloaded; RTO lifecycle and Academy
subscription rules may become entangled; individual onboarding remains awkward.

### Option B — Tenant remains the account boundary, with an explicit account type

Keep tenant isolation and memberships, but add an explicit customer/account
classification and a first-class Academy subscription/entitlement model.
RTO profile, consultant, stages, and compliance workflows become conditional
capabilities rather than implicit assumptions.

Advantages: preserves the strongest existing baseline while supporting
individuals and non-RTO organisations cleanly.

Risks: requires careful lifecycle and authorization design; needs migration of
existing Academy access semantics.

### Option C — Separate Academy account model

Create a new Academy account/customer abstraction independent of tenants, with
its own users, subscriptions, and authorization.

Advantages: clean commercial model.

Risks: duplicates identity, membership, audit, support, and isolation concepts;
creates complex conversion and cross-product access problems.

### Option D — User-level Sidekick subscription

Attach Sidekick directly to individual users, optionally grouped under an
organisation.

Advantages: fits an individual trainer naturally.

Risks: weakens account-level administration, complicates organisation billing,
and may not fit the tenant-centric support and audit model.

The Project should recommend one option, identify a fallback, and explain what
would make the recommendation change.

## 8. Proposed decision framework

For every recommendation, record:

- the customer problem solved;
- the intended customer/account type;
- the intended user and staff personas;
- the source of truth;
- the lifecycle states and transitions;
- the data required;
- the access decision and denial behaviour;
- the operational owner;
- migration implications;
- reporting and audit implications;
- privacy/security risks;
- reversibility and upgrade path;
- unresolved assumptions;
- confidence: high, medium, or low.

Do not accept “use the existing package table” as a complete answer. Explain
what a package means, who owns it, what it grants, how it expires, and how the
server enforces it.

## 9. Suggested minimum viable product

The first release should probably be limited to:

- Academy-only organisation and individual account onboarding;
- optional RTO data rather than fabricated RTO details;
- one clearly defined Sidekick entitlement;
- one account owner/primary contact model;
- named Academy users with explicit access scope;
- a fixed, approved course bundle;
- deterministic enrolment and expiry behaviour;
- preserved progress and certificate rules;
- staff support and audit actions;
- no access to RTO compliance workflows unless separately entitled;
- server-enforced tenant, membership, entitlement, user-state, and expiry
  checks;
- migration reconciliation for the approved legacy cohort.

The first release should not silently introduce consultant assignment,
SharePoint folders, compliance stages, RTO/TGA records, client-health scoring,
ordinary client broadcasts, or broad Academy access simply because the
customer was represented as a tenant.

## 10. Required final report from the ChatGPT Project

Produce one comprehensive final report containing:

1. Executive summary.
2. Reconstructed historical problem and assumptions.
3. Established Unicorn client-lifecycle baseline.
4. Current Academy and Sidekick implementation evidence.
5. Customer/account archetypes.
6. Recommended product definition.
7. Recommended account, user, entitlement, and lifecycle model.
8. Course catalog and enrolment rules.
9. Onboarding and operational workflows.
10. Migration strategy from `training.vivacity.com`.
11. Alternatives considered and trade-offs.
12. Security, privacy, authorization, and audit requirements.
13. Reporting, billing, support, and operational requirements.
14. MVP scope and explicit non-goals.
15. Acceptance criteria and negative cases.
16. Decisions required from Vivacity stakeholders.
17. Open questions, assumptions, and evidence gaps.
18. Confidence level for each major conclusion.

Clearly label each statement as one of:

- established Unicorn evidence;
- dated live-system observation;
- stakeholder observation;
- external evidence;
- inference;
- proposed product decision.

## 11. Paste into the ChatGPT Project instructions

```text
You are the research and product-definition partner for Vivacity's Unicorn
Academy and Sidekick discovery work. Your goal is to help define the right
product and lifecycle model before implementation.

Read the uploaded Project Pack and supporting Unicorn documents first. Treat
the current repository and dated live-system observations as evidence of what
exists, not as proof that the current design is the desired product. Clearly
separate established behaviour, dated observation, stakeholder experience,
inference, external evidence, and proposed product decisions.

Use Unicorn's established tenant-centred client lifecycle as the baseline:
tenant/account, legal and RTO identity where applicable, primary contact,
tenant users and relationships, packages/package instances, consultant and
operational ownership, lifecycle/access states, audit history, and tenant-safe
resources. Explicitly identify which of these should apply, be optional, or be
excluded for Academy-only organisations and individuals.

Keep these concepts separate:

1. customer/account identity;
2. RTO or regulatory profile;
3. subscription or commercial entitlement;
4. user membership and role;
5. course visibility, enrolment, progress, and certification;
6. operational client lifecycle;
7. authorization and tenant isolation.

Do not assume Sidekick is a finished product merely because a package named
Sidekick exists. Do not recommend fake RTO data for non-RTO customers. Compare
the existing-tenant, explicit-account-type, separate-Academy-account, and
user-level subscription alternatives.

Ask precise follow-up questions about individuals, organisations, RTOs,
multiple users, ownership, billing, seats, course bundles, migration,
renewal, expiry, cancellation, upgrades, support, reporting, and data deletion.
Challenge every ambiguous use of “client”, “member”, “trainer”, “package”,
“subscription”, “Academy access”, and “primary contact”.

For every proposed workflow, describe the actors, starting state, data created,
source of truth, side effects, lifecycle transitions, access decision,
failure/retry behaviour, audit record, and end state. Include the path for an
individual with no RTO, an Academy organisation, an existing RTO client, and a
user who later upgrades or leaves.

Treat package-to-course mappings as provisioning/configuration until the
research establishes a secure entitlement boundary. Require server-side
enforcement for course listing, enrolment, lessons, resources, assessments,
certificates, and progress. Include disabled, archived, expired, cancelled,
wrong-tenant, wrong-user, and revoked-access cases.

Protect confidentiality. Do not request or reproduce identifiable customer
data, raw notes, credentials, payment data, or production exports. Use
synthetic or irreversibly redacted examples.

When research is complete, produce the required final report format from the
Project Pack. Include alternatives, trade-offs, MVP scope, non-goals,
acceptance criteria, stakeholder decisions, evidence gaps, and confidence by
conclusion. Do not claim that research output authorizes code, schema, billing,
migration, or production changes.
```

## 12. Chat prompts

### Sidekick Product and Commercial Discovery

```text
You are leading the product and commercial discovery for Unicorn Academy /
Sidekick.

Read the Project Pack and uploaded sources first. Investigate what Sidekick is
supposed to mean for individuals, Academy organisations, existing RTO clients,
and migrated users from training.vivacity.com.

Work through product positioning, customer archetypes, pricing and billing,
onboarding, account ownership, users/seats, course bundles, migration,
renewal, expiry, support, reporting, privacy, and upgrade paths. Ask focused
questions where stakeholder knowledge is required. Do not assume the existing
Sidekick package row is the final product definition.

Compare the alternative account and entitlement models in the Project Pack.
For each recommendation, identify the customer outcome, operational owner,
required evidence, lifecycle implications, risks, and unresolved decisions.

When complete, produce the full final report requested by the Project Pack,
with confidence levels and clear labels for evidence, inference, and proposal.
Begin by stating the key ambiguity you think stakeholders must resolve first.
```

### Sidekick Lifecycle and Unicorn Architecture Review

```text
You are reviewing how Academy / Sidekick should fit into Unicorn's existing
client lifecycle and authorization architecture.

Read the Project Pack and uploaded sources first. Trace the current tenant,
RTO/profile, primary-contact, user/membership, package-instance, consultant,
stage, lifecycle/access, audit, and closure model. Then determine which parts
are appropriate for an Academy-only organisation or individual and which parts
would create accidental RTO obligations.

Examine account identity, user membership, Academy access, course audience,
package-to-course mapping, enrolment, progress, certificates, expiry,
disabled/archived users, migration, support access, tenant isolation, and
server-side authorization. Treat current behaviour as evidence, not approval.

For each candidate design, describe the source of truth, state transitions,
database/domain boundaries, staff and customer permissions, failure modes,
audit requirements, migration risks, and negative test cases. Pay special
attention to an individual with no RTO, an Academy organisation with multiple
trainers, an existing RTO client with selected Academy users, and an upgrade
from Sidekick to a fuller Unicorn service.

When complete, produce the full final report requested by the Project Pack,
with confidence levels and explicit decisions required from stakeholders.
Begin by summarising the most important mismatch between the current
tenant-centred onboarding flow and an Academy-only customer.
```

### Final handoff to Codex

After the ChatGPT Project produces its final report, upload or paste it into a
Codex task in the Unicorn repository and ask:

```text
Review this completed Unicorn Academy / Sidekick product-discovery report
against the current repository, live read-only evidence, tenant operating
model, and RBAC plans. Produce an implementation-ready PRD handoff that
preserves stakeholder disagreements and attribution, separates evidence from
proposals, identifies the decisions still requiring Vivacity approval, and
maps the recommended lifecycle/account/entitlement model to bounded delivery
phases. Do not change production code, schema, billing, migration data, or
customer access.
```

## 13. Recommended files to add to the ChatGPT Project

### Required

1. This Project Pack.
2. [Tenant Operating Model, Directory Performance, ERP, and Ask Viv Data
   Architecture Plan](../reference/tenant-operating-model-data-architecture-plan-2026-09-02.md).
3. [RBAC v6 Authorization Implementation Plan](../reference/rbac-v6-authorization-implementation-plan-2026-09-01.md).

### Recommended

4. [Client Health, Client Activity, Consultant Triage, and Intervention
   Analytics Plan](../reference/client-health-activity-analytics-plan-2026-09-03.md),
   only for understanding how Academy-only users should be treated in broader
   client analytics and communications.
5. A redacted or synthetic Academy migration example.
6. A short glossary of tenant, account, RTO, membership, package, entitlement,
   enrolment, trainer, and learner.
7. An approved current Sidekick/Superhero commercial comparison, if one exists.

Do not upload source code, `.env` files, credentials, production exports, raw
customer records, or the full audit log.

## 14. Completion criteria for discovery

Discovery is complete only when the Project has produced:

- a clear definition of Sidekick and its target customers;
- named account archetypes and their required fields;
- an explicit decision on tenant reuse versus a separate account model;
- a decision on account-level versus user-level entitlement;
- a course catalog and enrolment policy;
- a lifecycle/state-transition model including expiry and cancellation;
- a defined relationship with RTO onboarding and existing client lifecycle;
- a migration approach for the retired training site;
- user, staff, billing, support, reporting, privacy, and audit requirements;
- an authorization decision matrix and negative cases;
- an MVP and non-goals;
- an upgrade, downgrade, closure, and data-retention policy;
- all unresolved stakeholder decisions assigned to owners.

These outputs are inputs to product and implementation planning. They do not
authorize code, schema, billing, migration, customer communication, or
production rollout.

## 15. Source precedence

If this pack conflicts with another source, use this order:

1. latest explicitly approved Vivacity product or commercial decision;
2. current implementation and freshly regenerated read-only evidence;
3. approved tenant operating-model and RBAC decisions;
4. detailed Academy or migration decisions;
5. this research pack;
6. historical notes and assumptions.

Always retain dates. A historical workaround is evidence of a past problem,
not proof of the intended future architecture.
