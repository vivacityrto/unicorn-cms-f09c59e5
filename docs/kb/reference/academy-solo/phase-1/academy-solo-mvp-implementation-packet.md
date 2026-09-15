# Academy Solo MVP — Phase 1 implementation packet

> **Status:** implementation in progress — controlled pilot approved; invitation compatibility fix verified in allowlisted QA; invitation-capacity and reversible-Solo fixes prepared with focused contracts; Manage Clients account-surface separation implemented, final authenticated pilot verification pending
> **Started:** 2026-09-14  
> **Target:** pilot-ready by 2026-09-15, subject to the approval gates below  
> **Owner:** Academy Solo delivery workstream  
> **Commercial shape:** $45/month, one named user, manual provisioning; payment and billing automation are out of scope

## Purpose

This is a time-boxed delivery workstream, not a fifth cross-cutting program.
It implements the smallest safe Academy Solo slice on the existing identity,
tenant, Academy membership, enrolment, progress, and certificate primitives.
The four tracked initiatives remain authoritative for their own concerns.

The account boundary is deliberately separated from the RTO client workflow:
the existing `tenants` row is used temporarily for isolation and existing
Academy foreign keys, but an Academy Solo account is provisioned by its own
staff-only flow with no RTO profile, package instance, payment, consultant,
SharePoint, stage, or Client Health side effect. This is a compatibility
bridge, not a claim that Solo is an RTO customer.

### Directory/account-surface contract

Academy Solo remains visible in **Manage Clients** so internal staff have one
discoverable tenant directory, but it is classified from the persisted
`metadata.academy_solo` marker rather than from the deprecated
`tenants.tenant_type` or a Sidekick package. The directory provides an
explicit account-type filter and routes Academy lifecycle work to **Academy
Customers**. Academy rows are excluded from RTO-only package, invoice,
renewal, registration, CSC-load, compliance-stage, and Client Health metrics
and actions; future Academy analytics must use Academy entitlement/activity
facts instead.

The product discovery source is
`C:/Users/carls/.codex/.chatgpt-projects/g-p-6aa73a757abc8191971caabac7d73939/academy-solo-discovery-handoff.md`.
That handoff is treated as product evidence and open questions, not as an
instruction to bypass repository approval, migration, audit, or deployment
controls.

## Pilot contract

The pilot is coherent only when all of these are true:

- one existing or newly invited identity is used through the existing
  `invite-user` / Academy User flow;
- staff can create the Academy-only account from **Academy Customers → Create
  Academy Solo**, without opening the ordinary Add Client workflow;
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

## Current truth-sync (2026-09-15)

The first authenticated QA invite exposed a compatibility defect in the
acceptance RPC: `academy_user` attempted to write the display role
`Academy User`, but that value is not present in `public.dd_unicorn_roles`.
The corrective migrations keep the valid legacy `User` value in
`public.users.unicorn_role`, return `relationship_role` from token validation,
bind anonymous RPC acceptance to the invited email's auth identity, and retain
`academy_user` plus `academy_only` as the relationship and authorization
authorities. The invitation page now uses Vivacity Academy language for Solo
invitations, finalizes an already-authenticated matching identity directly,
and preserves ordinary RTO invitation copy.

The approved operating shape is explicit: Academy Solo accounts remain
visible to staff as a distinct account type, but Academy Customers remains the
authoritative lifecycle surface. Manage Clients defaults to the RTO account
view; staff can explicitly choose Academy Solo or All when they need
cross-directory visibility. It must not treat Solo as an RTO client or expose package,
invoice, CSC, compliance-stage, or Client Health actions for it. No Sidekick
package is created; future analytics should consume an explicit Academy
account/entitlement event rather than infer product identity from a compliance
package.

The allowlisted `unicorn-qa` browser verification now passes the authenticated
invite path: the learner reaches `/academy`, receives the Academy welcome
message, and produces the expected `User` profile, `academy_user` /
`academy_only` membership, and zero package instances. Two non-code readiness
limits remain: Supabase Auth email rate limiting blocked repeated fresh-identity
signups, and the QA Academy catalogue currently contains no published
courses. These remain environment/data gates and are not silently treated as
application success.

### Regression truth-sync (2026-09-15)

Two follow-up defects were confirmed from source review. The invitation Edge
Function was still sending the removed `p_caller_id` argument to the
one-argument `get_tenant_user_capacity` RPC through a service-role client;
tenant-admin invitations therefore failed before the invitation write. The
bounded correction keeps invitation writes service-role-backed but performs
the capacity read through a caller-scoped client that forwards the validated
bearer token, preserving the RPC's `auth.uid()` authorization boundary.

The Solo lifecycle RPC also treated the presence of `metadata.academy_solo`
as a permanent Solo state. The corrective migration records the pre-Solo
`academy_max_users` value when enabling the marker, removes the marker on
disable, and restores the recorded cap. The Academy Customers form mirrors
that behavior when toggling before save, while retaining auto-enrol rules for
non-Solo Academy access. Closing a drawer now clears its `tenant` query
parameter so Manage Clients deep-links do not immediately reopen it.

These corrections do not add a package, a global role, a Client Health metric,
or an RTO onboarding side effect. The migration is included in the reviewable
PR and has not been applied to production by this change.

## Cross-initiative decision matrix

