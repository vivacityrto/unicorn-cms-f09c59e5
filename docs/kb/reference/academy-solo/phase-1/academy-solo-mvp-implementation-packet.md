# Academy Solo MVP — Phase 1 implementation packet

> **Status:** implementation in progress — controlled pilot only  
> **Started:** 2026-09-14  
> **Target:** pilot-ready by 2026-09-15, subject to the approval gates below  
> **Owner:** Academy Solo delivery workstream  
> **Commercial shape:** $45/month, one named user, manual provisioning; payment and billing automation are out of scope

## Purpose

This is a time-boxed delivery workstream, not a fifth cross-cutting program.
It implements the smallest safe Academy Solo slice on the existing identity,
tenant, Academy membership, enrolment, progress, and certificate primitives.
The four tracked initiatives remain authoritative for their own concerns.

The product discovery source is
`C:/Users/carls/.codex/.chatgpt-projects/g-p-6aa73a757abc8191971caabac7d73939/academy-solo-discovery-handoff.md`.
That handoff is treated as product evidence and open questions, not as an
instruction to bypass repository approval, migration, audit, or deployment
controls.

## Pilot contract

The pilot is coherent only when all of these are true:

- one existing or manually pre-provisioned identity is reused;
- exactly one named learner is given an Academy-only membership for the pilot;
- Academy catalogue, enrolment, lesson content, assessment, progress writes,
  and certificate issuance are protected server-side;
- the catalogue is the approved set of published Academy courses (current
  working assumption; see open questions);
- staff can activate, suspend, reactivate, and end access with an audit trail;
- ending access removes protected content and write access but does not delete
  enrolments, progress, completions, or certificates;
- RTO/compliance workflows, communications, Client Health workflows, and
  legacy `training.vivacity.com` users are not silently changed;
- Team, Elite, public checkout, Stripe/webhooks, renewals, grace periods,
  refunds, automatic legacy conversion, and broad RBAC redesign remain out of
  scope.

The deprecated `tenants.tenant_type` values (`academy_solo`, `academy_team`,
`academy_elite`) and the Sidekick package are not product or security
authorities for this slice. The existing `academy_access_enabled` flag is the
temporary coarse entitlement switch, with a dedicated RLS helper defining the
protected-content boundary.

## Cross-initiative decision matrix

| Initiative | Solo dependency | Decision for this packet |
|---|---|---|
| Codebase Optimization | Route/guard and test discipline | Use existing Academy routes; add only bounded code and focused verification. |
| RBAC v6 | Server authorization and staff capability boundary | Do not wait for the full RBAC v6 program; use the existing staff permission for the pilot and enforce content access in RLS. |
| Tenant Operating Model | Identity/membership semantics and tenant isolation | Reuse existing tenant + `tenant_users`; do not run contact promotion, tenant cutover, or RTO onboarding. |
| Client Health Activity Analytics | Avoid contaminating health/ops metrics | Solo accounts are not Client Health subjects; no analytics schema or metric work is part of this packet. |

## Evidence and known gaps

| Area | Observed state | Required response |
|---|---|---|
| Identity | Existing auth/public user and tenant membership paths exist. | Reuse identity; do not create a second account system. |
| Academy UI | `AcademyLayout` uses tenant-level `academy_access_enabled`; routes already exist. | Keep route shape; make the server boundary authoritative. |
| Catalogue RLS | Later policies allow published courses and module outlines to any authenticated caller. | Replace with `has_academy_access_safe(auth.uid())`. |
| Lesson RLS | Full lesson content is partly enrolment-gated, but preview/content policy is not tied to entitlement. | Require current Academy access, then enrolment for non-preview content. |
| Enrolment | Self-enrol policy checks identity/tenant shape but not Academy entitlement. | Add entitlement and exact-tenant checks. |
| Progress | Own-progress policy permits writes without current Academy access. | Preserve historical reads; require current access for writes. |
| Staff lifecycle | Existing tenant-access page writes the broad flag directly and lacks Solo-specific lifecycle/audit semantics. | Add a bounded staff lifecycle path and audit events before pilot activation. |
| Tier model | Deprecated `tenant_type` enum/column has no live writer and no production usage. | Do not revive it; preserve it as schema residue pending a separate sweep. |

## Delivery slices

1. **Server boundary (in progress).** Add the recursion-safe Academy access
   helper and tighten catalogue, lesson, assessment, question, enrolment,
   attempt, and progress policies. Keep history readable after access ends.
2. **Manual lifecycle.** Provide staff-only activation/suspension/reactivation/
   end actions for a pre-provisioned account, with an audit event containing
   actor, tenant, user, prior state, new state, and reason. No automated
   account creation or payment collection in this slice.
3. **Named-user guard.** Enforce the one-user pilot operationally and surface
   the Academy-only membership clearly to staff. Do not alter RTO contacts or
   ordinary client user roles.
4. **Verification.** Run static migration contract tests, frontend tests,
   edge tests, typecheck, lint ratchet, build, and an authenticated negative
   case against an approved QA fixture before any hosted apply.

## Approval questions consolidated

These are the only product decisions needed to remove the remaining material
ambiguity. The implementation proceeds under the working assumptions in
parentheses until answered:

1. Is tomorrow a controlled manually provisioned pilot, or a public paid
   launch? (**Working assumption: controlled pilot.** A public launch is not
   safe without payment, refund, renewal, failure, grace-period, and support
   policy decisions.)
2. Does “full course library access” mean every currently published Academy
   course, or a named allowlist excluding trainer-facing/private content?
   (**Working assumption: every published course approved for the pilot.**)
3. Which staff roles may activate, suspend, reactivate, and end Solo access?
   (**Working assumption: existing Academy tenant-access managers, subject to
   the existing server-side staff gate.**)
4. Are monthly live webinars and on-demand replays required on day one, and
   do they already have the same Academy access boundary? (**Working
   assumption: only content already reachable through the Academy catalogue;
   webinar entitlements are not invented in this slice.**)
5. Should the pilot invite an existing authenticated user only, or may staff
   create a new identity after a separate side-effect review? (**Working
   assumption: existing/pre-provisioned user only.**)
6. Which tenant and named user are the first pilot, who owns the account, and
   what are the activation and end dates? (**Working assumption: one approved
   tenant, one existing user, a named internal owner, and an explicit end date
   before hosted activation.**)

## Stop/release gates

Do not call this a production launch if any of these remain unverified:

- an unauthorised authenticated user can enumerate or read protected Academy
  content;
- an ended user can continue lesson/assessment/progress writes;
- a user can enrol against a different tenant or without an Academy-enabled
  membership;
- a wrong user or wrong tenant can read or mutate progress, attempts, or
  certificates;
- activation/suspension/end is not attributable to a staff actor;
- existing RTO Academy access regresses;
- the exact catalogue and named pilot account are not approved;
- the migration is applied to the hosted project without the required review,
  audit entry, and rollback plan.

## Follow-up explicitly deferred

The next product phase may introduce a first-class subscription/entitlement
model, public checkout, billing provider integration, renewal state machine,
legacy-user commercial policy, Team/Elite seat semantics, self-service
onboarding, and a formal Academy account type. Those are not hidden inside
this pilot packet.
