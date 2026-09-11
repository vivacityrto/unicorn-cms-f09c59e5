# RBAC v6 — Packet P0.1 scoping: read-only authorization inventory

> **Parent plan:** [RBAC v6 Authorization Implementation and Gate-Streamlining Plan](../../rbac-v6-authorization-implementation-plan-2026-09-01.md)
> **Program index:** [Program Index](../../program-index.md)
> **Status:** P0.1-a and P0.1-b both delivered 2026-09-11 — see [P0.1-a static inventory](p0-1-a-static-inventory.md) and [P0.1-b live inventory](p0-1-b-live-inventory.md). Packet P0.1 is now complete.
> **Owner:** Claude Code (scoping doc, P0.1-a, and P0.1-b)
> **Scope:** carve the plan's §7 P0.1 ("generate a versioned inventory of routes, nav entries, raw role checks, `usePermission` calls, public RPCs, effective live RLS policies/functions/triggers/grants/owners, role rows, matrix gaps, assignments, system identities, and helper dependencies") into the smallest independently authorizable first packet
> **Dependencies:** none technical; requires Carl/Vivacity's go-ahead to start (see "Open questions" below) — this doc does not itself authorize starting P0.1
> **Exit criteria:** a versioned inventory artifact exists covering every item the plan's P0.1 line names, each with a real source citation (file/line, live query result, or explicit "not found")
> **Evidence:** counts below are from this repo at `origin/main@136f9997b`, gathered 2026-09-11
> **Audit entry:** none — this is a planning/documentation-only doc; P0.1 itself is read-only (no schema/RLS/grant/migration/production-data change) and needs no audit entry either, per `AGENTS.md`'s "UI-only changes with no migration don't need one" principle extended to a pure inventory pass

## Why this packet, why now

`program-index.md` (2026-09-10) records RBAC v6 as "planning — implementation
plan only... no production migration, Edge deployment, permission grant, or
role change authorized yet," and names "exact capability rows and
implementation sequencing" as the open packet-level work. The master plan
(§7) already specifies exactly what P0 requires in full detail — this doc
does not re-derive that, it answers a narrower question the plan doesn't:
**what is the smallest slice of P0 that could be authorized and started
without a policy decision, and roughly how big is it in this codebase right
now?**

