# RBAC v6 — Packet P1-w: `eos.scorecard.manage` golden-matrix draft (first vertical slice)

> **Parent plan:** [RBAC v6 Authorization Implementation and Gate-Streamlining Plan](../../rbac-v6-authorization-implementation-plan-2026-09-01.md) — §7 P1
> **Inputs:** [P1-e bundled-verb decomposition](p1-e-bundled-verb-decomposition.md), [P1-l AJ/CSC golden-matrix draft](p1-l-aj-csc-golden-matrix-review-draft.md) (format precedent)
> **Program index:** [Program Index](../../program-index.md)
> **Status:** preparation draft delivered 2026-09-15 — reviewable candidate rows; no golden policy row approved, grant, role, route, RLS, RPC, Edge, credential, or production state changed by this packet
> **Owner:** RBAC v6 with product/security approval
> **Evidence cutoff:** `origin/main` post-PR #1323 (`retire-client-eos-access` merged) — this row's tenant/resource semantics are internal-Vivacity-only, verified at the RLS layer, not just the page component
> **Audit entry:** none needed — analysis/documentation only; no authorization, schema, credential, hosted QA, or production action

## Purpose and boundary

Carl approved `eos.scorecard.manage` as R2-a's first bounded vertical slice
(P1-e, 2026-09-15) — self-contained, internal-only, no overlap with other
active initiative work. This packet drafts the golden-matrix candidate rows
for that slice, following the format P1-l already established for AJ/CSC.

This is a draft, not the golden access matrix: a row remains out of policy
until product/security confirms the action, scope, and delegability. It does
not authorize any grant, role default, route change, RLS/RPC change, or
production action.

## Readiness vocabulary

Reused unchanged from P1-l:

| State | Meaning in this draft |
| --- | --- |
| `needs_enforcement_inventory` | A source or route entry exists, but the trusted server boundary or effective RLS is not yet fully reconciled. |
| `needs_product_input` | The current behavior bundles distinct actions or does not establish the intended target/scope. |
| `needs_security_review` | The action is destructive, publish-like, or otherwise high-blast-radius. |
| `implementation_ready` | Approved policy, direct positive/negative boundary evidence, rollback, and named observation gates all exist. Not used in this draft. |

## Candidate matrix for review

