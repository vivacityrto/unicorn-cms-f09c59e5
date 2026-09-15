# RBAC v6 — Packet P1-z: `admin.permissions.manage` golden-matrix draft (fourth vertical slice)

> **Parent plan:** [RBAC v6 Authorization Implementation and Gate-Streamlining Plan](../../rbac-v6-authorization-implementation-plan-2026-09-01.md) — §7 P1
> **Inputs:** [P1-e bundled-verb decomposition](p1-e-bundled-verb-decomposition.md) (Carl already decided this row is "**Hard-Super-Admin-locked, no exceptions**" and confirmed global scope on 2026-09-15), [P1-w](p1-w-eos-scorecard-golden-matrix-draft.md)/[P1-x](p1-x-eos-rocks-own-manage-golden-matrix-draft.md)/[P1-y](p1-y-eos-configurations-manage-golden-matrix-draft.md) (format precedent)
> **Program index:** [Program Index](../../program-index.md)
> **Status:** draft, pending Carl's confirmation — proposed disposition below matches an already-recorded decision and already-shipped behavior; no code change is anticipated regardless of outcome
> **Owner:** RBAC v6 with product/security approval
> **Evidence cutoff:** live `pg_policies`/`role_permissions`/Edge Function source queried fresh 2026-09-15
> **Audit entry:** none needed — analysis/documentation only; no authorization, schema, credential, hosted QA, or production action

## Purpose and boundary

