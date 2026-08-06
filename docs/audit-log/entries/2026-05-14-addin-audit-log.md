# Audit: 2026-05-14 — addin_audit_log (M365 add-in audit table + view federation)

**Trigger:** Lovable production DB change session — `addin_audit_log` table missing; `src/lib/addinAudit.ts` and two edge functions (`addin-auth-exchange`, `addin-diagnostics-usage`) were silently failing on every write/read.
**Author:** Carl
**Scope:** Supabase project `yxkgdalkbrriasiyyrwk`. Additive only — new table, new indexes, new RLS policies, view recreation to add 21st branch.

---

## Background

The original issue report attributed 7 component failures to `addin_audit_log`. Lovable's audit corrected this: the 7 components write to `client_audit_log` (which exists). The genuine missing-table callers are `src/lib/addinAudit.ts` (user JWT path) and two edge functions (`addin-auth-exchange` writes `addin_opened`; `addin-diagnostics-usage` reads counts by action). Those 3 callers had matching column shapes; no code changes were required post-table-creation.

A separate `client_audit_log` RLS gap was surfaced (Super Admin + Team Leader INSERT only — tenant users silently denied across ~30 call sites). Deferred to a separate Plan B session.

---

## Findings

- `addin_audit_log` confirmed never existed — zero rows in `information_schema.tables`, zero migration history matches.
- `tenants` PK is `id` (bigint), not `tenant_id` — the FK was correctly applied to `tenants(id)`.
- `logAddinOpened` / `logAddinActionExecuted` / `logAddinActionFailed` helpers in `addinAudit.ts` are defined but called by zero files in `src/` — the add-in surface is built but not wired into any UI component yet.
- `tenant_id` is nullable by design: `addin_opened` events from `addin-auth-exchange` occur before tenant context is known. Action-execution events should populate it where available.
- The `WHERE tenant_id IS NOT NULL` gate on the view branch keeps pre-tenant events out of the workspace timeline while keeping them visible in the raw table for SuperAdmin diagnostics.

---

## DB changes shipped

All applied via Lovable migration tool to `yxkgdalkbrriasiyyrwk`:

| Migration | Description |
|---|---|
| `create_addin_audit_log` | Table + 3 indexes + 3 RLS policies + FK constraints + grants |
| `federate_addin_audit_log_into_v_workspace_audit_log` | `CREATE OR REPLACE VIEW` — 20 branches verbatim + new `addin` branch (21st) gated on `tenant_id IS NOT NULL` |

### Table schema

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` |
| `user_uuid` | uuid | NO | FK → `users(user_uuid)` ON UPDATE CASCADE ON DELETE RESTRICT |
| `tenant_id` | bigint | YES | FK → `tenants(id)` ON UPDATE CASCADE ON DELETE SET NULL |
| `action` | text | NO | Free text v1 — `addin_opened`, `addin_action_executed`, `addin_action_failed` |
| `record_type` | text | YES | e.g. `tenant`, `task`, `note` |
| `record_id` | text | YES | Mixed uuid/bigint IDs |
| `surface` | text | YES | `outlook_mail`, `outlook_calendar`, `teams_meeting`, `word`, `excel` |
| `metadata` | jsonb | YES | Default `'{}'::jsonb` |
| `client_info` | text | YES | UA/host string from `addinAudit.ts` |
| `created_at` | timestamptz | NO | `now()` |

### Indexes

| Index | Columns |
|---|---|
| `addin_audit_log_pkey` | `id` |
| `idx_addin_audit_log_user_created` | `(user_uuid, created_at DESC)` |
| `idx_addin_audit_log_tenant_created` | `(tenant_id, created_at DESC) WHERE tenant_id IS NOT NULL` |
| `idx_addin_audit_log_action_created` | `(action, created_at DESC)` — powers `addin-diagnostics-usage` aggregation |

### RLS policies

| Policy | Cmd | Expression |
|---|---|---|
| `addin_audit_log_self_insert` | INSERT | `WITH CHECK (user_uuid = (SELECT auth.uid()))` |
| `addin_audit_log_self_select` | SELECT | `USING (user_uuid = (SELECT auth.uid()))` |
| `addin_audit_log_staff_select` | SELECT | `USING (unicorn_role IN ('Super Admin', 'Team Leader'))` |

No UPDATE/DELETE policies — audit-only. Service role retains full access.

### View federation (Branch 21)

```sql
UNION ALL
SELECT
  id, tenant_id, user_uuid AS actor_id, action,
  'addin'::text AS domain,
  COALESCE(record_type, 'addin')::text AS entity_type,
  record_id AS entity_id,
  NULL::jsonb AS old_val, NULL::jsonb AS new_val,
  COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('surface', surface, 'client_info', client_info) AS metadata,
  created_at
FROM public.addin_audit_log
WHERE tenant_id IS NOT NULL
```

### Grants

| Role | Privileges |
|---|---|
| `authenticated` | SELECT, INSERT |
| `service_role` | ALL |
| `anon` / `PUBLIC` | none |

---

## Verification (live DB — 14 May 2026)

```
authenticated INSERT: true  ✅
authenticated SELECT: true  ✅
service_role SELECT:  true  ✅
3 RLS policies:       ✅
4 indexes:            ✅
21 UNION ALL branches in view: ✅
End-to-end smoke (INSERT → SELECT via view → DELETE): ✅
  domain=addin, action=addin_opened, entity_type=addin,
  metadata={test, surface=outlook_mail, client_info=null}
0 new linter warnings (937 baseline unchanged): ✅
```

---

## KB changes shipped

None this session. `unicorn-kb/codebase-state/audit-log-inventory.md` will need a minor update to reflect the view is now 21 branches and `addin_audit_log` is a live domain — deferred to KB hygiene pass.

---

## Codebase observations (read-only)

- `unicorn-cms-f09c59e5 @ a171ca97`: No codebase changes in this session. `src/lib/addinAudit.ts` helpers (`logAddinOpened`, `logAddinActionExecuted`, `logAddinActionFailed`) exist but are called by zero components — the M365 add-in surface is built but not wired into any UI. Writes will start flowing once components call those helpers.

---

## Decisions

- **`tenant_id` nullable**: confirmed — pre-tenant `addin_opened` events must be nullable; action-execution events populate it where available.
- **Free text `action`**: confirmed for v1 — small stable value set, no `dd_addin_action` lookup needed yet.
- **`addin-auth-exchange` tenant population**: deferred — edge function not updated this session; `addin_opened` rows will have `tenant_id = NULL` until the edge function is updated.
- **Plan B (`client_audit_log` RLS)**: deferred — INSERT restricted to Super Admin + Team Leader only; ~30 tenant-user call sites silently denied. Separate session required.

---

## Open questions parked

- **`client_audit_log` RLS gap (Plan B)**: ~30 call sites silently denied for non-staff users. Fix is one RLS migration (allow authenticated tenant members to INSERT for their own tenant). Separate session.
- **`addin-auth-exchange` tenant population**: edge function should populate `tenant_id` from the minted JWT's primary tenant when known. Separate session.
- **`addinAudit.ts` call-site wiring**: helpers defined but not called from any component. No action needed until the M365 add-in UI is built out.
- **KB update**: `audit-log-inventory.md` needs minor update (21 branches, `addin` domain added).

---

## Tag

`audit-2026-05-14-addin-audit-log`
