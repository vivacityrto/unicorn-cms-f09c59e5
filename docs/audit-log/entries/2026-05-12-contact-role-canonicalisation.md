# Audit: 2026-05-12 — contact-role-canonicalisation

**Trigger:** drift-surfaced — BUG-001 and BUG-004 from the 12 May 2026 deployment status audit, combined with the `trg_sync_primary_contact` trigger gap identified in the same report.
**Author:** Carl
**Scope:** `public.tenant_users` contact-role model. The trigger `trg_sync_primary_contact`, all consumer read-paths that key off `primary_contact` / `secondary_contact` booleans rather than `relationship_role`, and the drift rows between the two systems. No other tables, RLS policies, or application features in scope.
**Supabase project:** `yxkgdalkbrriasiyyrwk` — Unicorn 2.0-dev (ap-southeast-2)

---

## Background

`tenant_users` has two parallel contact-role systems: legacy boolean columns (`primary_contact`, `secondary_contact`) and the canonical `relationship_role` text field (values: `'primary_contact'`, `'secondary_contact'`, `'user'`, `'academy_user'`). The trigger `trg_sync_primary_contact` predated `relationship_role` and only set the boolean from `role = 'parent'`; it never touched `relationship_role`. This left 42 rows out of sync and caused BUG-001 and BUG-004.

---

## Findings

- **42 drift rows in production** — dominant pattern was `relationship_role = 'secondary_contact'` with `primary_contact = true, secondary_contact = false` (36 rows). Also: 3 `user`/`academy_user` RR rows with stale boolean flags, 2 `user` RR rows with `primary_contact IS NULL`, and 1 `primary_contact` RR row with inverted booleans.
- **Trigger root cause confirmed** — `sync_primary_contact_on_role()` fired only on `role = 'parent'` and did not reference `relationship_role` at all. The `invite-user` edge function had already documented this: *"check `relationship_role` column, NOT the primary\_contact boolean — the boolean is unreliable."*
- **sibling trigger `trg_sync_secondary_contact`** — reads `secondary_contact = true` to mirror contact name/email/phone into `tenant_profile`. Not rekeyed in this session (deferred). After Phase 2 backfill, booleans are correct for all non-NULL rows, so this trigger now computes correctly.
- **Phase 2 backfill fired `trg_sync_secondary_contact` ~38 times** — the AFTER trigger recomputed `tenant_profile.secondary_contact_*` for the affected tenants. Net effect: tenant_profile now mirrors the correct secondary contact rather than the previously mis-flagged primary-boolean row. Improvement, not regression.
- **1 residual primary_contact RR row** — the approved Phase 2 scope did not include `primary_contact RR + (false, true)` rows. Found in post-Phase-2 verification. Fixed via Studio SQL Editor with backup captured in `_tenant_users_contact_backfill_20260512` before applying.
- **`pdp_cycles` tenant admin SELECT policy** — still reads `primary_contact = true OR secondary_contact = true` (migration `20260512021431`, deployment status item NEW-002). Not rekeyed in this session. After Phase 2 the booleans are reliable mirrors, so the policy now functions correctly. Rekey to `relationship_role` is a deferred cleanup.
- **`sync_primary_contact_on_role` in P1-e mutable search_path list** — the Phase 1 `CREATE OR REPLACE` did not add `SET search_path`. Function remains in the 28-function P1-e list. Address in the dedicated P1-e Lovable session.
- **Display-only boolean reads not migrated** — `src/pages/TenantDetail.tsx:458` and `src/pages/ClientDetail.tsx:200` still query `secondary_contact = true`. These are display queries, not access gates. Booleans are now reliable so no functional regression. Deferred cleanup.

---

## DB changes shipped

### Phase 1 — Migration `20260512043150` (trigger function rewrite)

`CREATE OR REPLACE FUNCTION public.sync_primary_contact_on_role()` — rekeyed to treat `relationship_role` as canonical. Four branches:
- `relationship_role = 'primary_contact'` → `primary_contact = true, secondary_contact = false`
- `relationship_role = 'secondary_contact'` → `primary_contact = false, secondary_contact = true`
- `relationship_role IN ('user','academy_user')` → both false
- `relationship_role IS NULL` → legacy `role = 'parent'` fallback (Unicorn 1 importer compat)

No trigger drop/recreate, no SECURITY DEFINER, no data changes. Lock: ACCESS EXCLUSIVE on `pg_proc` row only — no table lock. Codebase at `47034efd`.

### Phase 2 — Migration `20260512043447` (data backfill)