This row governs the permission catalogue itself (`role_permissions`) — the
table that every other RBAC v6 golden row's enforcement ultimately depends
on. Carl already decided its delegability question in P1-e ("Hard-Super-
Admin-locked, no exceptions") and its tenant/resource semantics ("global,
confirmed both via `update-role-permission` (zero tenant/client references)
and the `role_permissions` table schema (no `tenant_id` column at all)").
This packet drafts the golden-matrix candidate rows to formalize that
already-made decision, rather than opening a new question — it's the same
shape as P1-w's confirmation ("this packet formally sanctions the status quo
rather than triggering an implementation").

Directly relevant context: this row's core enforcement function
(`check_permission`, called by `update-role-permission` via `requireCaller`)
was itself the subject of a same-day security fix — see [2026-09-15 audit
entry](../../../../audit-log/entries/2026-09-15-gate-permission-core-on-disabled-and-archived.md)
— which closed a real gap where a disabled Super Admin's still-valid session
would have retained this row's own `full` access. That fix is already live;
this packet's evidence below reflects the post-fix state.

This is a draft, not the golden access matrix: a row remains out of policy
until product/security confirms the action, scope, and delegability. It does
not authorize any grant, role default, route change, RLS/RPC change, or
production action.

## Readiness vocabulary

Reused unchanged from P1-w/P1-x/P1-y:

| State | Meaning in this draft |
| --- | --- |
| `needs_enforcement_inventory` | A source or route entry exists, but the trusted server boundary or effective RLS is not yet fully reconciled. |
| `needs_product_input` | The current behavior bundles distinct actions or does not establish the intended target/scope. |
| `needs_security_review` | The action is destructive, publish-like, or otherwise high-blast-radius. |
| `implementation_ready` | Approved policy, direct positive/negative boundary evidence, rollback, and named observation gates all exist. Not used in this draft. |

## Fresh verification performed 2026-09-15

- **RLS on `role_permissions`**: `SELECT` allows any `is_vivacity_team_safe()` staff member (`role_permissions_select_staff`); `INSERT`/`UPDATE`/`DELETE` all require `is_super_admin_safe()` — confirmed via live `pg_policies`, not assumed. Two INSERT policies and two DELETE policies exist with byte-identical `is_super_admin_safe()` conditions (`role_permissions_insert_super_admin` / `role_permissions_restrict_writes_superadmin`, and the DELETE equivalent) — functionally redundant, not a security gap (permissive policies for the same command are OR'd, and both require the same check), but a documentation/cleanup candidate flagged below.
- **`role_permissions` for `admin.permissions.manage` itself**: only `Super Admin` is `full`; `BGT`, `CET`, `CSC`, `Integrator`, `Team Leader`, `Team Member` are all `none` — matches Carl's already-recorded decision exactly.
- **Write path**: `update-role-permission` Edge Function uses `requireCaller` with `featureKey: FeatureKeys.adminPermissions`, which calls `check_permission(caller, 'admin.permissions.manage', 'full')` (default `minLevel: 'full'`) — the same function fixed earlier today for the disabled-account gap. The function additionally hard-guards against restricting `Super Admin` itself (`new_permission !== 'full'` for `role === 'Super Admin'` is rejected), validates `role` against `dd_unicorn_roles.is_active`, and validates `feature_key` against `permission_features` — no unvalidated input reaches the table.
- **Tenant/resource scope**: `role_permissions` has no `tenant_id` column at all (confirmed via schema, not inferred) — genuinely global, no per-tenant semantics are possible.

## Candidate matrix for review

| Candidate action | Target and scope placeholder | First boundary to prove | Current evidence / readiness | Required negative cases | Decision owner |
| --- | --- | --- | --- | --- | --- |
| `inspect` (view roles/grants) | Global — the entire `role_permissions` catalogue, no per-tenant target | `role_permissions_select_staff` RLS | Any `is_vivacity_team_safe()` internal staff member can read the full catalogue — **source-backed, intentional**: seeing what's granted is not itself sensitive, and several frontend surfaces (permission-gated UI, admin tooling) need to read this table broadly | Client/disabled/expired principal (already excluded by `is_vivacity_team_safe`), route bypass | Product (confirm broad-staff view is intended, matching the pattern already confirmed for `eos.scorecard.manage`/`eos.configurations.manage`) |
| `edit` (change a role's permission level for a feature) | Global | `update-role-permission` Edge Function; `role_permissions_update_super_admin`/`role_permissions_restrict_update_superadmin` RLS | **Hard-Super-Admin-locked, no exceptions (Carl, 2026-09-15)** — matches current `role_permissions`/RLS exactly; Edge Function additionally hard-guards against ever restricting Super Admin itself | Non-SA staff attempting edit, disabled/expired Super Admin (fixed same-day — see linked audit entry) | Already decided (Carl, P1-e) |
| `create`/`revoke` grant (insert/delete a `role_permissions` row) | Global | Same RLS as `edit` | Same evidence as `edit` — no separate Edge Function found for insert/delete distinct from update; `update-role-permission` appears to be the sole write surface (upsert-shaped: any `feature_key`/`role` pair not yet present would need its own row, but the table is seeded with all combinations already, so this is effectively always an update in practice) | Same as `edit` | Already decided (Carl, P1-e) |
| `manage_access` defaults / `break_glass`/`audit` control | Global | Not source-backed — no distinct handler or table found for "role defaults" or a break-glass audit path separate from ordinary `role_permissions` writes | **`needs_enforcement_inventory`** — P1-e's own candidate-action-vocabulary language for this row names these as provisional families, but no live implementation exists to trace. Do not infer a capability from the label | N/A — no live path to test | Product (note only — this action family isn't built; nothing to authorize) |

## Scope and relationship placeholders

Collapses the same way P1-w's/P1-y's did — no cross-tenant relationship to
resolve, and no delegability question left open (already decided):

1. subject profile: `Super Admin` only for any write action; any internal
   `unicorn_role` for read — no client or machine principal is in scope;
2. tenant/resource relationship: none — `role_permissions` has no
   `tenant_id` column, confirmed via schema;
3. action-specific target resolver: a `(feature_key, role)` pair — no
   cross-tenant target ever exists;
4. effective RLS/RPC boundary: already correct today, and its underlying
   `check_permission`/`is_super_admin_safe` primitives were hardened
   same-day (disabled-account fix, see linked audit entry) — this draft's
   job is confirming the row is ready to go golden, not fixing a leak;
5. review owner, expiry, observation artifact, rollback owner: proposed
   below, matching P1-w's/P1-x's/P1-y's precedent.

## Required synthetic review cases

| Persona/state | Allow case | Deny/negative cases |
| --- | --- | --- |
| Super Admin (active) | `inspect`, `edit`, `create`/`revoke` grant | Disabled/archived principal (fixed same-day — now correctly denied) |
| Any other internal role (BGT/CET/CSC/Integrator/Team Leader/Team Member) | `inspect` only | `edit`/`create`/`revoke` — all `none` per current `role_permissions` |
| Client Admin/User (any role) | None | Every action; `is_vivacity_team_safe()`/`is_super_admin_safe()` both exclude client principals entirely |
| Disabled/archived/expired principal | None | All reads/writes, cached request, replay, route bypass |

## Review checklist and stop boundary

Product review must explicitly confirm before this becomes a golden row.
Every disposition below restates an already-made Carl decision (P1-e,
2026-09-15) rather than proposing something new:

- **`inspect` scope — proposed: keep broad across all Vivacity Team
  roles**, matching the already-confirmed precedent for
  `eos.scorecard.manage`/`eos.configurations.manage`.
- **`edit`/`create`/`revoke` — proposed: Super Admin-only, no exceptions**,
  restating the P1-e decision verbatim. Source-backed via `role_permissions`,
  RLS, and the Edge Function's own hard guard against restricting Super
  Admin itself.
- **`manage_access`/`break_glass` action families — proposed: no action
  needed**, since no live implementation exists to authorize.
- **Duplicate INSERT/DELETE RLS policies — proposed: flag as a cleanup
  candidate, not a security fix.** `role_permissions_insert_super_admin`/
  `role_permissions_restrict_writes_superadmin` (and the DELETE
  equivalent) are functionally redundant, byte-identical conditions from
  two different migrations. Consolidating to one policy per command is a
  tidiness improvement with zero behavior change — not done in this
  packet, flagged for whoever next touches this table's RLS.
- **Review owner, expiry, rollback owner — proposed: Carl as review owner
  and final sign-off; 30 days (2026-10-15), matching P1-w/P1-x/P1-y; RBAC v6
  (Claude) as rollback owner** — no runtime change is implied by
  confirmation, so rollback here means reverting this doc, not a
  production action.

## Verification

Documentation-only packet. Run `node scripts/check-kb-links.mjs`,
`node scripts/check-kb-doc-size.mjs`, and `git diff --check` before review.
Frontend, Edge, database, authorization, credential, hosted-QA, and live
verification are not applicable — no runtime source changed in this packet
(the underlying `check_permission`/`is_super_admin_safe` hardening was a
separate, already-merged fix). The RLS/role_permissions/Edge-source evidence
above was gathered live via Supabase MCP `execute_sql` and direct file
reads, not assumed from documentation.
