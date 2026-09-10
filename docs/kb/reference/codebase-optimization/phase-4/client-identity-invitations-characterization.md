# P6.2 Client identity and invitations characterization

> **Status:** characterization evidence for Codebase Optimization Phase 4 P6 slice 2
>
> **Date:** 2026-09-10
>
> **Code baseline:** `origin/main@b63ea5fea`
>
> **Scope:** document the current capacity decision, invite/promote/swap commands,
> identity boundaries, role ceilings, pending-invite behavior, and contact
> projections before extracting a service seam. This packet authorizes no code,
> schema, RLS, RPC, production-data, email, or deployment change.
>
> **Parent plan:** [Codebase Optimization and KB Renewal Plan](../../codebase-optimization-plan-2026-08-28.md)
>
> **Program index:** [Program Index](../../program-index.md)
>
> **Dependencies:** [Tenant Operating Model plan](../../tenant-operating-model-data-architecture-plan-2026-09-02.md),
> [RBAC v6 plan](../../rbac-v6-authorization-implementation-plan-2026-09-01.md)

## Characterization result

The client-identity surface is not one command today. It is a set of browser
queries and mutations over `tenant_users`, `tenant_members`, `users`,
`tenant_contacts`, and `user_invitations`, plus trusted RPC/Edge contracts.
`ClientTenantContext` chooses the active client tenant and computes portal
capabilities, while `TenantUsersTab` and the client users page each retain
their own orchestration. The standard invite path creates a pending
`user_invitations` row and sends an email; membership rows are created on
acceptance, not at invite time. A separate `skip_email` path creates a public
profile and membership without an auth account (a ghost), and is therefore
not equivalent to a normal invitation.

The safe next extraction boundary is a characterization-backed adapter around
these existing contracts. It must preserve the current server-side ceilings,
single-primary/single-secondary rules, ghost-account fallback, and preview
read-only semantics. This document does not select a canonical membership
table or redesign the contracts; those are governed by the already-recorded
Tenant Operating Model/RBAC decisions and require their own implementation
packets.

## Evidence matrix

