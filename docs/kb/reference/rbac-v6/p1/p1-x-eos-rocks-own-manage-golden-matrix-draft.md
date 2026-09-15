# RBAC v6 — Packet P1-x: `eos.rocks.own.manage` golden-matrix draft (second vertical slice, candidate)

> **Parent plan:** [RBAC v6 Authorization Implementation and Gate-Streamlining Plan](../../rbac-v6-authorization-implementation-plan-2026-09-01.md) — §7 P1
> **Inputs:** [P1-e bundled-verb decomposition](p1-e-bundled-verb-decomposition.md), [P1-w eos.scorecard.manage golden-matrix draft](p1-w-eos-scorecard-golden-matrix-draft.md) (format and process precedent)
> **Program index:** [Program Index](../../program-index.md)
> **Status:** draft, not yet reviewed — this packet proposes `eos.rocks.own.manage` as R2-a's second bounded vertical slice, following the same process `eos.scorecard.manage` (P1-w) used. Unlike P1-w, this draft surfaces real open findings rather than a clean status-quo confirmation — see "Findings that affect disposition" below.
> **Owner:** RBAC v6 with product/security approval
> **Evidence cutoff:** `origin/main` post-PR #1354 (`gate_upsert_rock_with_parenting_vivacity_team_only` merged) — this packet's evidence gathering is what found that gap; PR #1354 already closed the most severe part of it (see the linked audit entry)
> **Audit entry:** [2026-09-15 — Unauthenticated-scope write bypass in `upsert_rock_with_parenting`](../../../../audit-log/entries/2026-09-15-gate-upsert-rock-with-parenting-security-definer.md) — the security fix this packet's investigation produced. This packet itself is documentation/analysis only; no further schema/RLS/RPC change is proposed here.

## Purpose and boundary

