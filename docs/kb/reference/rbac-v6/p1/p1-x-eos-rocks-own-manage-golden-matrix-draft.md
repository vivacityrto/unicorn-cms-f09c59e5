# RBAC v6 — Packet P1-x: `eos.rocks.own.manage` golden-matrix (second vertical slice)

> **Parent plan:** [RBAC v6 Authorization Implementation and Gate-Streamlining Plan](../../rbac-v6-authorization-implementation-plan-2026-09-01.md) — §7 P1
> **Inputs:** [P1-e bundled-verb decomposition](p1-e-bundled-verb-decomposition.md), [P1-w eos.scorecard.manage golden-matrix draft](p1-w-eos-scorecard-golden-matrix-draft.md) (format and process precedent)
> **Program index:** [Program Index](../../program-index.md)
> **Status:** **confirmed 2026-09-15 (Carl)** — internal staff can create rocks (`eos.rocks.company.create`'s catalogue restriction retired, matching already-live behavior); `eos.rocks.own.manage` stays broad, matching `eos.scorecard.manage`'s precedent; archive/delete are wired up for real (previously dead code), with a children-guard on hard delete. This is now a golden row for R2-a.
> **Owner:** RBAC v6 with product/security approval
> **Evidence cutoff:** `origin/main` post-PR #1354 (`gate_upsert_rock_with_parenting_vivacity_team_only` merged) — this packet's evidence gathering is what found that gap; PR #1354 already closed the most severe part of it (see the linked audit entry)
> **Audit entry:** [2026-09-15 — Unauthenticated-scope write bypass in `upsert_rock_with_parenting`](../../../../audit-log/entries/2026-09-15-gate-upsert-rock-with-parenting-security-definer.md) (the security fix this packet's investigation produced) and [2026-09-15 — `eos.rocks.company.create` catalogue fix + wired-up archive/delete](../../../../audit-log/entries/2026-09-15-eos-rocks-company-create-and-archive-delete.md) (Carl's dispositions on the open findings below, implemented)

## Purpose and boundary

P1-e listed `eos.rocks.own.manage` as source-backed but flagged "own-resource
relationship and team/company distinction need child-hook tracing" as an open
item. This packet does that tracing, following the same format P1-w
established for `eos.scorecard.manage`. Unlike P1-w, the tracing did not
find a clean status quo on first pass — it found a real authorization bypass
(fixed same-day, PR #1354) and an unenforced boundary, both since dispositioned
by Carl (see "Review checklist and stop boundary" below), plus a real feature
gap (archive/delete existed only as dead code) that's now wired up.

This packet's own dispositions are now confirmed. It does not itself authorize
any further grant, role default, route change, or RLS/RPC/production action
beyond what PR #1354, the `role_permissions` catalogue update, and the
archive/delete feature already applied.

## Write-path inventory (the actual finding, not assumed from the label)

Unlike `eos.scorecard.manage`, which had one clean set of mutation hooks,
`eos_rocks` has **three independent, historically-unreconciled write
surfaces**. Tracing all three was necessary before any disposition could be
proposed:

| Write path | File | Mechanism | Live callers | Status |
| --- | --- | --- | --- | --- |
| `createRock` | `useEosRocksHierarchy.tsx` | Direct `.insert()`, RLS-bound | `CreateCompanyRockDialog`, `CreateTeamRockDialog`, `CreateIndividualRockDialog` | Live, RLS-protected |
| `updateRock` | `useEosRocksHierarchy.tsx` | Direct `.update()`, RLS-bound | **None found** | Dead code (unchanged — out of scope for this pass) |
| `archiveRock` | `useEosRocksHierarchy.tsx` | Direct `.update({archived_at})`, RLS-bound | `RockCard.tsx`'s actions menu | **Wired up 2026-09-15 (Carl's decision)** — now a live, reachable action |
| `deleteRock` | `useEosRocksHierarchy.tsx` | Direct `.delete()` (hard), RLS-bound, refuses to delete a rock with children | `RockCard.tsx`'s actions menu | **New, added 2026-09-15** — the old dead `deleteRock` in `useEos.tsx` was removed; this is its real replacement, matching `eos.scorecard.manage`'s `deleteMetric` guard against orphaning cascaded data |
| `updateRock` | `useEos.tsx` (`useEosRocks()`) | Direct `.update()`, RLS-bound | `RockProgressControl.tsx` (status-only changes) | Live, RLS-protected |
| `upsert_rock_with_parenting` (RPC) | `RockFormDialog.tsx` | `SECURITY DEFINER`, owned by `postgres` | The only "Edit Rock" path — every RockCard's Edit button opens this dialog | **Was a live authorization bypass; fixed same-day, PR #1354.** See the linked audit entry for full detail: zero internal auth check, RLS-bypassing (table owner exemption, no `FORCE ROW LEVEL SECURITY`), `EXECUTE` granted to `authenticated`. Now gated on `is_vivacity_team_safe()`. |

`useEos.tsx`'s `useEosRocks()` previously also exported a dead `createRock`
and `deleteRock` (zero call sites, confirmed via grep before removal) —
removed as part of this pass rather than left alongside the new real
`deleteRock`. P1-e's original candidate action list for this row inferred
"complete/archive" from the label without confirming a live caller existed
— a caution `p1-e` itself names as a risk ("do not infer a candidate action
from a row's label"); tracing it here found the inference was directionally
right but the actions weren't actually wired up yet.

## Candidate matrix for review

RLS on `eos_rocks` was checked directly, not inferred from the page component
(applying the lesson from the `eos_scorecard`/client-tenant gap found earlier
this session):

| Candidate action | Target and scope placeholder | First boundary to prove | Current evidence / readiness | Required negative cases | Decision owner |
| --- | --- | --- | --- | --- | --- |
| `view` | All rocks in Vivacity's own tenant (`6372`); a `userFilter === 'all'` mode shows every rock, not just the caller's own | `EosRocks.tsx`'s `useEosRocksHierarchy` query; `eos_rocks_select` RLS (`is_vivacity_team_user() OR is_super_admin() OR has_any_eos_role(...)`) | Route already gated by `canAccessEOS()`; RLS confirmed internal-only (`has_any_eos_role` is hardcoded `_tenant_id = 6372`, cannot leak to client tenants) — **source-backed and RLS-verified** | Client/disabled/expired principal (already excluded), route bypass | Product |
| `create` (own rock, individual/team level) | Any Vivacity internal user as owner — **not restricted to the caller** | `CreateIndividualRockDialog`/`CreateTeamRockDialog` → `createRock`; `eos_rocks_insert` RLS | `role_permissions` grants `eos.rocks.own.manage = full` to **every** internal role (BGT/CET/CSC/Integrator/Super Admin/Team Leader — no role has `none`) — **source-backed**, but see "own" naming finding below | Non-internal principal, disabled/expired principal | Product (confirm "own" in the name is aspirational, not enforced — see finding below) |
| `create` (company rock) | Company-wide, no owner restriction | `CreateCompanyRockDialog` → `createRock`; **same** `eos_rocks_insert` RLS as individual/team | **Confirmed 2026-09-15 (Carl): internal staff can create rocks, no restriction.** `role_permissions` updated so `eos.rocks.company.create = full` for every internal role, matching the UI/RLS's already-unrestricted behavior — the catalogue no longer claims an SA/TL-only restriction that was never enforced | Non-internal principal (excluded by RLS/route guard) | Confirmed — no further review needed |
| `edit` (any field, any rock level, via `RockFormDialog`) | Any rock in tenant `6372` | `upsert_rock_with_parenting` RPC | **Now gated** (`is_vivacity_team_safe()`, PR #1354) — but this is a broad internal-staff-wide gate, not scoped to the rock's owner or a role tier. Any Vivacity internal staff member can edit any other person's rock, including reassigning ownership and changing `rock_level` | Non-internal principal (now blocked), disabled/expired principal | Product (confirm whether edit should be broader-than-own, matching `eos.scorecard.manage`'s `record` disposition, or scoped tighter) |
| `edit` (status only) | Any rock, via `RockProgressControl` | `useEosRocks().updateRock`; `eos_rocks_update` RLS (`is_super_admin() OR owner_id=auth.uid() OR is_vivacity_team_user() OR has_any_eos_role(...)`) | Source-backed; RLS is broader than "own" here too — `is_vivacity_team_user()` alone satisfies it, independent of `owner_id` | Same as above | Product |
| `archive` (soft) | Any rock | `archiveRock` in `useEosRocksHierarchy.tsx`, wired into `RockCard.tsx`'s actions menu | **Confirmed 2026-09-15 (Carl): wire it up.** Now reachable via a confirmation dialog; same broad internal-staff RLS boundary as edit | Non-internal principal, disabled/expired principal | Confirmed — no further review needed |
| `delete` (hard) | Any rock, refused if it has children | New `deleteRock` mutation in `useEosRocksHierarchy.tsx` (the old dead one in `useEos.tsx` removed), wired into `RockCard.tsx`'s actions menu | **Confirmed 2026-09-15 (Carl): wire it up.** Now reachable via a confirmation dialog; refuses to delete a rock with children (matching `eos.scorecard.manage`'s `deleteMetric` guard), same broad internal-staff RLS boundary as edit | Non-internal principal, disabled/expired principal, delete attempt on a rock with children (blocked by app logic, not yet independently confirmed at the RLS layer) | Confirmed — no further review needed |
| `view cascade` | Full company→team→individual hierarchy | `RockCascadeView.tsx`; same SELECT RLS as `view` | Same evidence as `view` | Same as `view` | Product |

## Scope and relationship placeholders

1. subject profile: any internal `unicorn_role` value gets `eos.rocks.own.manage = full` today — there is no internal role this excludes;
2. tenant/resource relationship: fixed to Vivacity's own tenant (`6372`), confirmed via `has_any_eos_role`'s hardcoded tenant check — no cross-tenant relationship to resolve;
3. **owner relationship — confirmed 2026-09-15 (Carl): stays broad.** The row's name says "own," but no current code path restricts rock creation, editing, or the RockFormDialog's owner-reassignment field to the caller's own identity — "own" describes the *typical* use case (a staff member creates their own individual rock), not an enforced boundary, and Carl confirmed it should stay that way (matching `eos.scorecard.manage`'s precedent) rather than becoming a real enforced scope.
4. action-specific target resolver: rock ID plus `tenant_id` match (present in `upsert_rock_with_parenting` post-fix; present in RLS for direct-table paths);
5. effective RLS/RPC boundary: direct-table paths (`createRock`/`updateRock` in both hooks) were already RLS-bound and unaffected by this packet's finding; the RPC path (`upsert_rock_with_parenting`) was the one with the real gap, now closed (PR #1354);
6. review owner, expiry, observation artifact, rollback owner: **Carl as review owner and final sign-off; 30 days (2026-10-15); RBAC v6 (Claude) as rollback owner** — see "Review checklist and stop boundary" below.

## Findings that affect disposition (the substance of this packet)

### 1. `eos.rocks.company.create`'s SA/Team-Leader-only restriction had no enforcement point (resolved — catalogue updated to match reality)

`role_permissions` granted `eos.rocks.company.create = full` only to Super
Admin and Team Leader (every other internal role: `none`) at the time this
was found. But:

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

This was a real `needs_enforcement_inventory` gap, not a documentation nuance:
the permission catalogue recorded an SA/TL-only restriction that never
actually existed in either the UI or the database layer. **Resolved 2026-09-15
(Carl): internal staff can create rocks** — the catalogue was updated
(`role_permissions.eos.rocks.company.create = full` for every internal role)
to match the already-live unrestricted behavior, rather than adding new
enforcement to match the old, narrower catalogue row. See the
[audit entry](../../../../audit-log/entries/2026-09-15-eos-rocks-company-create-and-archive-delete.md).

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

### 3. `RockFormDialog` lets any internal staff member change any rock's scope, owner, and tenant-linked client (confirmed intended)

Because `upsert_rock_with_parenting` (now gated staff-wide, not owner- or
role-scoped) is the only edit path, and its form UI exposes `rockLevel`
(company/team/individual), `ownerId` (any Vivacity user), and `clientId` (any
tenant) as freely-editable fields with no additional confirmation step, any
internal staff member editing any rock can reassign its scope, owner, and
client link. **Confirmed 2026-09-15 (Carl): intended**, matching
`eos.scorecard.manage`'s precedent of broad internal-team edit rights — no
narrowing needed.

## Required synthetic review cases

| Persona/state | Allow case | Deny/negative cases |
| --- | --- | --- |
| Super Admin | Every action in the candidate matrix | Disabled/archived principal |
| Team Leader | Every action (including company-rock create, per current `role_permissions`) | Nothing beyond the standard disabled/expired-principal case |
| BGT / CET / CSC / Integrator | `view`, `view cascade`, own/team/individual/company rock `create`, `edit`, `archive`, `delete` (any rock, per confirmed broad internal-staff policy) | Non-internal principal |
| Client Admin/User (any role) | None — `has_any_eos_role` cannot match a client tenant | Every action; route reachability itself should already fail via `eos:access` |
| Disabled/archived/expired principal | None | All reads/writes, cached request, replay, route bypass (now also covers the RPC path via `is_vivacity_team_safe()`) |

## Review checklist and stop boundary

**Confirmed 2026-09-15 (Carl):**

- **`eos.rocks.company.create`'s SA/Team-Leader-only restriction: retired.**
  Internal staff can create rocks, no restriction — this matches the
  already-live behavior (neither the UI nor RLS ever actually enforced the
  narrower catalogue row). `role_permissions` updated to `full` for BGT/CET/
  CSC/Integrator, matching Super Admin/Team Leader. See
  [audit entry](../../../../audit-log/entries/2026-09-15-eos-rocks-company-create-and-archive-delete.md).
- **"Own" in `eos.rocks.own.manage`: stays broad**, matching
  `eos.scorecard.manage`'s precedent for its analogous `record` action. No
  further scope narrowing on `upsert_rock_with_parenting` beyond PR #1354's
  staff-only gate.
- **`archiveRock`/`deleteRock`: wired up for real**, not removed. Both are
  now reachable from `RockCard.tsx`'s actions menu with confirmation
  dialogs. Hard delete refuses to delete a rock with children, matching
  `eos.scorecard.manage`'s `deleteMetric` guard — archive is the path for a
  rock still linked to child rocks. Authorization for both uses the same
  broad internal-staff boundary as edit (`eos_rocks_delete`/`_update` RLS),
  consistent with the "keep it broad" disposition above.
- **Review owner, expiry, rollback owner: Carl as review owner and final
  sign-off; 30 days (2026-10-15)**, matching this session's other RBAC v6
  gate expiries; RBAC v6 (Claude) as rollback owner for the catalogue change
  (revert the `role_permissions` update) and the archive/delete UI
  (revertible via normal code rollback, no data-loss risk since delete
  itself is guarded and archive is soft).

## Verification

Migration (`grant_eos_rocks_company_create_all_internal_roles`) and the
archive/delete feature (`useEosRocksHierarchy.tsx`, `RockCard.tsx`,
`EosRocks.tsx`, `useEos.tsx`) are code changes, not documentation-only like
the rest of this packet — see their own PR for
`npm run typecheck`/`lint:ratchet`/`test:frontend` results. For this
document itself: run `node scripts/check-kb-links.mjs`,
`node scripts/check-kb-doc-size.mjs`, and `git diff --check` before review.
