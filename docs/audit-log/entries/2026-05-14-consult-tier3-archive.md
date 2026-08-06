# Audit: 2026-05-14 — Consult tables Tier 3 archive (`consult_entries` + `consult_logs_unmapped_quarantine`)

**Trigger:** Drift-surfaced. 8 May 2026 Deployment Readiness Audit P1 flagged five competing consultation tables — all empty — and recommended "pick canonical, deprecate the other four behind views". Pre-flight investigation this session revealed the situation is more nuanced than the audit framed: `consult_logs` is genuinely canonical (referenced by 5 production views), but the other 4 tables are not uniformly orphan — `consults` + `consult_time_entries` are still referenced by the `merge_tenants` SECURITY DEFINER function's defensive `v_tables` array. This session handles **Tier 3 only**: the two tables with zero live consumers anywhere (`consult_entries`, `consult_logs_unmapped_quarantine`). Tier 2 (the two referenced by `merge_tenants`) deferred to a future session that updates the function in lockstep.
**Author:** Carl
**Scope:** Single migration: 2 `COMMENT ON TABLE` + 2 `ALTER TABLE ... SET SCHEMA archive` statements. Policies, indexes, triggers, owned sequences, and outgoing FKs travel with the tables (cross-schema FKs to `public.*` are valid Postgres). No frontend / edge function / RPC / view / doc changes.
**Supabase project:** `yxkgdalkbrriasiyyrwk` — Unicorn 2.0-dev (ap-southeast-2)

---

## Findings

- **The consultation-tracking feature is half-built.** The Vivacity team designed a full pipeline (timer-driven granular time entries → daily/weekly rollups → billing summary → portfolio dashboard) and shipped the dashboard plumbing (the 5 views over `consult_logs`) but never built the time-entry UI. All 5 consult_* tables sit at 0 rows; only `consult_logs` is actively read (by 5 production views and `merge_tenants`). The dashboard correctly returns "0 hours" everywhere it would otherwise show consultation metrics.

- **`consult_entries` was the granular entry log.** Schema: `id uuid, client_id uuid, project_id uuid, task_id uuid, consultant_id uuid, minutes integer, notes text, created_at timestamptz`. Two `AFTER INSERT` triggers (`trg_consult_entries_audit` → `fn_log_audit`; `trg_consult_entries_rollup` → `trg_consult_rollup`) confirm: rows were intended to aggregate upward to a summary table. Predates the 6 Jan 2026 migration that hardened its RLS (`consult_entries_sa_all` SuperAdmin policy). The timer UI never shipped; 0 writes ever. The triggers never fired.

- **`consult_logs_unmapped_quarantine` was a failsafe.** Created 17 Feb 2026 by migration `20260217022250` as Phase 3 of a `consult_logs` tenant_id backfill. Phase 1 added `tenant_id` + `consultant_user_uuid` columns; Phase 2 backfilled `tenant_id` from a `v_client_to_tenant` bridge view; Phase 3 was meant to quarantine any rows that couldn't be mapped. Since `consult_logs` had 0 rows when the backfill ran, the failsafe table never received any quarantined data. It exists as a dead branch of a successful migration.

- **The Tier 3/Tier 2/Tier 1 breakdown is data-driven, not opinion-driven.** Live introspection:
  - **Tier 1 — `consult_logs`** (canonical): used by 5 views (`v_dashboard_tenant_portfolio`, `v_exec_consult_hours_7d`, `v_exec_alignment_signals_7d`, `v_tenant_last_activity`, `dashboard_client_snapshot`). Stays in `public`.
  - **Tier 2 — `consults` + `consult_time_entries`**: 0 views, but referenced by `merge_tenants`'s `v_tables` defensive array (~30 entries scanned during tenant merges; `EXCEPTION WHEN OTHERS` handler catches missing-table errors but produces confusing audit-impact JSON if they fire). Cleanest closure requires updating the function in the same session — deferred.
  - **Tier 3 — `consult_entries` + `consult_logs_unmapped_quarantine`**: 0 views, 0 functions, 0 edge functions, 0 hand-written frontend code paths. Truly orphan. Archived this session.

- **Both archive moves were genuinely safe.** Verified before applying:
  - 0 incoming FKs on either table
  - 0 hand-written code reads (only `src/integrations/supabase/types.ts` auto-generated entries)
  - 0 edge function references
  - 2 triggers on consult_entries are `AFTER INSERT` — fire only if rows are inserted; table has 0 rows and 0 writers; triggers have never fired and never will
  - 3 outgoing FKs on consult_entries point at tables that stay in `public` (cross-schema FKs are valid Postgres)
  - SuperAdmin-only RLS policies travel with both tables; `authenticated`'s USAGE on `archive` remains gated by those policies