P1-e listed `eos.rocks.own.manage` as source-backed but flagged "own-resource
relationship and team/company distinction need child-hook tracing" as an open
item. This packet does that tracing, following the same format P1-w
established for `eos.scorecard.manage`. Unlike P1-w, the tracing did not
confirm a clean status quo — it found a real authorization bypass (now fixed,
PR #1354) and at least one unenforced boundary that still needs a product
decision before this can become a golden row.

This is a draft, not the golden access matrix: a row remains out of policy
until product/security confirms the action, scope, and delegability. It does
not authorize any grant, role default, route change, or further RLS/RPC/
production action beyond what PR #1354 already applied.

## Write-path inventory (the actual finding, not assumed from the label)

Unlike `eos.scorecard.manage`, which had one clean set of mutation hooks,
`eos_rocks` has **three independent, historically-unreconciled write
surfaces**. Tracing all three was necessary before any disposition could be
proposed:

| Write path | File | Mechanism | Live callers | Status |
| --- | --- | --- | --- | --- |
| `createRock` | `useEosRocksHierarchy.tsx` | Direct `.insert()`, RLS-bound | `CreateCompanyRockDialog`, `CreateTeamRockDialog`, `CreateIndividualRockDialog` | Live, RLS-protected |
| `updateRock` | `useEosRocksHierarchy.tsx` | Direct `.update()`, RLS-bound | **None found** | Dead code |
| `archiveRock` | `useEosRocksHierarchy.tsx` | Direct `.update({archived_at})`, RLS-bound | **None found** | Dead code |
| `createRock` | `useEos.tsx` (`useEosRocks()`) | Direct `.insert()`, RLS-bound | None found (superseded by the hierarchy hook's version) | Dead code |
| `updateRock` | `useEos.tsx` (`useEosRocks()`) | Direct `.update()`, RLS-bound | `RockProgressControl.tsx` (status-only changes) | Live, RLS-protected |
| `deleteRock` | `useEos.tsx` (`useEosRocks()`) | Direct `.delete()` (hard), RLS-bound | **None found** | Dead code |
| `upsert_rock_with_parenting` (RPC) | `RockFormDialog.tsx` | `SECURITY DEFINER`, owned by `postgres` | The only "Edit Rock" path — every RockCard's Edit button opens this dialog | **Was a live authorization bypass; fixed same-day, PR #1354.** See the linked audit entry for full detail: zero internal auth check, RLS-bypassing (table owner exemption, no `FORCE ROW LEVEL SECURITY`), `EXECUTE` granted to `authenticated`. Now gated on `is_vivacity_team_safe()`. |

No hard-delete UI is currently reachable for rocks at all — `archiveRock` (soft)
and `deleteRock` (hard) both exist at the code layer but have zero call sites.
This contradicts P1-e's original candidate action list for this row
("complete/archive"), which was inferred from the label rather than traced —
a caution `p1-e` itself names as a risk ("do not infer a candidate action from
a row's label").

## Candidate matrix for review

RLS on `eos_rocks` was checked directly, not inferred from the page component
(applying the lesson from the `eos_scorecard`/client-tenant gap found earlier
this session):

| Candidate action | Target and scope placeholder | First boundary to prove | Current evidence / readiness | Required negative cases | Decision owner |
| --- | --- | --- | --- | --- | --- |
| `view` | All rocks in Vivacity's own tenant (`6372`); a `userFilter === 'all'` mode shows every rock, not just the caller's own | `EosRocks.tsx`'s `useEosRocksHierarchy` query; `eos_rocks_select` RLS (`is_vivacity_team_user() OR is_super_admin() OR has_any_eos_role(...)`) | Route already gated by `canAccessEOS()`; RLS confirmed internal-only (`has_any_eos_role` is hardcoded `_tenant_id = 6372`, cannot leak to client tenants) — **source-backed and RLS-verified** | Client/disabled/expired principal (already excluded), route bypass | Product |
| `create` (own rock, individual/team level) | Any Vivacity internal user as owner — **not restricted to the caller** | `CreateIndividualRockDialog`/`CreateTeamRockDialog` → `createRock`; `eos_rocks_insert` RLS | `role_permissions` grants `eos.rocks.own.manage = full` to **every** internal role (BGT/CET/CSC/Integrator/Super Admin/Team Leader — no role has `none`) — **source-backed**, but see "own" naming finding below | Non-internal principal, disabled/expired principal | Product (confirm "own" in the name is aspirational, not enforced — see finding below) |
| `create` (company rock) | Company-wide, no owner restriction | `CreateCompanyRockDialog` → `createRock`; **same** `eos_rocks_insert` RLS as individual/team | `role_permissions` grants `eos.rocks.company.create = full` only to Super Admin/Team Leader; **but the RLS INSERT policy and the UI dropdown gate do not check `rock_level` at all** — see "Findings that affect disposition" below. **`needs_enforcement_inventory`**: the intended SA/TL-only restriction has no enforcement point today | Non-SA/TL Vivacity role attempting company-rock create (currently **not blocked**) | Product + security (this is the actual open item) |
| `edit` (any field, any rock level, via `RockFormDialog`) | Any rock in tenant `6372` | `upsert_rock_with_parenting` RPC | **Now gated** (`is_vivacity_team_safe()`, PR #1354) — but this is a broad internal-staff-wide gate, not scoped to the rock's owner or a role tier. Any Vivacity internal staff member can edit any other person's rock, including reassigning ownership and changing `rock_level` | Non-internal principal (now blocked), disabled/expired principal | Product (confirm whether edit should be broader-than-own, matching `eos.scorecard.manage`'s `record` disposition, or scoped tighter) |
| `edit` (status only) | Any rock, via `RockProgressControl` | `useEosRocks().updateRock`; `eos_rocks_update` RLS (`is_super_admin() OR owner_id=auth.uid() OR is_vivacity_team_user() OR has_any_eos_role(...)`) | Source-backed; RLS is broader than "own" here too — `is_vivacity_team_user()` alone satisfies it, independent of `owner_id` | Same as above | Product |
| `archive` (soft) | Any rock | `archiveRock` in `useEosRocksHierarchy.tsx` | **Defined, zero call sites** — dead code, not a live action | N/A until reachable | Product (decide: wire it up, or remove it) |
| `delete` (hard) | Any rock | `deleteRock` in `useEos.tsx` | **Defined, zero call sites** — dead code, not a live action | N/A until reachable | Product (decide: wire it up, or remove it) |
| `view cascade` | Full company→team→individual hierarchy | `RockCascadeView.tsx`; same SELECT RLS as `view` | Same evidence as `view` | Same as `view` | Product |

## Scope and relationship placeholders

1. subject profile: any internal `unicorn_role` value gets `eos.rocks.own.manage = full` today — there is no internal role this excludes;
2. tenant/resource relationship: fixed to Vivacity's own tenant (`6372`), confirmed via `has_any_eos_role`'s hardcoded tenant check — no cross-tenant relationship to resolve;
3. **owner relationship — the actual open question**: the row's name says "own," but no current code path restricts rock creation, editing, or the RockFormDialog's owner-reassignment field to the caller's own identity. "Own" appears to describe the *typical* use case (a staff member creates their own individual rock), not an enforced boundary. This needs an explicit product decision: is "own" aspirational/typical, or does it need to become a real enforced scope (e.g., only edit rocks you own or lead, unless Team-Leader/Super-Admin tier)?
4. action-specific target resolver: rock ID plus `tenant_id` match (present in `upsert_rock_with_parenting` post-fix; present in RLS for direct-table paths);
5. effective RLS/RPC boundary: direct-table paths (`createRock`/`updateRock` in both hooks) were already RLS-bound and unaffected by this packet's finding; the RPC path (`upsert_rock_with_parenting`) was the one with the real gap, now closed (PR #1354);
6. review owner, expiry, observation artifact, rollback owner: not yet named — pending product input on the "own" question above, since the golden row can't be finalized while that's open.

## Findings that affect disposition (the substance of this packet)

### 1. `eos.rocks.company.create`'s SA/Team-Leader-only restriction has no enforcement point

`role_permissions` grants `eos.rocks.company.create = full` only to Super
Admin and Team Leader (every other internal role: `none`). But:

- The UI gate in `EosRocks.tsx` is `canCreateRocks = canCreateCompanyRock ||
  canManageOwnRocks` — a single combined boolean that only disables the
  top-level "Add Rock" button. It does **not** gate the "Company Rock" item
  inside that button's dropdown menu specifically. Since every internal role
  has `eos.rocks.own.manage = full`, `canCreateRocks()` is `true` for every
  internal staff member, and any of them can open `CreateCompanyRockDialog`.
- `eos_rocks_insert` RLS is `is_super_admin() OR (is_vivacity_team_user(...)
  AND (workspace_id IS NULL OR workspace_id = get_vivacity_workspace_id()))
  OR has_any_eos_role(...)` — this does **not** inspect `rock_level` at all.
  A CSC or BGT user (both `eos.rocks.company.create = none`) can insert a
  `rock_level = 'company'` row today and RLS will not stop it.

This is a real `needs_enforcement_inventory` gap, not a documentation nuance:
the permission catalogue records an SA/TL-only restriction that does not
actually exist in either the UI or the database layer. Flagging for product/
security decision: either narrow the UI dropdown + add a `rock_level` check
to RLS (and to `upsert_rock_with_parenting`, which also doesn't check it), or
change the catalogue to reflect that company-rock creation is not currently
role-restricted.

### 2. The permission-tooltip vocabulary doesn't match the actual gate

`EosRocks.tsx`'s "Add Rock" button is wrapped in `<PermissionTooltip
permission="rocks:create" ...>`, which checks `hasPermission('rocks:create')`
from the **legacy** `useRBAC()` hook (a separate, older, hardcoded-string
permission system) — not `usePermission('eos.rocks.own.manage')`/
`usePermission('eos.rocks.company.create')`, the feature-key system that
actually disables the button. These two systems can disagree, producing a
tooltip that doesn't match the button's real disabled state. This is a UI/UX
consistency finding, not a security gap (the button's actual `disabled` prop
uses the correct new-system check) — flagged for whoever eventually
consolidates the legacy `useRBAC()` vocabulary into the v6 capability system
(out of scope for this packet).

### 3. `RockFormDialog` lets any internal staff member change any rock's scope, owner, and tenant-linked client

Because `upsert_rock_with_parenting` (now gated staff-wide, not owner- or
role-scoped) is the only edit path, and its form UI exposes `rockLevel`
(company/team/individual), `ownerId` (any Vivacity user), and `clientId` (any
tenant) as freely-editable fields with no additional confirmation step, any
internal staff member editing any rock can currently reassign its scope,
owner, and client link. Whether this is intended (matching `eos.scorecard
.manage`'s precedent of broad internal-team edit rights) or should be
narrowed is the same open product question as item 3 in "Scope and
relationship placeholders" above.

## Required synthetic review cases

| Persona/state | Allow case | Deny/negative cases |
| --- | --- | --- |
| Super Admin | Every action in the candidate matrix | Disabled/archived principal |
| Team Leader | Every action (including company-rock create, per current `role_permissions`) | Nothing beyond the standard disabled/expired-principal case |
| BGT / CET / CSC / Integrator | `view`, `view cascade`, own/team/individual rock `create`, `edit` (any rock, per current broad RLS/RPC gate) | Company-rock `create` **per the permission catalogue** (currently not actually enforced — see Finding 1) |
| Client Admin/User (any role) | None — `has_any_eos_role` cannot match a client tenant | Every action; route reachability itself should already fail via `eos:access` |
| Disabled/archived/expired principal | None | All reads/writes, cached request, replay, route bypass (now also covers the RPC path via `is_vivacity_team_safe()`) |

## Review checklist and stop boundary (not yet confirmed — unlike P1-w, this is not ready to become a golden row)

Product/security must decide before this becomes a golden row:

- **`eos.rocks.company.create`'s SA/Team-Leader-only restriction**: enforce it
  (UI dropdown item gate + RLS/RPC `rock_level` check), or retire the
  restriction from the catalogue to match current unrestricted behavior. No
  disposition is proposed here — this is a real fork, not a status-quo
  confirmation like P1-w's rows were.
- **"Own" in `eos.rocks.own.manage`**: decide whether this should become a
  real enforced boundary (only edit rocks you own, unless Team-Leader/Super-
  Admin tier) or stay as broad internal-team edit rights (matching
  `eos.scorecard.manage`'s already-approved disposition for its analogous
  `record` action). This determines whether `upsert_rock_with_parenting`
  needs a further scope narrowing beyond PR #1354's staff-only gate.
  Dead-code rewire-or-remove — `archiveRock`/`deleteRock`: has no live
  caller today; decide whether a real archive/delete UI should be built
  (and which role tier should get it) or whether these should be removed as
  unreachable dead code (Codebase Optimization's existing reachability-
  triage precedent would remove them).
- **Review owner, expiry, rollback owner**: not proposed here, pending the
  two decisions above — unlike P1-w, this packet's dispositions are not
  status-quo-matching recommendations ready for a one-line confirm.

## Verification

Documentation-only packet, except for the security fix it produced (already
verified and merged separately — see PR #1354 and its audit entry). Run
`node scripts/check-kb-links.mjs`, `node scripts/check-kb-doc-size.mjs`, and
`git diff --check` before review. No further frontend, Edge, database,
authorization, credential, hosted-QA, or live verification is applicable to
this packet itself.