P0.1 is that slice. Unlike P0.2 (permission-mutation audit — touches a live
trigger/Edge write path), P0.3 (`is_active_principal_v6()` shadow rollout —
touches enforcement helpers), P0.4 (session/frontend state changes), P0.5
(role/matrix decisions — explicitly requires approving what stays `none`),
or P0.6 (feature-boundary baseline — needs product sign-off on what "current
behavior" means), P0.1 is pure read/generate: it inventories what exists. It
changes no runtime behavior, requires no product decision, and produces the
input every other P0/P1 sub-item depends on.

## Current-size grounding (measured, not estimated)

| Signal | Count | Source |
|---|---:|---|
| `unicorn_role` string occurrences | 161 files | `npm run metrics` |
| `usePermission(` call sites | 38 | `grep -rn "usePermission(" src` |
| `<PermissionGate` usages | 6 | `grep -rn "<PermissionGate" src` |
| `requireSuperAdmin` usages (frontend + Edge) | 11 files | `grep -rl` |
| `requireCaller` imports (Edge Functions) | 97 files | `grep -rl` |
| Raw `unicorn_role === / !==` comparisons | 77 | `grep -rn` |
| Edge Functions total (repo-tracked, all in sync per the 2026-09-11 drift audit) | 193 | `mcp__supabase__list_edge_functions` reconciliation |

These are call-site counts, not capability counts — the plan's P1 already
names the real target size ("85 current features and 523 role rows"), which
this packet's inventory should reconcile against, not replace. The point of
this table is scale, not completeness: P0.1 is touching on the order of a
few hundred call sites and 193 Edge Functions, not a handful — worth sizing
correctly before proposing a single-PR packet.

## Proposed packet boundary

Split P0.1 into two independently mergeable, read-only deliverables rather
than one large one:

**P0.1-a — Frontend/static inventory** (no live Supabase access required):
- Route + nav-entry table reused from the existing `npm run routes` manifest
  (`scripts/generate-route-manifest.mjs`, already covers guard chains
  including `requireSuperAdmin`/`allowedRoles`/`allowVivacityTeam` — see
  `AGENTS.md`'s "Route manifest" section) — likely needs only a new
  column/filter, not a new script.
- Every `usePermission(` call site with its feature/level arguments (38
  call sites — small enough to hand-tabulate and cite by file/line).
- Every `<PermissionGate>` usage (6) and raw `unicorn_role ===`/`!==`
  comparison (77) with file/line citation.
- Every `requireSuperAdmin`/`requireCaller` Edge Function (11 / 97) with
  its verify_jwt mode and first privileged read/write line — much of this
  is already captured piecemeal in the "Edge Function security guardrails"
  section of `AGENTS.md` and prior audit entries; this packet's job is
  consolidating it into one versioned artifact, not re-investigating each
  function from scratch.

**P0.1-b — Live database inventory** (read-only Supabase MCP queries against
**production**, `execute_sql`/`get_advisors` only — no `apply_migration`,
no write of any kind):
- Effective live RLS policies/functions/triggers/grants per
  `pg_policies`/`pg_proc`/`pg_trigger`/`information_schema.column_privileges`
  (same query shapes already used in this repo's own guardrail checklists —
  see AGENTS.md's "Schema / RLS / trigger changes" grant/trigger examples).
- Role rows (`role_capability_grants`-equivalent tables today), matrix gaps,
  and system-identity/assignment rows.
- Helper dependency graph from `pg_depend` for `is_super_admin_safe`,
  `is_vivacity_team_safe`, `has_tenant_access_safe`, `check_permission`, and
  any v6-candidate helper — this is the "do not replace a helper referenced
  by hundreds of policies in one uncharacterized deployment" data P0.3 will
  need later (P0.3 itself is explicitly out of scope for this packet).

Splitting this way lets P0.1-a start immediately (zero live-database
access, zero risk) while P0.1-b is reviewed for its read-only Supabase MCP
usage separately — matching this repo's own precedent of separating
static/source review from live verification passes.

## Explicitly out of scope for this packet

- Anything in P0.2-P0.6 (mutation-audit redesign, active-principal shadow
  helper, session/frontend behavior change, matrix `none`/inactive
  decisions, feature-boundary behavior freeze) — each needs either a
  product decision or touches live enforcement paths; this packet touches
  neither.
- Any RBAC v6 §13 decision — items 14/15 stay parked, and this packet
  does not reopen or depend on resolving any of them.
- Any change to `role_capability_grants`, `user_capability_grants`, or any
  new table from §5.8's "preferred expand/contract data shape" — this
  packet inventories what exists today, it does not create the v6 schema.

## Cross-initiative dependency (for the TOM cross-check)

RBAC v6 §13 item 1 (broad internal-staff tenant visibility vs. narrower
scoping) is the same decision as Tenant Operating Model §18 item 1, and
TOM's own plan gates its P0/P1 implementation on this RBAC v6 decision.
This packet's P0.1 inventory does not depend on that decision either way —
it inventories current behavior regardless of what the future policy
becomes — but the *golden access matrix* that P1 builds from this inventory
will need TOM's tenant-role/operating-state model as an input wherever a
capability's scope depends on tenant assignment vs. tenant-wide visibility.
Codex's TOM P0/P1 prep should flag anywhere its proposed tenant operating
states would change what "current behavior" this packet records — e.g. if
a tenant operating state changes what "assigned tenant" means, that's a
P1 capability-scope question, not a P0.1 inventory question.

## Open questions for Carl/Vivacity

1. Authorize P0.1-a and P0.1-b as the first RBAC v6 implementation packet
   (distinct from this scoping doc, which is planning only)?
2. Should P0.1-a and P0.1-b ship as one PR or two, given P0.1-b needs live
   production read-only Supabase MCP access and P0.1-a doesn't?
3. Who reconciles this packet's raw call-site inventory against the plan's
   "85 current features and 523 role rows" figures cited in P1 — is that
   reconciliation itself part of P0.1, or the first task of P1?

No implementation, schema read beyond what's already cited above, or
production access was performed to write this scoping doc beyond the
static `grep`/`npm run metrics` counts already run and cited.
