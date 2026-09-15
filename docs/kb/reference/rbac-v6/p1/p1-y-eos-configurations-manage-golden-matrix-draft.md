# RBAC v6 — Packet P1-y: `eos.configurations.manage` golden-matrix draft (third vertical slice)

> **Parent plan:** [RBAC v6 Authorization Implementation and Gate-Streamlining Plan](../../rbac-v6-authorization-implementation-plan-2026-09-01.md) — §7 P1
> **Inputs:** [P1-e bundled-verb decomposition](p1-e-bundled-verb-decomposition.md) (this row was already flagged there as "genuinely safe already, left unchanged"), [P1-w](p1-w-eos-scorecard-golden-matrix-draft.md)/[P1-x](p1-x-eos-rocks-own-manage-golden-matrix-draft.md) (format precedent)
> **Program index:** [Program Index](../../program-index.md)
> **Status:** **confirmed 2026-09-15 (Carl)** — all four proposed dispositions in the review checklist below are approved as-is (broad `view`, SA/Integrator-only `edit`/segment-CRUD/`reorder`, dormant configuration create/delete left unchanged, meeting-agenda reuse accepted with a future-cleanup note). This is now a golden row. No code change is required: every disposition matches already-shipped current behavior
> **Owner:** RBAC v6 with product/security approval
> **Evidence cutoff:** live `pg_policies`/`pg_proc`/`role_permissions` queried fresh 2026-09-15 (not reused from P1-e's 2026-09-12 pass), plus current `origin/main` source
> **Audit entry:** none needed — analysis/documentation only; no authorization, schema, credential, hosted QA, or production action

## Purpose and boundary

Unlike `eos.scorecard.manage` and `eos.rocks.own.manage`, this row's RLS was
already confirmed clean in P1-e's 2026-09-12/15 passes — no client-tenant
leak, no page-component-only check standing in for the real RLS boundary.
This packet re-verifies that finding from scratch (per the standing "check
`pg_policies`, not just the page" guardrail) before proposing it as R2-a's
third vertical slice, and additionally sweeps for a `SECURITY DEFINER`
RPC write-bypass — the exact defect class found in `eos.rocks.own.manage`'s
`upsert_rock_with_parenting`.

This is a draft, not the golden access matrix: a row remains out of policy
until product/security confirms the action, scope, and delegability. It does
not authorize any grant, role default, route change, RLS/RPC change, or
production action.

## Readiness vocabulary

Reused unchanged from P1-w/P1-l:

| State | Meaning in this draft |
| --- | --- |
| `needs_enforcement_inventory` | A source or route entry exists, but the trusted server boundary or effective RLS is not yet fully reconciled. |
| `needs_product_input` | The current behavior bundles distinct actions or does not establish the intended target/scope. |
| `needs_security_review` | The action is destructive, publish-like, or otherwise high-blast-radius. |
| `implementation_ready` | Approved policy, direct positive/negative boundary evidence, rollback, and named observation gates all exist. Not used in this draft. |

## Fresh verification performed 2026-09-15

- **RLS on `eos_configurations`/`eos_configuration_segments`** (queried via
  `pg_policies` directly, not inherited from an earlier pass): every
  INSERT/UPDATE/DELETE policy on both tables requires
  `has_permission('eos.configurations.manage','full')`; SELECT additionally
  allows `is_vivacity()`. `is_vivacity()` resolves to
  `is_vivacity_team_safe(auth.uid())` — genuinely internal-staff-only, no
  client-tenant path, confirmed by reading the function body directly (not
  assumed from its name).
- **`role_permissions` for this key**: only `Super Admin` and `Integrator`
  are `full`; `BGT`, `CET`, `CSC`, `Team Leader` are all `none`. A real
  restriction, not a rubber-stamp grant.
- **`SECURITY DEFINER` RPC sweep** (the `upsert_rock_with_parenting` defect
  class): 5 functions reference `eos_configurations`/
  `eos_configuration_segments` in their body —
  `sync_meeting_to_configuration`, `create_meeting_from_configuration`,
  `generate_meeting_summary`, `seed_meeting_attendees`,
  `auto_generate_next_meeting`. Checked each: **none write to either
  table** — all five only `SELECT` from them (to read segment/duration/
  facilitator-seat config while writing to `eos_meetings`/
  `eos_meeting_segments`/`eos_meeting_participants`/`eos_meeting_attendees`
  instead). `sync_meeting_to_configuration` additionally carries its own
  explicit gate (`is_vivacity_team_safe` + `has_permission('eos.meetings.
  l10.create')`) before touching anything. No RLS-bypassing write path
  exists for this row's own tables.
- **Frontend gate consistency**: `EosConfigurationEditor.tsx`'s single
  `usePermission('eos.configurations.manage','full')` result (`canManage`)
  is threaded through every mutable control uniformly — drag-reorder,
  add/remove segment, every settings field, the edit form — not split
  across some gated and some ungated controls.

## Candidate matrix for review

| Candidate action | Target and scope placeholder | First boundary to prove | Current evidence / readiness | Required negative cases | Decision owner |
| --- | --- | --- | --- | --- | --- |
| `view` (configurations + segments) | Vivacity's own EOS meeting-type configurations (tenant `6372`); no client-tenant target exists | `useEosConfigurations`/`useEosConfigurationSegments` data-fetch hooks; RLS SELECT | Route gated by `canAccessEOS()` (Vivacity Team only); RLS SELECT allows any `is_vivacity()` staff, not just `eos.configurations.manage` holders — **source-backed, intentional**: viewing your own team's meeting-cadence config is not itself sensitive | Client/disabled/expired principal (already excluded by `eos:access`), route bypass | Product (confirm broad-staff view is intended, matching `eos.scorecard.manage`'s precedent) |
| `edit` (configuration settings: frequency, participant model, facilitator seat) | Same configuration, Vivacity-internal only | `updateConfiguration` mutation; `eos_configurations_update` RLS | `role_permissions`: only Super Admin/Integrator `full` — **source-backed, matches the app-layer `canManage` gate exactly** | Non-SA/Integrator staff attempting edit, disabled/expired principal | Product (confirm SA/Integrator-only is the intended set) |
| `create`/`edit`/`delete`/`reorder` segment | Same configuration | `addSegment`/`updateSegment`/`removeSegment`/`reorderSegments` mutations; `eos_configuration_segments` INSERT/UPDATE/DELETE RLS | Same `canManage` gate as configuration `edit`; **source-backed**, no split-permission gap found across the four segment mutations | Same as configuration `edit` | Product |
| `create`/`delete` (top-level configuration row) | Same tenant | No frontend mutation calls `eos_configurations.insert()` or `.delete()` anywhere in `src/` | RLS policies exist for both, but **no live caller** — this action family is provisioned at the database layer but not yet exposed in the product. Not a gap: nothing to authorize that isn't already gated by the same `full`-level RLS as `edit` | N/A — no live path to test | Product (note only; no action needed unless this is built later) |
| `manage meeting agenda` (via `EosMeetings.tsx`'s reuse of this key) | Same tenant; gates whether "manage agenda" routes through `eos.configurations.manage` vs. `eos.meetings.l10.create`, behind an `isConfigV2Enabled` flag | `EosMeetings.tsx:33-35`'s `canManageAgenda()` | Read-only permission check for UI routing/flag-branching; the actual write path (if any) still lands on the same RLS-protected tables above, not a separate boundary | None beyond `edit`'s | Product (architecture note: this reuse blurs the row's boundary — a future packet may want a distinct key for the meeting-agenda consumer, but it is not a live authorization gap today) |

## Scope and relationship placeholders

Collapses the same way P1-w's did — no cross-tenant relationship to resolve:

1. subject profile: any internal `unicorn_role` value; no client or machine
   principal is in scope (confirmed via `is_vivacity_team_safe`, not
   inferred from the page component);
2. tenant/resource relationship: fixed to Vivacity's own tenant (`6372`);
   no server-derived per-tenant resolution needed;
3. action-specific target resolver: identifying which configuration/
   segment row within Vivacity's own workspace — no cross-tenant target
   ever exists;
4. effective RLS/RPC boundary: already correct today, re-verified fresh
   this session (not inherited from the 2026-09-12 pass) — this draft's
   job is confirming the row is ready to go golden, not fixing a leak;
5. review owner, expiry, observation artifact, rollback owner: proposed
   below, matching P1-w's/P1-x's precedent.

## Required synthetic review cases

| Persona/state | Allow case | Deny/negative cases |
| --- | --- | --- |
| Super Admin | Every action in the candidate matrix | Disabled/archived principal |
| Integrator | Every action currently gated at `full` (`edit` configuration, segment CRUD/reorder) | Nothing beyond the standard disabled/expired-principal case |
| Team Leader / BGT / CET / CSC | `view` (configurations + segments) | `edit` configuration, segment CRUD/reorder — all `none` per current `role_permissions` |
| Client Admin/User (any role) | None — EOS is internal-only | Every action; route reachability itself should already fail via `eos:access` |
| Disabled/archived/expired principal | None | All reads/writes, cached request, replay, route bypass |

## Review checklist and stop boundary

Product review must explicitly confirm before this becomes a golden row.
Proposed dispositions below match already-shipped current behavior (nothing
here changes a grant or RLS boundary):

- **`view` scope — proposed: keep broad across all Vivacity Team roles**,
  not narrowed to SA/Integrator. This matches current RLS exactly (`is_
  vivacity()` OR the `full`-level check) and mirrors `eos.scorecard.manage`'s
  already-confirmed precedent that whole-team visibility into shared
  operating configuration is intentional, not a gap.
- **`edit`/segment CRUD/`reorder` — proposed: Super Admin/Integrator-only,
  as currently enforced.** Source-backed via `role_permissions` and RLS;
  no evidence found for a broader or narrower intended set. Unlike
  `eos.scorecard.manage`'s SA/Team-Leader split, this row's edit tier is
  SA/Integrator — a real, deliberate difference this packet is surfacing
  for confirmation rather than assuming it's an inconsistency to fix.
- **Top-level configuration `create`/`delete` — proposed: no action
  needed.** RLS is already correctly gated even though nothing currently
  calls it; this is a dormant, safely-gated capability, not a live gap.
- **Meeting-agenda reuse in `EosMeetings.tsx` — proposed: accept as-is for
  now, flag for a possible future dedicated key.** It is a read-only
  routing check, not an independent write boundary; splitting it out is a
  architecture-cleanliness improvement, not a security fix, so it does not
  block this row going golden.
- **Review owner, expiry, rollback owner — proposed: Carl as review owner
  and final sign-off; 30 days (2026-10-15), matching P1-w/P1-x; RBAC v6
  (Claude) as rollback owner** — no runtime change is implied by
  confirmation, so rollback here means reverting this doc, not a
  production action.

**Confirmed 2026-09-15 (Carl)** — all four proposed dispositions above are
approved as-is. `eos.configurations.manage` is now a golden row for R2-a.
No new role/default/grant, route, RLS/RPC/Edge, or production change is
implied by this confirmation — enforcement already matches.

## Verification

Documentation-only packet. Run `node scripts/check-kb-links.mjs`,
`node scripts/check-kb-doc-size.mjs`, and `git diff --check` before review.
Frontend, Edge, database, authorization, credential, hosted-QA, and live
verification are not applicable — no runtime source changed. The RLS/RPC/
role_permissions evidence above was gathered live via Supabase MCP
`execute_sql` against production, not assumed from documentation.