- **User pushed back on "auto-pilot archive" — and we earned the move this time.** Earlier today the morning's `audit_log` archive set a momentum pattern that the user correctly challenged on `U1_XeroURL` ("why are we archiving this again?"). Same challenge applied here: "why archive vs drop?" Honest answer for these two specific tables: archive is consistent with the project's archive-not-drop precedent (`enum-to-dd workstreams`, `archive.audit_log`, `archive.backup_*` tables), preserves the schema shape for forensic reference (someone six months from now wondering "what was consult_entries supposed to be?" finds it), and the policies+triggers travel along so defense-in-depth is preserved. The "drop is more honest because it's empty" argument was real but lost to the consistency-with-precedent argument.

---

## DB changes shipped

Single migration applied via Lovable:

```sql
COMMENT ON TABLE public.consult_entries IS
  'Legacy/design-era consultation entries table. 0 rows since
   inception. No live consumers — no views, no functions, no
   frontend code reads or writes. Canonical consultation table
   is consult_logs (referenced by 5 production views). Archived
   per 8 May audit P1 consult tables consolidation.';

COMMENT ON TABLE public.consult_logs_unmapped_quarantine IS
  'Legacy/design-era quarantine table for un-mappable consult
   log imports — Phase 3 failsafe from migration 20260217022250.
   0 rows since inception (consult_logs had 0 rows when the
   backfill ran). No live consumers. Canonical consultation
   table is consult_logs. Archived per 8 May audit P1 consult
   tables consolidation.';

ALTER TABLE public.consult_entries SET SCHEMA archive;
ALTER TABLE public.consult_logs_unmapped_quarantine SET SCHEMA archive;
```

**Verification (live, post-apply):**

```
consult_entries_in_archive          → 1 ✅
consult_entries_gone_from_public    → 0 ✅
quarantine_in_archive               → 1 ✅
quarantine_gone_from_public         → 0 ✅
consult_entries_policies            → 1 ✅ (consult_entries_sa_all travelled)
quarantine_policies                 → 2 ✅ (quarantine_superadmin_select + _delete travelled)
consult_entries_triggers            → 2 ✅ (audit + rollup AFTER INSERT travelled)
consult_entries_outgoing_fks        → 3 ✅ (cross-schema FKs to public.* remain valid)
consult_entries_comment             → matches verbatim ✅
quarantine_comment                  → matches verbatim ✅
```

Rollback: 2-statement template captured in the migration comment header.

---

## KB changes shipped

None. The archive-not-drop pattern is already implicitly documented across the enum-to-dd workstream and today's audit_log archive. The deny-all + COMMENT pattern shipped to KB earlier today (`pinned/conventions.md → Tables that should be locked down`).

---

## Codebase observations (read-only)

`unicorn-cms-f09c59e5` at session start was on `2ec20216`. No codebase commits — single Supabase migration. `types.ts` will auto-regenerate on the next Lovable session and lose the two table blocks from `public`. `archive.*` is not emitted by the type generator, so the types just disappear silently. No TypeScript code references either table type, so no compile errors.

---

## Decisions

- **Tier 3 only this session.** Tier 2 (`consults` + `consult_time_entries`) requires updating `merge_tenants`'s `v_tables` array in the same migration to keep behaviour clean. That's a touch on a load-bearing SECURITY DEFINER function and deserves its own focused session.
- **Archive over drop.** Earned this time — consistent with project precedent, preserves the schema shape for forensics, policies+triggers travel along.
- **`COMMENT ON TABLE` before the schema move.** Documents what the table was for and how it became dormant; future readers see the context inline.
- **Triggers travel as harmless residual.** `AFTER INSERT` on a 0-row + 0-writer table never fires anywhere. Left as-is.

---

## Open questions parked

- **Tier 2 closure** — update `merge_tenants` to drop `consults` + `consult_time_entries` from the `v_tables` array, then archive (or drop) both tables. Worth its own scoped session.
- **The whole consultation-tracking feature** — `consult_logs` is canonical and ready to receive data, but no UI writes to it. The dashboard already plumbed for the feature. Worth a product conversation with Angela: is consultation-hour tracking still on the roadmap, or should the dashboard fields be removed too?
- **`scan-risk-radar`, `run-tenant-risk-forecast`, `run-retention-forecast`, and Ask Viv fact-builder files** — earlier grep showed they reference "consult"-prefixed names. Spot-checked and they reference the *derived metric* `consult_hours_30d` from `v_dashboard_tenant_portfolio`, not the source tables. Safe under this archive. Worth a note that any future Tier-1 (`consult_logs`) change would need to verify these consumers.

---

## Tag

`audit-2026-05-14-consult-tier3-archive`
