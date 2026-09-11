# RBAC v6 — Packet P0.1-b: live read-only database inventory

> **Parent plan:** [RBAC v6 Authorization Implementation and Gate-Streamlining Plan](../../rbac-v6-authorization-implementation-plan-2026-09-01.md)
> **Scoping doc:** [P0.1 packet scoping](p0-1-inventory-packet-scoping.md)
> **Sibling packet:** [P0.1-a static inventory](p0-1-a-static-inventory.md)
> **Program index:** [Program Index](../../program-index.md)
> **Status:** delivered 2026-09-11 — read-only, production Supabase MCP queries only (`execute_sql`), no writes
> **Owner:** Claude Code
> **Exit criteria (this packet):** live evidence for role rows, permission-feature rows, RLS policies/triggers/grants on the RBAC tables themselves, and the helper-function dependency graph, each with a real query result
> **Evidence:** gathered 2026-09-11 via Supabase MCP against the production project, at `origin/main@5dec5a9a8`
> **Audit entry:** none — read-only `execute_sql` queries only; no schema, RLS, grant, migration, or data change made

## What this is

The live-database half of P0.1, run via Supabase MCP's `execute_sql` against
the four tables backing the current permission system
(`permission_features`, `role_permissions`, `user_roles`,
`permission_change_log`), plus `pg_policies`, `information_schema`, and
`pg_depend` queries against the helper functions RLS policies actually call.
No `apply_migration` or any write path was used.

## Role/permission table shape and row counts

| Table | Rows | Purpose (from schema + RLS) |
|---|---:|---|
| `permission_features` | 85 | Canonical feature catalogue (`feature_key`, `module`, `category`, `is_active`, `sort_order`) |
| `role_permissions` | 523 | Role × feature → level grants (`level`: `full` / `limited` / `owner_only` / `none`) |
| `user_roles` | 2 | Per-user role grant rows with `granted_by`/`granted_at`/`expires_at` — looks like a supplemental/time-boxed override table, not the primary role source (see below) |
| `permission_change_log` | 632 | Append-only audit trail (`before`/`after` jsonb, `reason`), populated by trigger |

**The 85/523 figures exactly match** the parent plan's cited "85 current
features and 523 role rows" — the scoping doc's open question 3
("who reconciles this against the plan's figures") is answered: they already
reconcile exactly, no drift to fix.

## Where role assignment actually lives

`user_roles` having only 2 rows despite backing real RLS policies means it is
**not** the primary source of a user's role — `public.users.unicorn_role`
(a plain `text` column, `NOT NULL`) is. `public.users` also carries `role`,
`global_role`, and `kpi_role` columns — four role-shaped columns total, of
which `unicorn_role` is the one referenced by the 59 raw comparisons P0.1-a
found. `user_roles` appears reserved for supplemental time-boxed grants
layered on top (its `expires_at` column has no equivalent on `users`).

## `dd_unicorn_roles` — the full role catalogue, and a real coverage gap

`dd_unicorn_roles` (a data-dictionary reference table, 11 rows) lists every
role the system recognizes, each flagged `is_internal`:

| Role (`value`) | `is_internal` | `is_active` | In `role_permissions`? |
|---|---|---|---|
| Super Admin | true | true | yes (84 rows, 0 `none`) |
| Team Leader | true | true | yes (84 rows, 20 `none`) |
| Team Member | true | **false** | yes (18 rows, 6 `none`) |
| Integrator | true | true | yes (84 rows, 37 `none`) |
| BGT | true | true | yes (84 rows, 49 `none`) |
| CSC | true | true | yes (84 rows, 40 `none`) |
| CET | true | true | yes (84 rows, 53 `none`) |
| Bulk Generate Automation | true | **false** | yes (1 row, 0 `none`) |
| Admin | **false** | true | **no rows at all** |
| User | **false** | true | **no rows at all** |
| Academy User | **false** | true | **no rows at all** |

**Real finding:** `role_permissions` only covers internal/staff roles. The
three client-facing roles (Admin, User, Academy User) have zero rows in the
feature-permission table — their authorization runs entirely through
tenant-scoped RLS (`has_tenant_access_safe` and friends), not through the
`usePermission()`/`check_permission()` feature-level system at all. This
matches P0.1-a's static count (`usePermission()` calls are a staff-side
pattern) but is worth stating explicitly for P1's capability-row catalogue,
since it means "523 role rows across 85 features" is a staff-only matrix,
not a whole-system one.