| Area | Current source | Observed behavior and invariant | Failure/fallback to preserve | Candidate seam (not authorized here) |
|---|---|---|---|---|
| Active identity: real client | `src/contexts/ClientTenantContext.tsx`; `src/components/client/ClientRouteGuard.tsx` | Normal mode prefers `users.tenant_id`. If absent, it queries `tenant_users`; exactly one row selects the tenant, zero rows leaves no tenant, and two or more rows deliberately refuse to choose. `tenantUser` is then loaded for the selected tenant. | Lookup error, no tenant, or ambiguous multi-tenant membership fails closed (`activeTenantId = null`), rather than silently selecting a client. Portal access requires full scope; primary and secondary contacts can manage portal users. | Identity/tenant-resolution read model with an explicit `ambiguous`/`unresolved` state. |
| Impersonation/preview identity | `src/contexts/ClientPreviewContext.tsx`; `src/contexts/ClientTenantContext.tsx` | Super Admin/Team Leader preview selects a tenant and an optional acting client user. Preview sets `isReadOnly`; acting-user role determines portal access and user-management capability. Preview state is audited, owner-bound, expiry-bounded for cross-tab handoff, and invalid acting IDs are cleared. | Staff are not treated as real client callers; client route guard redirects staff out of `/client/*`. A stale/different-owner handoff is discarded. | Separate preview identity object; never merge preview authorization with the real caller's tenant membership. |
| Capacity decision | `src/hooks/useUserCapacity.ts`; `supabase/functions/invite-user/index.ts` (`assertCapacity`) | Browser reads `get_tenant_user_capacity` and derives `used`, `limit`, `is_unlimited`, and `atLimit`. Client invite UI blocks at the displayed cap. The Edge function re-checks capacity server-side for non-staff/non-Super Admin callers and passes the caller UUID explicitly because its client uses the service-role key. Staff and Super Admin bypass the membership cap. | RPC failure returns `CAPACITY_CHECK_FAILED`; cap exhaustion returns `USER_LIMIT_REACHED` and attempts an audit row (audit failure is swallowed). Client UI is advisory; the Edge check is authoritative. `rpc_auto_assign_consultant` after tenant creation is fire-and-forget and is separate from user-seat capacity. | Pure capacity decision plus an invite command adapter; keep server re-check and explicit caller identity. |
| Client invite command | `src/components/client/users/useInviteMutations.ts`; `src/components/client/users/InviteUserDialog.tsx`; `supabase/functions/invite-user/index.ts` | Client portal offers only Academy (`academy_user`), Secondary contact (`Admin` + `secondary_contact`), or Full access (`User` + `user`). The dialog preflights active/pending duplicate email and secondary occupancy, then invokes `invite-user` with `invite_as: CLIENT`; the Edge revalidates caller tenant membership, allowed relationship roles, role/tenant match, email, rate limit, tenant existence, and slot uniqueness. | Active duplicate and pending duplicate are distinct UI messages. Edge returns structured codes (`INVITE_EXISTS`, `ROLE_NOT_ALLOWED`, `PRIMARY/SECONDARY_CONTACT_*`, `USER_LIMIT_REACHED`, etc.). Expired email invites are deleted before a replacement is inserted. | Typed invite command/result preserving Edge error codes and idempotent retry semantics. |
| Staff/admin invite command | `src/components/client/AdminInviteUserDialog.tsx`; `src/components/client/InviteUserDialog.tsx`; `src/pages/ManageUsers.tsx` | Internal staff may invite client users; only callers with `admin.team_users.manage` may invite Vivacity roles. Staff/admin dialogs also support broader Vivacity role options and Unicorn 1 import paths, which are separate from the client portal's three-level ceiling. `ManageUsers` role edits directly update `users.unicorn_role` after the existing account/permission checks. | Do not collapse staff role administration into the client invite vocabulary. The Edge rejects client roles on the Vivacity tenant and Vivacity roles on client tenants. | Separate staff invitation/admin adapter; do not widen client role options as part of a UI extraction. |
| Promote contact to user | `src/components/client/TenantContactsSection.tsx`; migrations defining `accept_invitation_v2` | A contact remains a `tenant_contacts` row until the person accepts. Promote invokes `invite-user` with `skip_email: false`, a selected relationship role, and a real email invitation. On acceptance, `accept_invitation_v2` matches `(tenant_id, lower(email))`, archives the active contact, and records `promoted_to_user_id`/`promoted_at`. | Promotion can fail for capacity, role/slot conflicts, Edge errors, or email delivery; no local contact archive is performed optimistically. A normal invitation that matches no contact has no contact side effect. | Promote command returning invitation state; acceptance/linking remains the authoritative boundary. |
| Role change and primary swap | `src/components/client/TenantUsersTab.tsx`; `src/lib/roles/relationshipRole.ts`; `set_relationship_role` RPC | Staff/client-admin user management derives canonical `relationship_role`, falling back to legacy booleans for unmigrated rows. Role changes call one transactional RPC that updates `tenant_users`, `users`, and `tenant_members`. Promoting a user to primary when another primary exists opens confirmation; the same RPC performs the atomic swap, avoiding a transient unique-secondary violation. | Unique violations are surfaced as a concurrency/refresh error. The UI excludes the current caller from role-edit controls. Keep the single-primary and single-secondary invariants server-side. | Relationship-role command with explicit old/new role and conflict result; no direct multi-table writes in an extracted page orchestrator. |
| Swap user to contact | `src/components/client/TenantUsersTab.tsx`; `src/components/client/ClientUsersPage.tsx`; `swap_tenant_user_to_contact` migration | Authorized parent, Super Admin, or Vivacity staff invokes the RPC. It reactivates an existing same-tenant, same-email contact or inserts a new active contact, then deletes the `tenant_users` row; `auth.users`/`public.users` survive. The only-admin-contact guard prevents locking the tenant out. | The RPC checks whether the target has an `auth.users` row before inserting `audit_eos_events`; ghost targets skip that audit insert instead of failing the otherwise valid swap (the operation remains atomic). Client UI invalidates capacity and refreshes contacts/users. | Swap command/result with explicit `ghost_audit_skipped`/contact identity outcome. |
| FK/identity failure fallback | `activate-ghost-user`; latest `accept_invitation_v2`/`swap_tenant_user_to_contact` migrations | A `skip_email` promotion can leave a public profile with no auth row. Staff-only `activate-ghost-user` creates the auth row using the existing UUID to preserve foreign keys and rejects an auth-email collision. Invitation acceptance binds the authenticated UUID, reconciles a pre-existing profile with the invitation email, then upserts membership. | `accept_invitation_v2` rejects an authenticated caller accepting for a different UUID (`IDENTITY_MISMATCH`), returns `INVALID_TOKEN`/`EXPIRED`/`ALREADY_ACCEPTED` as applicable, and maps unknown/internal role input through its explicit internal fallback. Never “repair” a missing auth FK by inventing a new user ID in the browser. | Identity-binding/activation result types and a mixed-batch test matrix (real auth user, ghost profile, conflicting auth email, wrong caller UUID). |
| Pending invitations | `src/hooks/use-client-tenant-users.ts`; `src/components/client/TenantUsersTab.tsx`; `src/components/client/users/useInviteMutations.ts`; `resend-invite`/`cancel-invite` Edge functions | Client portal reads `get_client_tenant_users`, which returns active and invited rows with relationship/access metadata. Staff tab separately queries pending, unexpired `user_invitations`. Invite UI blocks a duplicate pending email and pending secondary. Resend issues a fresh link; cancel revokes the invitation and invalidates users/capacity. | Expired rows are not treated as active pending state. Edge duplicate checks remain authoritative despite cached-row preflight. Pending primary/secondary occupancy is checked separately from active occupancy. | Unified invitation projection (active/pending/expired/revoked) with explicit freshness and action affordances. |
| Contact projection | `src/hooks/useTenantContacts.ts`; `src/pages/ManageTenants.tsx`; `src/components/client/TenantContactsSection.tsx` | Client contact list reads `tenant_contacts` directly and filters out rows with `promoted_to_user_id`. Manage Tenants builds a client-side projection by merging tenant basics, package, contact, CSC, and notes maps; `useTenantContacts` uses two query waves (`tenant_users` counts, then primary contact/state) and retries three times. Failed lookup queries are surfaced rather than rendered as legitimate empty values. | No FK/embed is assumed where the schema does not provide one. Existing archived contacts can be reactivated by swap; acceptance archives/links a matching active contact. | A read-only contact projection adapter with typed empty/loading/failed states; do not hide partial lookup failures. |
| Consultant assignment adjacent to identity | `src/hooks/useCscAssignments.ts`; `src/hooks/useTenantCSCAssignment.tsx`; `src/components/client/BulkReassignCscDialog.tsx`; `src/components/AddTenantDialog.tsx` | CSC assignment is a separate `tenant_csc_assignments`/RPC contract. Single assign/remove uses `admin_set_tenant_csc_assignment`/`admin_remove_tenant_csc_assignment`; bulk reassign computes displayed load/capacity and invokes `bulk-reassign-team-member`. New tenant creation invokes `rpc_auto_assign_consultant` after the core create/package/link sequence. | Auto-assignment failure is warning-only after tenant creation. Bulk assignment's displayed capacity is informative; it is not the client user-seat decision. | Keep CSC load/assignment out of the client identity command abstraction unless a later packet explicitly joins the contracts. |

