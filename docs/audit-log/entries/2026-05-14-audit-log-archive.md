# Audit: 2026-05-14 — Archive legacy `audit_log` + `log_user_change()`

**Trigger:** Drift-surfaced. 8 May 2026 Deployment Readiness Audit flagged `public.audit_log` as P0 ("wrong shape" — 0 rows, user/field-level columns instead of a system-wide privileged-action ledger). The 14 May docs refresh and the `v_workspace_audit_log` federation work (20-source UNION) documented `audit_log` as deprecated. This session closes the residual by moving the table and its broken orphan trigger function to the `archive` schema, consistent with the enum-to-dd workstream's archive-not-drop precedent.
**Author:** Carl
**Scope:** Two `ALTER … SET SCHEMA archive` statements in a single migration. Table `public.audit_log` and function `public.log_user_change()` both moved. No data migration (0 rows). No frontend changes (types.ts auto-regenerates). No RLS or policy changes elsewhere. No other audit-related table touched.
**Supabase project:** `yxkgdalkbrriasiyyrwk` — Unicorn 2.0-dev (ap-southeast-2)

---

## Findings

- **`public.audit_log` is unambiguously dead.** 0 rows since inception. RLS enabled with 3 policies (`audit_log_insert`, `audit_log_sa_all`, `audit_log_select`) that have never matched a row. Zero incoming FKs. Zero triggers. Zero references from any other public function (except its own orphan writer). Zero references from `supabase/functions/`. Zero direct writes from `src/` (only `src/integrations/supabase/types.ts:5313` declares the schema — auto-regenerates post-move).
- **`public.log_user_change()` is both orphan and broken.** SECURITY DEFINER trigger function intended to fire `BEFORE UPDATE` on `public.users` and INSERT a row per changed field into `audit_log`. Verified live: NOT bound to any table (`pg_trigger` empty for this function). Also broken: body references column `changed_by`; actual column is `editor_uuid`. Would error on every fire even if attached. The function explains why `audit_log` has 0 rows — its only intended writer was never attached, and if it had been, would have failed at runtime.
- **Archive over drop, per project precedent.** The enum-to-dd workstream (Phase 1B-C, 1C-C, 2) consistently archived deprecated objects to the `archive` schema rather than dropping. The archive schema already holds `users_tenant_role_legacy`, plus 5 `backup_*` tables. Same pattern applied here. Reversible via single `ALTER … SET SCHEMA public` per object.
- **`ALTER TABLE … SET SCHEMA` carries policies + indexes + owned sequence + outgoing FKs.** Verified via Postgres docs (*"Indexes and table constraints associated with the table are moved as well"*) and live: post-move, `archive.audit_log` retained the 3 RLS policies, the `audit_log_id_seq` sequence, and TWO outgoing FKs to `public.users.user_uuid` (one on `editor_uuid`, one on `user_uuid` — both cross-schema, both valid). The pre-flight audit only mentioned the `editor_uuid` FK; live verification surfaced both. Cosmetic completeness; no issue.
- **The archive-the-broken-orphan-function decision is consistent.** Dropping the function while archiving the table would have left `archive.audit_log` with no historical writer reference — future investigators would find the schema but no context on how it was supposed to be populated. Archiving the function alongside preserves the broken-writer + dead-target pair, which is the honest historical record.

---

## DB changes shipped

Single migration applied via Lovable:

```sql
-- Header comment captured the full pre-apply verification (6 checks),
-- precedent cross-ref, rationale, and rollback template.

ALTER FUNCTION public.log_user_change() SET SCHEMA archive;
ALTER TABLE public.audit_log SET SCHEMA archive;
```

**Verification (live, post-apply):**

```sql
table_in_archive              → 1 ✅
table_gone_from_public        → 0 ✅
function_in_archive           → 1 ✅
function_gone_from_public     → 0 ✅
policies_on_archive_audit_log → audit_log_insert, audit_log_sa_all,
                                audit_log_select ✅
fk_count                      → 2 (both → public.users.user_uuid) ✅
```

Rollback: single `ALTER … SET SCHEMA public` statement per object, captured verbatim in the migration's comment header.

---

## KB changes shipped

None. The archive-over-drop pattern is already documented implicitly by the enum-to-dd Phase 1B-C / 1C-C / 2 audits; no convention update needed.

---

## Codebase observations (read-only)

`unicorn-cms-f09c59e5` at session start was on `2ec20216` (post-Scope-A frontend hotfix from the earlier session). No codebase commits during this session — only a Supabase migration. `src/integrations/supabase/types.ts` will auto-regenerate on the next Lovable session and lose the `audit_log` schema block (will not gain an `archive.*` block — the types generator emits `public` only by default).

---

## Decisions

- **Archive over drop.** Reversible, preserves history, consistent with project precedent.
- **Archive both table and function together.** Avoids the orphan-in-archive problem (`archive.audit_log` without a paired writer would be confusing for future investigators).
- **Single migration with two ALTER statements.** Function moved first (no dependencies on the table from outside the function body), table moved second (carries policies + indexes + sequence + FKs).
- **No RLS or policy changes.** The 3 policies on `audit_log` travel with the table. They will silently never fire from now on (nothing references `archive.audit_log` in app code or RLS). Acceptable on an archived table; not worth dropping separately.
- **No types.ts hand-edit.** Auto-regen handles the schema delta on the next Lovable session.

---

## Open questions parked

- **`SET search_path = ''` hardening sweep on EOS RPCs** — still parked; this session didn't expand scope to other functions.
- **8 May audit P2 residuals** — consult tables consolidation, `tenant_rto_scope_staging` RLS-no-policy, `pg_net` schema move, admin Edge Function `verify_jwt`, README L65 slug fix. Each is its own workstream.
- **Type generator + archive schemas** — worth noting for future reference: the Supabase types generator does NOT emit `archive.*` schemas by default. If anyone ever needs typed access to archived rows (forensics), that's a separate generator config question, not a schema question.

---

## Tag

`audit-2026-05-14-audit-log-archive`