Also note two roles are `is_active: false` in the dictionary (Team Member,
Bulk Generate Automation) yet still have live `role_permissions` rows —
inactive-but-still-granted is a real combination in production today, not
a hypothetical P0.5 edge case.

## RLS policies on the RBAC tables themselves

19 policies total across the 4 tables, all following one consistent shape:

- **Writes (INSERT/UPDATE/DELETE)** on all of `permission_features`,
  `role_permissions`, `user_roles`: gated by `is_super_admin_safe(auth.uid())`
  only — no other role can mutate the permission system.
- **Reads (SELECT)**: `permission_features` is world-readable to any
  authenticated user (`qual: true`) — feature *names* aren't secret;
  `role_permissions` and `user_roles` are staff-only
  (`is_vivacity_team_safe(auth.uid())`), with `user_roles` additionally
  allowing a user to read their own row (`auth.uid() = user_uuid OR
  is_vivacity_team_safe(...)`).
- `permission_change_log`: INSERT gated by `is_super_admin_safe`, SELECT
  gated by `is_vivacity_team_safe` — no UPDATE/DELETE policy exists at all
  (append-only by omission, not just convention).

## Triggers

`permission_features`, `role_permissions`, and `user_roles` each carry the
same pair: `<table>_change_log` (AFTER INSERT/UPDATE/DELETE →
`log_permission_change()`, the source of `permission_change_log`'s 632 rows)
and `<table>_touch_updated_at` (BEFORE UPDATE → `touch_updated_at()`).
`permission_change_log` itself has no triggers (nothing writes to the log
of the log).

## Grants

All four tables carry the same broad table-level grant set (`SELECT,
INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE`) to `anon`,
`authenticated`, `postgres`, and `service_role` — this is Supabase's standard
schema-level default for `public`, not something specific to these tables;
the RLS policies above are the actual per-row gate PostgREST enforces for
`SELECT`/`INSERT`/`UPDATE`/`DELETE`. `TRUNCATE`/`REFERENCES` aren't reachable
through PostgREST's REST surface, so the broad grant doesn't extend a real
attack surface beyond what RLS already governs.

## Helper function dependency graph

Live `pg_depend` counts — how many RLS policies (repo-wide, not just the 4
tables above) call each helper:

| Helper | Policies depending on it |
|---|---:|
| `is_vivacity_team_safe(uuid)` | 518 |
| `is_super_admin_safe(uuid)` | 382 |
| `has_tenant_access_safe(bigint, uuid)` | 201 |
| `check_permission(uuid, text, text)` | 8 |
| `is_conversation_participant_safe(uuid, uuid)` | 3 |

This is the data P0.3 (the `is_active_principal_v6()` shadow-rollout packet)
will need before touching any of these — confirms `is_vivacity_team_safe`
and `is_super_admin_safe` are each referenced by hundreds of policies
repo-wide, so any replacement there is a wide-blast-radius change requiring
a shadow rollout, not a direct swap. **`is_active_principal_v6()` does not
exist yet** — confirms P0.3 genuinely hasn't started, consistent with
`program-index.md`.

`check_permission`'s low count (8) relative to `usePermission()`'s 36
frontend call sites confirms these are different layers: `usePermission()`
is a frontend-only pattern (checked against `role_permissions` via a
different path, not RLS), while `check_permission()` the Postgres function
is a much narrower RLS-level gate used directly by only a handful of
policies.

## What P0.1-b does not cover (deliberately out of scope, not an oversight)

- **A full security-advisor scan.** `get_advisors(type: "security")` was run
  and returned 6 findings (4 WARN, 1 ERROR, 1 INFO — `rls_enabled_no_policy`,
  `security_definer_view`, `extension_in_public`, two
  `security_definer_function_executable` findings, one
  `vulnerable_postgres_version`), but a full security-posture audit is
  broader than what the P0.1 scoping doc asked for and belongs to a
  dedicated security packet, not this inventory. Not investigated further
  here.
- **System-identity/service-account rows** and the full **matrix-gap**
  analysis (which `none`-level cells should logically change) — the raw
  `none` counts per role are captured above, but deciding which are
  intentional vs. gaps is P0.5/P1 work, not this packet's.
- Any schema/RLS/grant change of any kind — this packet is read-only by
  design.

## Verification

Docs-only change (no `src/`, `supabase/`, dependency, or workflow file
touched) -- `node scripts/check-kb-links.mjs` and
`node scripts/check-kb-doc-size.mjs` are the relevant checks; no
lint/typecheck/test suite applies since no code changed.
