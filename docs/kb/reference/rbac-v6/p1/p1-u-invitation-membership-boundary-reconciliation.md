# RBAC v6 P1-u — invitation and membership boundary reconciliation

> **Status:** preparation-only evidence supplement; no capability, grant,
> default, role, RLS, RPC, Edge, credential, hosted-QA, or production change
> is authorized.
>
> **Parent:** [P1-m row-by-row golden preparation](p1-m-row-by-row-golden-preparation.md)
>
> **Source cutoff:** `origin/main@2b89d85491d6840620f8a344891771da72ab9831`
>
> **Owners:** RBAC v6 coordinates; TOM owns tenant/contact/membership
> relationship semantics; security reviews service-role and invitation
> boundaries.

## Purpose

The canonical P1-m ledger intentionally leaves actor, target, first-boundary,
and denial fields unresolved until the source and server contracts are
reconciled. This bounded supplement records the current evidence for the
invitation and tenant-membership area so the next reviewer can split the
bundled rows without mistaking a frontend gate or a feature-key grep for the
trusted authorization boundary.

These are observations of current behavior, not target policy. Every proposed
capability remains `candidate_not_approved`.

## 1. `admin.invites.manage` — bundled row requires boundary split

The P1-m row currently labels this feature `manage`, `scope=global`,
`readiness=needs_product_input`, and `policy_state=candidate_not_approved`.
That classification remains unchanged. Current source evidence shows at least
five materially different operations:

| Candidate action | Current boundary and target evidence | Actor/relationship evidence | Required negative case | Next disposition |
|---|---|---|---|---|
| Create client invitation | `supabase/functions/invite-user/index.ts:64-120,199-236` authenticates the bearer with `auth.getUser`, loads `public.users`, checks `is_vivacity_team_safe`, and for a tenant admin verifies a `tenant_users(user_id, tenant_id)` row. The standard path writes one pending `user_invitations` row at `:613-681`. | Internal staff are recognized by the staff helper; non-staff must be an `Admin` profile and a member of the target tenant. Client relationship roles are separately allowlisted. | Anonymous/invalid token; non-admin; tenant-admin targeting another tenant; invalid relationship role; duplicate pending invitation; capacity limit. | Split into an invitation-create candidate with an explicit tenant target and relationship proof. Keep the broad current staff path as evidence, not as an RBAC grant. |
| Resend invitation | `supabase/functions/resend-invite/index.ts:115-117` checks `admin.invites.manage` before operating on the invitation/email workflow. | Current source uses a literal capability check; target and tenant binding still require direct source/server reconciliation. | Authenticated caller without the capability; wrong-tenant invitation; expired/revoked invitation; repeated resend/rate limit. | Separate resend from create/cancel; require target invitation and tenant proof. |
| Cancel invitation | `supabase/functions/cancel-invite/index.ts:49-51` checks `admin.invites.manage` before cancellation. | The row is an invitation lifecycle target; current source does not make a tenant-admin relationship equivalent to global invite authority. | Anonymous/unauthorized caller; wrong-tenant ID; already accepted/revoked/expired invitation; replay. | Separate cancel with explicit lifecycle and audit semantics. |
| Bulk send | `supabase/functions/bulk-send-invitations/index.ts:66-68` checks `admin.invites.manage`; its batch target and partial-failure behavior are distinct from one-contact promotion. | Capability check is explicit, but recipient tenant/contact resolution and batch authorization need direct inspection. | Missing capability; mixed-tenant batch; duplicate/collision; partial failure; outbound-email side effect. | Keep as a high-risk batch/external-effect candidate; do not inherit single-invite semantics. |
| Trusted email dispatch | `supabase/functions/send-invitation-email/index.ts:10,152` documents and checks the invitation-management capability for the staff path; the trusted internal path also accepts the service-role bearer (`:184` and function README). | Human staff and internal service invocation are different principal classes. Service-role possession is not a human grant. | Forged/anonymous bearer; wrong invitation; service-role misuse; plaintext token exposure; unintended provider dispatch. | Split provider dispatch into a protected external-effect capability and a separately classified machine workflow. |

The contact-promotion caller at
`src/features/client-identity/promoteContact.ts:10-41` invokes
`invite-user` with an explicit relationship role and `skip_email: false`. The
caller does not supply an RBAC feature key; the Edge Function's current
staff/tenant-admin checks are the first observed authorization boundary. The
pending invitation is the intended pre-acceptance target; no authenticated
membership is supposed to exist before `accept_invitation_v2`.