Unlike AJ/CSC, this row has no cross-tenant relationship to resolve: RLS on
`eos_scorecard`/`eos_scorecard_entries`/`eos_scorecard_metrics` now grants
only `is_super_admin()`/`is_vivacity_team_safe()`/`is_vivacity_team_user()`
(PR #1323). The remaining open questions are which of the ~9 internal
Vivacity roles should get which action, not tenant/resource scoping.

| Candidate action | Target and scope placeholder | First boundary to prove | Current evidence / readiness | Required negative cases | Decision owner |
| --- | --- | --- | --- | --- | --- |
| `view` | Vivacity's own scorecard metrics/entries (tenant `6372`); no client-tenant target exists post-retirement | `EosScorecard.tsx`'s data-fetch hooks (`useScorecardMetrics`, `useEosScorecardEntries`); RLS SELECT | Route already gated by `canAccessEOS()` (Vivacity Team only, tested); RLS hardened 2026-09-15; no per-action `usePermission` gate distinguishes view from edit — **`needs_product_input`** on whether every Vivacity Team member should see every metric, or only their own seat's | Client/disabled/expired principal (already excluded by `eos:access`), archived/former staff, route bypass |  Product |
| `create` (new metric definition) | Same scorecard, Vivacity-internal only | `canEditVTO()`/`usePermission('eos.scorecard.manage')` gate on the "Create Metric"-style control; `eos_scorecard_metrics_insert` RLS | `role_permissions` currently grants `full` only to Super Admin/Team Leader (BGT/CET/CSC/Integrator: `none`) — **source-backed, matches the app-layer gate** | Non-SA/TL Vivacity role attempting create, disabled/expired principal, replay | Product (confirm SA/TL-only is the intended set, not just legacy default) |
| `edit` (metric config) | Same as `create` | `handleEdit`/mutation hooks; `eos_scorecard_metrics_update` RLS | Same `usePermission` gate as `create`; **source-backed** | Same as `create` | Product |
| `archive` (soft) | Same as `create` | `archiveMetric` mutation in `useScorecardMetrics.tsx` (`is_archived: true, is_active: false`) plus `auditLog('scorecard_metric.archived', id)`; `eos_scorecard_metrics_update`/RLS | **Source-backed** — real handler, calls `auditLog`. RLS was found to still have a leftover client-tenant clause during this packet's drafting and was fixed same-day (see [audit entry correction](../../../../audit-log/entries/2026-09-15-retire-client-eos-access.md)) | Non-SA/TL attempting archive, disabled/expired principal | Product (confirm SA/TL-only, matching `create`/`edit`) |
| `delete` (hard) | Same as `create` | `deleteMetric` mutation — **guarded**: refuses to delete a metric with recorded entries ("Archive it instead of deleting"), calls `auditLog('scorecard_metric.deleted', id)`; `eos_scorecard_metrics_delete`/RLS | **Source-backed**, including a real business-rule guard against data loss. Same RLS leftover-clause fix as `archive`, above | Non-SA/TL attempting delete, disabled/expired principal, delete attempt on a metric with existing entries (already blocked by app logic, not yet confirmed at the RLS layer) | Product + security (destructive) |
| `record` (log a scorecard entry/measurement) | Same scorecard | `handleRecord`; `eos_scorecard_entries_insert`/`_update` RLS | No `canEditVTO()`/`usePermission` gate found on this specific handler in the earlier pass — appears open to any Vivacity Team member (broader than `create`/`edit`), consistent with routine weekly scorecard recording being a normal team activity rather than an admin-only action — **`needs_product_input`** to confirm this intentional looser scope, not an accidental gap | Non-Vivacity-Team principal (already excluded by RLS/`eos:access`), disabled/expired principal, backdated/duplicate entry | Product (confirm the broader-than-create scope is intended) |
| `view history` | Same scorecard | History view in `EosScorecard.tsx`; same SELECT RLS as `view` | Same evidence as `view` | Same as `view` | Product |
| `refresh/recompute` | Same scorecard | `handleRefresh`; recomputes from already-readable rows, no new data exposure | Read-side operation only; low residual risk since it exposes nothing beyond what `view` already allows | None beyond `view`'s | Product (confirm no distinct gate is needed) |

## Scope and relationship placeholders

Unlike AJ/CSC, most of P1-l's six placeholders collapse for this row since
there is no cross-tenant relationship left to resolve post-PR #1323:

1. subject profile: any of the internal `unicorn_role` values (Super Admin,
   Team Leader, Team Member, BGT, CET, CSC, Integrator) — no client or
   machine principal is in scope;
2. tenant/resource relationship: fixed to Vivacity's own tenant (`6372`);
   no server-derived per-tenant resolution is needed;
3. action-specific target resolver: none needed beyond identifying which
   scorecard/metric/entry row within Vivacity's own workspace;
4. effective RLS/RPC boundary: already hardened (PR #1323); this draft's
   job is confirming *which roles* should pass `role_permissions`, not
   fixing a tenant leak;
5. review owner, expiry, observation artifact, rollback owner: not yet
   named — this is the actual open item for this packet, per the review
   checklist below.

## Required synthetic review cases

| Persona/state | Allow case | Deny/negative cases |
| --- | --- | --- |
| Super Admin | Every action in the candidate matrix | Disabled/archived principal, self-approval where relevant |
| Team Leader | Every action currently gated at `full` (`create`/`edit`/`delete`, per current `role_permissions`) | Nothing beyond the standard disabled/expired-principal case |
| Team Member / BGT / CET / CSC / Integrator | `view`, `view history`, `record` (pending the `needs_product_input` confirmation above) | `create`/`edit`/`delete` per current `role_permissions` (`none`) |
| Client Admin/User (any role) | None — client-tenant EOS access is retired (PR #1323) | Every action; route reachability itself should already fail via `eos:access` |
| Disabled/archived/expired principal | None | All reads/writes, cached request, replay, route bypass |

## Review checklist and stop boundary

Product review must explicitly confirm before this becomes a golden row.
Proposed dispositions below match already-shipped current behavior (nothing
here changes a grant or RLS boundary) — recorded as a ready-to-confirm
recommendation rather than a live decision, since Carl asked to stay focused
on RBAC progress rather than be pulled into every checkpoint:

- **`view`/`view history` scope — proposed: keep uniform across all
  Vivacity Team roles**, not narrowed to a seat/team. This matches current
  `role_permissions`/RLS exactly (no distinction exists today), and EOS
  scorecards are a whole-team visibility tool by design (every team member
  sees the same operating metrics) — narrowing it would be a new
  restriction, not a status-quo codification.
- **`record`'s broader-than-`create` gate — proposed: intentional, not a
  gap.** Recording a weekly measurement is routine team activity; changing
  what a metric *is* (create/edit/delete) is a configuration change. This
  matches standard EOS scorecard practice (team members record their own
  numbers; only Admin/facilitator-tier roles configure the scorecard
  structure) and is already how the system behaves — no change needed to
  ship this disposition, only to record it as accepted rather than open.
- **`archive`/`delete` — proposed: SA/TL-only, matching `create`/`edit`.**
  Source-backed (traced to `useScorecardMetrics.tsx`, 2026-09-15); no
  evidence found for a different intended set.
- **Review owner, expiry, rollback owner — proposed: Carl as review owner
  and final sign-off; 30 days (2026-10-15), matching this session's other
  RBAC v6 gate expiries; RBAC v6 (Claude) as rollback owner** since this
  slice has no runtime change yet — rollback here means reverting the
  golden-matrix doc, not a production action.

A one-line "approved" (or specific corrections) from Carl closes this
checklist. Until then this remains a draft. No role/default/grant
activation, route change, RLS/RPC/Edge change, or production observation is
authorized beyond what PRs #1323/#1325 already shipped (the retirement fix
and its follow-up).

## Verification

Documentation-only packet. Run `node scripts/check-kb-links.mjs`,
`node scripts/check-kb-doc-size.mjs`, and `git diff --check` before review.
Frontend, Edge, database, authorization, credential, hosted-QA, and live
verification are not applicable — no runtime source changed.