Three UPDATE statements covering 41 drift rows. Pre-backfill state captured in `public._tenant_users_contact_backfill_20260512` (41 rows). Codebase at `26a4ce09`.

Post-Phase-2 verification (all passed):
- Zero drift rows ✅ (after Phase 2b below)
- `relationship_role IS NULL` rows: 6 (unchanged, as decided) ✅
- Duplicate `relationship_role = 'primary_contact'` per tenant: 0 ✅
- Duplicate `secondary_contact = true` per tenant: 0 ✅

### Phase 2b — Studio SQL Editor (residual fix)

One additional row: `relationship_role = 'primary_contact'` with `primary_contact = false, secondary_contact = true`. Pre-state captured in `_tenant_users_contact_backfill_20260512` before fixing. Applied directly as this was within the approved Phase 2 backfill scope. Not a tracked migration.

### Final distribution (confirmed via live query)

| relationship_role | primary_contact | secondary_contact | rows |
|---|---|---|---|
| `primary_contact` | true | false | 401 ✅ |
| `secondary_contact` | false | true | 38 ✅ |
| `user` | false | false | 10 ✅ |
| `academy_user` | false | false | 1 ✅ |
| NULL | false | false | 6 ✅ (left for triage) |

---

## Code changes shipped

### Phase 3 — Code-only (codebase at `27ce35a8`)

Four edge function / frontend read-site rekeys:
- `supabase/functions/bulk-send-invitations/index.ts:133` — `.eq("primary_contact", true)` → `.eq("relationship_role", "primary_contact")`. **Closes BUG-001.**
- `supabase/functions/send-email-graph/index.ts:190` — same swap.
- `supabase/functions/send-composed-email/index.ts:85` — same swap.
- `src/components/audit/workspace/SendPreliminarySummaryDialog.tsx:77` — same swap.

`ClientTenantContext.tsx` — row type drops booleans, adds `relationship_role`; SELECT updated; `isContact` derived from `relationship_role IN ('primary_contact','secondary_contact')`. Gating formulas (`canAccessClientPortal`, `canManagePortalUsers`) unchanged. **Closes BUG-004.**

`ClientTenantContext.test.tsx` — fixtures rekeyed to `relationship_role`; five-state coverage added (primary_contact, secondary_contact, user, academy_user, null). 8/8 tests green.

---

## KB changes shipped

No KB changes required — no existing KB doc describes the boolean/RR inconsistency or the consumer list.

---

## Codebase observations (read-only)

- `unicorn-cms-f09c59e5` @ `27ce35a8` (Phase 3 complete, all three phases merged to main).
- Migrations confirmed in `supabase_migrations.schema_migrations`: `20260512043150`, `20260512043447`.
- `_tenant_users_contact_backfill_20260512` backup table: 42 rows. **Drop after 30-day burn-in** (no earlier than 12 June 2026).

---

## Decisions

- `relationship_role` is now the canonical contact-role field on `tenant_users`. Booleans are derived mirrors, maintained by the trigger.
- `relationship_role IS NULL` rows (6) left for manual triage — not touched by the backfill.
- `trg_sync_secondary_contact` rewrite deferred — works correctly now that booleans are reliable.
- Legacy `role = 'parent'` importer path preserved in trigger NULL branch.

---

## Open questions parked

- **`pdp_cycles` tenant admin SELECT policy** — should be rekeyed from `primary_contact OR secondary_contact` to `relationship_role IN ('primary_contact','secondary_contact')` in a cleanup pass. Currently correct (booleans are now reliable mirrors) but carries a boolean dependency.
- **`TenantDetail.tsx:458` and `ClientDetail.tsx:200`** — display-only `.eq('secondary_contact', true)` queries. Correct post-backfill but should be migrated to `relationship_role = 'secondary_contact'` in a cleanup pass.
- **`trg_sync_secondary_contact`** — reads `secondary_contact = true` to mirror into `tenant_profile`. Works correctly post-backfill. Rekeying to `relationship_role = 'secondary_contact'` would eliminate the boolean dependency entirely; deferred.
- **`sync_primary_contact_on_role` — mutable search_path** — function body has no `SET search_path`. Remains in the P1-e list. Address in the P1-e Lovable session alongside the other 27 functions.
- **`_tenant_users_contact_backfill_20260512`** — drop no earlier than 12 June 2026 once no rollback is needed.
- **6 NULL `relationship_role` rows** — identify which tenants/users these are and whether they should be backfilled to `'user'` or cleaned up.

---

## Tag

`audit-2026-05-12-contact-role-canonicalisation`