### Reconciliation conclusion for the bundled row

`admin.invites.manage` must not become one golden grant covering creation,
resend, cancellation, bulk sending, and provider dispatch. The source proves
different actor classes, targets, side effects, and denial cases. The current
P1-m actor/target/boundary fields should remain unresolved until product and
security choose the atomic action names and the owner of the `invite-user`
staff/tenant-admin contract. This supplement supplies evidence for that review;
it does not choose the policy.

## 2. `admin.tenant_users.manage` — direct membership writers need server proof

The P1-m row currently has no recognized frontend or Edge feature-key
reference, `readiness=needs_product_input`, and all policy fields unresolved.
The source still exposes a reachable UI gate and multiple direct writers:

| Surface | Current evidence | Why it is not yet a golden authorization row |
|---|---|---|
| UI visibility | `src/components/client/TenantUsersTab.tsx:130` computes `canManageUsers` from `isSuperAdmin()`, `hasTenantAdmin(tenantId)`, or `isVivacityTeam`. | A UI predicate does not prove the server target, relationship, or denial boundary. |
| Membership removal | `TenantUsersTab.tsx:543-561` directly deletes the selected `(tenant_id, user_id)` from `tenant_users`. | The actual authenticated RLS policy and any staff/client distinction must be verified directly; page visibility is not sufficient. |
| Swap to contact | `TenantUsersTab.tsx:566-577` invokes `swap_tenant_user_to_contact` with `p_tenant_id` and `p_user_id`. | This is a privileged identity/lifecycle RPC with a distinct rollback and audit contract; it must not be inferred from ordinary member-management semantics. |
| Field update | `TenantUsersTab.tsx:589-612` updates `tenant_users.position_type` for the tenant/user pair. | This is a narrower profile/relationship mutation than removal or contact swap and may need a separate action. |
| Contact presentation | `TenantUsersTab.tsx:1185-1200` passes ghost members to `TenantContactsSection`; that component also reads pending invitations and promotes contacts through the standard invitation path. | Ghost classification, contact visibility, and promotion are TOM lifecycle semantics, not proof of a broad tenant-user management grant. |

The current evidence supports the following preparation fields without
turning them into policy:

```text
target: tenant-scoped membership or relationship row resolved from tenant_id + user_id
actor: authenticated page principal, exact server identity still unresolved
relationship_proof: target tenant membership/role plus canonical lifecycle state
first_enforcement_boundary: database RLS or SECURITY DEFINER RPC, to be captured directly
denial cases: wrong tenant, non-admin client, disabled/revoked principal, target swap, stale UI gate
owner: RBAC v6 + TOM; security for identity swap and RPC review
policy_state: candidate_not_approved
```

The `global` scope currently present in P1-m is an inherited candidate label,
not evidence that a tenant-admin can manage every tenant. It must not be
carried into a golden matrix without server-side target resolution and the
approved TOM membership model.

## 3. Crosswalk and next static actions

The invitation and membership flows intersect but are not one capability:

```text
pre-login tenant contact
  -- explicit relationship role + skip_email:false --> pending invitation
  -- accept_invitation_v2 --> authenticated identity + membership rows

existing membership administration
  -- remove/update/swap --> tenant_users / tenant_members / tenant_contacts
```

Before any row can become implementation-ready, the next evidence pass must:

1. map every `invite-user`, `resend-invite`, `cancel-invite`,
   `bulk-send-invitations`, and `send-invitation-email` branch to its exact
   actor class, invitation/tenant target, and first server check;
2. inspect the deployed and repository definitions for the membership RLS and
   `swap_tenant_user_to_contact` RPC, including owner, `SECURITY DEFINER`,
   grants, and rollback/audit behavior;
3. add explicit wrong-tenant, wrong-actor, disabled, collision, replay, and
   external-dispatch denial cases to the future golden matrix; and
4. have TOM, RBAC, security, and product review the atomic action names before
   changing any canonical ledger row.

No static evidence here authorizes a grant, role default, pilot enrollment,
telemetry sink, RLS/RPC/Edge modification, invitation send, hosted QA run, or
production operation.

## Verification

Documentation-only evidence supplement. Before review, run:

```text
node scripts/check-kb-links.mjs
node scripts/check-kb-doc-size.mjs
git diff --check
```

Runtime suites and hosted verification are not applicable; this packet makes
no runtime or data change.