## Required scenario characterization

### 1. Real client versus impersonation

- A real caller's tenant is resolved from their `users.tenant_id`, or from a
  single `tenant_users` row only when the profile has no tenant ID. An
  ambiguous multi-tenant fallback refuses to select a tenant.
- Preview/impersonation is a distinct state owned by the staff auth UUID. It
  selects a preview tenant and acting-user option, marks the client context
  read-only, and audits start/end events. It must not be used as evidence that
  a real client role can perform the same action.
- In normal client mode, a full-scope primary or secondary contact can manage
  portal users; a full-scope `user` can access the portal but cannot manage
  users; `academy_user` is academy-only. In preview mode the acting
  relationship role drives the same capability calculation.

### 2. FK failure and fallback behavior

- The known mixed identity is a public ghost profile (created by the
  `skip_email` path) with no matching `auth.users` row. `swap_tenant_user_to_contact`
  still completes the contact conversion and skips only the audit insert that
  would violate `audit_eos_events.user_id -> auth.users.id`.
- Staff can later activate a ghost through `activate-ghost-user`, which creates
  the auth row with the existing public UUID; an email collision is rejected.
- Invitation acceptance is an identity-binding RPC: a signed-in caller cannot
  accept for another UUID, and an existing profile with the invitation email is
  reconciled before membership upsert. These are failure-handling contracts,
  not permission to fabricate or relink an arbitrary account from the UI.