| Initiative | Solo dependency | Decision for this packet |
|---|---|---|
| Codebase Optimization | Route/guard and test discipline | Use existing Academy routes; add only bounded code and focused verification. |
| RBAC v6 | Server authorization and staff capability boundary | Do not wait for the full RBAC v6 program; grant the existing Academy tenant-access capability to all active internal staff and enforce content access in RLS. |
| Tenant Operating Model | Identity/membership semantics and tenant isolation | Reuse existing tenant + `tenant_users`; do not run contact promotion, tenant cutover, or RTO onboarding. |
| Client Health Activity Analytics | Avoid contaminating health/ops metrics | Solo accounts are not Client Health subjects; no analytics schema or metric work is part of this packet. |

## Evidence and known gaps

| Area | Observed state | Required response |
|---|---|---|
| Identity | Existing auth/public user and tenant membership paths exist. | Reuse identity; do not create a second account system. |
| Account provisioning | Ordinary Add Client is RTO/package-oriented. | Use the staff-only `create_academy_solo_account` RPC and Academy Customers UI; retain the tenant row only as the temporary isolation boundary. |
| Academy UI | `AcademyLayout` uses tenant-level `academy_access_enabled`; routes already exist. | Keep route shape; make the server boundary authoritative. |
| Catalogue RLS | Later policies allow published courses and module outlines to any authenticated caller. | Replace with `has_academy_access_safe(auth.uid())`. |
| Lesson RLS | Full lesson content is partly enrolment-gated, but preview/content policy is not tied to entitlement. | Require current Academy access, then enrolment for non-preview content. |
| Enrolment | Self-enrol policy checks identity/tenant shape but not Academy entitlement. | Add entitlement and exact-tenant checks. |
| Progress | Own-progress policy permits writes without current Academy access. | Preserve historical reads; require current access for writes. |
| Staff lifecycle | Existing tenant-access page writes the broad flag directly and lacks Solo-specific lifecycle/audit semantics. | Add a bounded staff lifecycle path and audit events before pilot activation. |
| Tier model | Deprecated `tenant_type` enum/column has no live writer and no production usage. | Do not revive it; preserve it as schema residue pending a separate sweep. |

## Delivery slices

1. **Account provisioning.** Add the staff-only Academy Solo account creation
   RPC/UI path. It creates one Academy-enabled account with one seat,
   disables RTO-side feature flags, writes an audit event, and never creates a
   package or payment.
2. **Server boundary (in progress).** Add the recursion-safe Academy access
   helper and tighten catalogue, lesson, assessment, question, enrolment,
   attempt, and progress policies. Keep history readable after access ends.
3. **Manual lifecycle.** Provide staff-only activation/suspension/reactivation/
   end actions for a tenant and named learner, with an audit event containing
   actor, tenant, prior state, new state, and reason. Identity creation uses
   the existing Academy User invitation flow; Solo enable/disable is
   reversible for existing Academy RTO tenants; no new auth system or payment
   collection is introduced.
4. **Named-user and directory guard.** Enforce the one-user pilot
   operationally, surface the Academy-only membership clearly to staff, and
   keep Academy rows discoverable without treating them as RTO clients. Do not
   alter RTO contacts or ordinary client user roles.
5. **Verification.** Run static migration contract tests, frontend tests,
   edge tests, typecheck, lint ratchet, build, then complete authenticated
   positive and negative cases against the pilot account before treating the
   controlled pilot as ready. The positive authenticated invite case is now
   verified in allowlisted QA; the capacity-RPC and Solo-reversibility
   contracts are now included in the repository checks. The drawer close and
   toggle behavior require the bounded authenticated browser pass; negative
   authorization cases and a fresh-identity run remain separate gates.

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
   (**Confirmed: all active internal Vivacity staff.**)
4. Are monthly live webinars and on-demand replays required on day one, and
   do they already have the same Academy access boundary? (**Working
   assumption: only content already reachable through the Academy catalogue;
   webinar entitlements are not invented in this slice.**)
5. Should the pilot invite an existing authenticated user only, or may staff
   create a new identity after a separate side-effect review? (**Confirmed:
   identity creation is allowed through the existing Academy User invitation
   flow.**)
6. Which tenant and named user are the first pilot, who owns the account, and
   what are the activation and end dates? (**Confirmed for local testing:
   use the Demo Academy User fixture below; the real tenant/email remains
   local-dev/QA data until supplied.**)

## Local demo test data

The repository has no local Supabase service. Use the allowlisted
`unicorn-qa` project for hosted invite verification; these values are a
manual test-data recipe, not an automatic seed:

- Tenant label: `Academy Solo Demo`
- Learner name: `Demo Academy User`
- Learner email: `demo.academy.user@example.test` (replace with an inbox that
  can receive the invitation when testing the acceptance flow)
- Relationship role: Academy learner / `academy_user` (stored legacy role: `User`)
- Academy Solo marker: on
- Maximum users: `1`
- Catalogue: every published Vivacity Academy course
- Activation: `2026-09-14`
- Suggested expiry: `2026-09-21`
- Internal note: `Solo pilot — Demo Academy User — local verification`

For local verification, open the staff **Academy Customers** screen, choose
**Create Academy Solo**, enter the account and Demo Academy User details, and
submit. The account is created without the Add Client/package workflow and the
invitation dialog opens with the learner prefilled. A local server may use a
hosted project because its existing `invite-user` and
`send-invitation-email` Edge Functions are deployed there; use QA fixtures for
the explicit controlled-pilot invite test and never create pilot data in
production as part of this packet.

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
- the controlled pilot is treated as a public paid launch without payment,
  renewal, refund, support, and failure-policy decisions.

## Follow-up explicitly deferred

The next product phase may replace the temporary tenant-backed bridge with a
first-class subscription/entitlement model, public checkout, billing provider
integration, renewal state machine, legacy-user commercial policy, Team/Elite
seat semantics, self-service onboarding, and a formal Academy account type.
Those are not hidden inside this pilot packet.
