# Audit: 2026-05-14 — `_tenant_users_contact_backfill_20260512` RLS enable + deny-all

**Trigger:** Drift-surfaced. Supabase advisor flagged `public._tenant_users_contact_backfill_20260512` for "table is public, but RLS has not been enabled" — a `public.*` table reachable via PostgREST with no row-level controls. Not on the 8 May audit queue (the table didn't exist yet — it was created 12 May during contact-role-canonicalisation as a pre-backfill snapshot). This is the third deny-all + COMMENT closure shipped today, cementing the pattern as the convention for "locked-down temp/forensic tables in public".
**Author:** Carl
**Scope:** Single migration: 1 `COMMENT ON TABLE` + 1 `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` + 2 `CREATE POLICY` (deny-all for `authenticated`, deny-all for `anon`). Table stays in `public`. The COMMENT also records the canonical drop date (`DROP AFTER 2026-06-12`). No frontend / edge function / RPC / view / trigger / cron / docs changes.
**Supabase project:** `yxkgdalkbrriasiyyrwk` — Unicorn 2.0-dev (ap-southeast-2)

---

## Findings

- **The table is the rollback safety net from the 12 May contact-role-canonicalisation session.** 42 rows captured the pre-state of `tenant_users` boolean columns (`primary_contact`, `secondary_contact`) before Phase 2 + Phase 2b backfills corrected drift against the canonical `relationship_role` field. Schema is intentionally minimal: `id bigint, primary_contact boolean, secondary_contact boolean, captured_at timestamptz` — just enough to reverse the UPDATEs row-by-row if needed. Source audit: [`audit/2026-05-12-contact-role-canonicalisation.md`](2026-05-12-contact-role-canonicalisation.md).
- **The 30-day burn-in lifecycle is already documented.** Line 93 of the source audit explicitly says *"Drop after 30-day burn-in (no earlier than 12 June 2026)."* Today is 14 May — still 29 days into burn-in. So this audit does NOT drop the table; it just locks it down for the burn-in period.
- **The lint is real, not a false positive.** `public` is PostgREST-exposed. The underscore-prefix naming convention `_tablename_purpose_YYYYMMDD` signals "internal" to humans but means nothing to PostgREST. RLS-off in `public` is genuinely reachable by anon/authenticated clients with table grants. The COMMENT + RLS enable + deny-all policies close the gap until the burn-in completes and the table is dropped.
- **Third reuse of the deny-all + COMMENT pattern this session, third independent context.** Cements the convention:
  - **`tenant_rto_scope_staging`** (`public`, active staging buffer for tga-rto-sync edge function, service-role-only by design)
  - **`unicorn1."U1_XeroURL"`** (`unicorn1`, frozen Unicorn 1.0 backfill source, schema-USAGE-denied + RLS deny defense-in-depth)
  - **`_tenant_users_contact_backfill_20260512`** (`public`, 30-day burn-in snapshot from a recent backfill)
  Three different reasons for the table's existence; same closure pattern works for all three. Worth a pinned/conventions.md note as a recurring KB entry.
- **The `DROP AFTER 2026-06-12` line in the COMMENT is doing real work.** Anyone who happens upon this table after the burn-in window will find the SQL itself telling them what to do next. Avoids the situation where a deferred drop becomes a forever-orphan.

---

## DB changes shipped

Single migration applied via Lovable:

```sql
COMMENT ON TABLE public._tenant_users_contact_backfill_20260512 IS
  'Pre-backfill snapshot from contact-role-canonicalisation
   session (2026-05-12). 42 rows of (id, primary_contact,
   secondary_contact, captured_at) backing the Phase 2 +
   Phase 2b UPDATEs that fixed boolean/relationship_role drift.
   No application read path. DROP AFTER 2026-06-12 (30-day
   burn-in from backfill date). See
   unicorn-audit/audit/2026-05-12-contact-role-canonicalisation.md.';

ALTER TABLE public._tenant_users_contact_backfill_20260512
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_authenticated"
  ON public._tenant_users_contact_backfill_20260512
  FOR ALL TO authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY "deny_anon"
  ON public._tenant_users_contact_backfill_20260512
  FOR ALL TO anon
  USING (false) WITH CHECK (false);
```

**Verification (live, post-apply):**

```
rls_enabled              → true ✅
policy_count             → 2 ✅
deny_authenticated       → ALL TO={authenticated} qual=false check=false ✅
deny_anon                → ALL TO={anon} qual=false check=false ✅
comment_drop_date_line   → present (verified contains "DROP AFTER 2026-06-12") ✅
still_in_public          → 1 (not moved) ✅
advisor lint             → cleared (per Lovable)
```

Rollback: 4-statement template captured in the migration's comment header (DROP both policies + DISABLE RLS + COMMENT NULL).

---

## KB changes shipped

None this session. Worth a follow-up pinned/conventions.md note codifying the three-precedent "deny-all + COMMENT" pattern — see Open questions.

---

## Codebase observations (read-only)

`unicorn-cms-f09c59e5` at session start was on `2ec20216`. No codebase commits — single Supabase migration only. `types.ts` unaffected (the underscore-prefixed table presumably isn't in the auto-generator's emit set, or if it is, RLS state doesn't affect type generation).

---

## Decisions

- **Lock down, don't drop early.** The canonical 30-day burn-in lifecycle is intentional risk discipline — don't undercut it for advisor-lint convenience.
- **Deny-all over admin-readable.** Same reasoning as the two other deny-all closures this session: no client-side debug value; if anyone needs to inspect the snapshot during burn-in, SQL editor with service_role is the right tool.
- **Two separate policies, one per role.** Matches the morning's `tenant_rto_scope_staging` and `unicorn1."U1_XeroURL"` shapes exactly.
- **`DROP AFTER 2026-06-12` baked into the COMMENT.** Functional documentation of the lifecycle — not just a calendar reminder somewhere, the SQL itself tells the next reader what to do.

---

## Open questions parked

- **`pinned/conventions.md` note** for the deny-all + COMMENT pattern. Three precedents now (tenant_rto_scope_staging, U1_XeroURL, this one). Pattern: "for `public.*` or `unicorn1.*` tables that are locked-down temp/forensic/staging buffers, enable RLS + add `deny_authenticated` + `deny_anon` policies with `USING (false) WITH CHECK (false)` + COMMENT ON TABLE documenting the role and (where applicable) the drop date." Worth a small KB addition.
- **2026-06-12 drop reminder.** This audit gives the table a deny-all lock but does NOT drop. The drop is still owed on/after 2026-06-12 per the source audit's lifecycle. Worth a `/schedule` reminder or calendar item.
- **8 May audit residuals remaining**: consult tables consolidation, `pg_net` schema move, admin Edge Function `verify_jwt` audit, README L65 slug fix.

---

## Tag

`audit-2026-05-14-tenant-users-contact-backfill-rls`
