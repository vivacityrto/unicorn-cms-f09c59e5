# RBAC v6 P1.1 — TOM contact-promotion row reconciliation

> **Parent ledger:** [P1-m row-by-row golden preparation](p1-m-row-by-row-golden-preparation.md)
>  
> **TOM packet:** [P1.1 first contact-promotion implementation packet](../../tenant-operating-model/p1/p1-1-first-contact-promotion-implementation-packet.md)
>  
> **Status:** bounded cross-initiative reconciliation, 2026-09-14; preparation only; no policy, grant, role, RLS, RPC, trigger, Edge, schema, data, hosted-QA, or production action
>  
> **Owner:** RBAC v6 with TOM semantics and security review

## Purpose and boundary

The 85-row P1-m ledger remains the authoritative preparation inventory. This
companion reconciles only the rows touched by TOM P1.1's contact → invitation →
acceptance boundary, so the current source evidence is not lost behind a broad
`manage` label. It does not promote any row to `implementation_ready` or
replace the product/security approval gates in P1-m.

## Current-flow evidence

| Boundary | Current trusted or behavior-bearing source | Evidence captured for RBAC |
|---|---|---|
| Contact promotion caller | `src/components/client/TenantContactsSection.tsx:241-280`; `src/features/client-identity/promoteContact.ts:10-41` | The operator chooses an explicit `relationship_role`; the adapter requires an authenticated session and invokes `invite-user` with an explicit tenant and `skip_email: false`. |
| Invitation authorization | `supabase/functions/invite-user/index.ts:64-120,199-236` | The Edge function authenticates the bearer token, loads the caller profile, checks tenant-admin membership in `tenant_users`, restricts client-admin relationship roles, and restricts non-staff legacy roles to `Admin`/`User`. |
| Invitation write | `supabase/functions/invite-user/index.ts:613-681` | Capacity is checked; an active same-email/tenant pending invitation is rejected; expired invitation replacement is allowed; the pending row records tenant, role, relationship role, actor, token hash, and expiry. |
| Acceptance/materialization | `supabase/migrations/20260827020000_contact_swap_promote_timeline_events.sql:190-423` | `accept_invitation_v2` is `SECURITY DEFINER`; it checks token/user identity, handles pending/accepted/expired states, derives the relationship mapping, upserts `public.users`, `tenant_users`, and `tenant_members`, archives the matching contact, and records timeline/audit evidence. |

## Reconciled capability rows

The two existing broad rows are still candidates, not approved grants:

| P1-m row | Current evidence-backed interpretation | Tenant scope | Relationship proof required | First server boundary | Named denial cases | Readiness / disposition |
|---|---|---|---|---|---|---|
| `admin.invites.manage` | A family of invitation operations, including contact promotion through `invite-user`; it is not equivalent to “any user may invite.” | Target tenant selected explicitly by `tenant_id`; no email/name/domain inference. | Authenticated principal; tenant-admin membership in `tenant_users` for client invites; internal-staff/super-admin path; role and relationship-role ceiling. | `invite-user` auth and tenant-membership checks at `:64-120,199-236`, then pending-invite write at `:613-681`. | Missing/invalid bearer; missing profile; non-member target tenant; disallowed `unicorn_role`; tenant-admin `primary_contact` mismatch; duplicate pending invite; capacity exceeded; invalid/expired/cancelled token at acceptance. | Remains `needs_product_input`, `candidate_not_approved`. Product/security must decompose invite, resend, cancel, and contact-promotion semantics before matrix entry. |
| `admin.tenant_users.manage` | The acceptance boundary materializes or updates tenant membership as a consequence of an accepted invitation; the broad manage row also covers unrelated membership flows and must not be narrowed to this one path. | Acceptance uses the invitation's explicit tenant; membership is keyed by `(tenant_id, user_id)`. | Invited identity must match the accepting auth identity; relationship mapping is sourced from the invitation column; target tenant comes from the pending invitation. | `accept_invitation_v2` identity/token checks at `:212-254`, then `tenant_users`/`tenant_members` upserts at `:328-343`. | Missing params; identity mismatch; invalid/expired token; already accepted; collision/relink path; retry/concurrent acceptance; any cross-tenant token use. | Remains `needs_product_input`, `candidate_not_approved`. TOM must define the membership/contact contract and RBAC must characterize the broader writer family before any authorization row is approved. |

`admin.team_users.manage` is not a TOM P1.1 row: the contact-promotion
boundary targets a client tenant and does not grant or mutate Vivacity team-user
membership. Existing team-user evidence stays in the full P1-m ledger.

## Cross-initiative decisions and open gates

1. The UI/Edge mismatch is real: `TenantContactsSection` offers
   `primary_contact`, while the tenant-admin branch of `invite-user` allows only
   `academy_user`, `secondary_contact`, and `user`. This is a product/security
   decision, not a safe client-side cleanup.
2. `relationship_role` is relationship/lifecycle input, not an RBAC capability.
   The legacy `parent`/`child`, `Admin`/`User`, and `access_scope` values are
   compatibility outputs of the acceptance mapping and must not be promoted to
   future defaults without an approved matrix row.
3. Client-side focused coverage exists in
   `src/test/client-identity/promote-contact.test.ts:26-60`, but no result is
   claimed here for direct Edge negative probes or concurrent acceptance. Those
   require the approved QA harness and security-owned server characterization.
4. The `SECURITY DEFINER` acceptance function, RLS/grants, invitation role
   ceiling, membership authority, and contact archival remain explicit change
   boundaries. This document authorizes none of them.

## Next sequencing

1. TOM/RBAC/security resolve the `primary_contact` tenant-admin question and
   confirm the compatibility mapping as current behavior.
2. Product decomposes `admin.invites.manage` and `admin.tenant_users.manage`
   into independently reviewable actions.
3. RBAC names positive and negative QA personas and traces the broader writer
   family, while TOM supplies tenant/resource relationship evidence.
4. Only after those gates may an approved row be copied into a versioned golden
   matrix or receive a separate implementation packet.

## Verification

This is documentation-only reconciliation data. Before review, run:

```text
node scripts/check-kb-links.mjs
node scripts/check-kb-doc-size.mjs
git diff --check
```

No runtime, database, hosted, credential, or production verification is
claimed by this document.