### 3. Role ceiling

- Client portal invite choices are intentionally three-level and map to four
  relationship values (`academy_user`, `secondary_contact`, `user`; primary is
  not offered as a new client self-service invite). The Edge function enforces
  that client callers may not assign Vivacity roles or unsupported relationship
  roles.
- Primary and secondary contacts are unique per tenant across active and
  unexpired pending invitations. Primary replacement is a confirmed,
  transactional `set_relationship_role` operation.
- Internal staff have a separate, broader Vivacity role path. This is not a
  reason to widen client portal options or to merge staff and client adapters.

### 4. Pending invite

- Pending rows are represented separately from active membership. The client
  users RPC projection includes both row types; the staff tab's direct query
  filters `status = 'pending'` and `expires_at > now()`.
- Cached-row checks improve UX, but `invite-user` repeats duplicate, slot,
  capacity, tenant, role, and rate-limit checks. `resend-invite` and
  `cancel-invite` are distinct commands; both refresh the users/capacity view.
- Standard invitation acceptance is the point at which membership and the
  matching promoted contact are finalized. Sending an invite does not itself
  archive a contact or create a seat-holder.

## Boundary and verification notes

- The first bounded Stage 2 command adapter is merged as PR #1123:
  `sendClientInvite` owns only the existing client `invite-user`
  invocation (input normalization, role mapping, active-tenant guard, and
  structured Edge error propagation). `resend`, `revoke`, `copyLink`, and
  `resetPassword` remain in the hook for later independently reviewed seams.
  The adapter makes no Edge, RPC, schema, or control-flow contract changes.
- The next bounded Stage 2 adapter is now implemented in the review branch:
  `resendClientInvite` owns only the existing `resend-invite` invocation and
  preserves its invitation-id payload, response, and structured Edge detail
  handling. `revoke`, `copyLink`, and `resetPassword` remain separate future
  seams; no invitation was resent during verification.
- The following bounded Stage 2 adapter is now implemented in the review
  branch: `revokeClientInvite` owns only the existing `cancel-invite`
  invocation and preserves its invitation-id/reason payload, response, and
  structured Edge detail handling. `copyLink` and `resetPassword` remain
  separate future seams; no invitation was revoked during verification.
- The contact-promotion command is now implemented in the review branch:
  `promoteContactViaInvite` owns the existing session guard and `invite-user`
  promotion invocation while preserving the real-email, role-ceiling,
  `skip_email: false`, and `job_title: null` contract. UI state, toasts,
  contact refresh, and capacity invalidation remain in the component; no
  contact was promoted during verification.
- Static source and migration review was completed from
  `origin/main@b63ea5fea`. The existing authenticated storage-state files were
  copied into the implementation worktree. The source PR's verification
  includes focused adapter/component tests, the full frontend and Edge suites,
  typecheck, build, and a mutex-wrapped authenticated read-only pass over
  `/client/users` and `/manage-invites`; no invitation, promotion, swap, or
  other write path was exercised.
- The later implementation packet must include role/capacity/RPC tests, the
  mixed real-user/ghost/FK matrix above, and a consolidated authenticated
  read-only Playwright pass over the real client users screen and the staff
  users/invitations screen. Any test that mutates a tenant, invitation, or
  contact requires a separately approved disposable fixture and cleanup plan.
- The extraction should be staged: (1) typed read/projection models and pure
  capacity/role mapping, (2) invite/promote/swap command adapters preserving
  current Edge/RPC contracts, (3) caller migration, (4) observation, then (5)
  retirement only after parity evidence. It must not decide the
  `tenant_members`/`tenant_users` migration or RBAC v6 policy in this slice.

