# Audit: 2026-05-14 — `tenant_rto_scope_staging` RLS deny-all + comment

**Trigger:** Drift-surfaced. 8 May 2026 Deployment Readiness Audit flagged `public.tenant_rto_scope_staging` as P2 ("RLS-on, no policies — if staging/legacy and not in active use, drop them; otherwise add explicit deny-all or read-only policies for clarity"). Read-only investigation confirmed the table is in active use — it's the transient staging buffer for the `tga-rto-sync` edge function, which writes via `SUPABASE_SERVICE_ROLE_KEY` (RLS-bypassing). So dropping was off the table; this session adds explicit deny-all policies for `authenticated` + `anon` plus a documenting `COMMENT ON TABLE`.
**Author:** Carl
**Scope:** Single migration: 1 `COMMENT ON TABLE` + 2 `CREATE POLICY` (deny-all for `authenticated`, deny-all for `anon`). No frontend changes. No edge function changes. No schema/data changes. Strict-semantics closure of the advisor lint.
**Supabase project:** `yxkgdalkbrriasiyyrwk` — Unicorn 2.0-dev (ap-southeast-2)

---

## Findings

- **The table is in active use, not legacy.** `supabase/functions/tga-rto-sync/index.ts` is the sole accessor — 4 references (1 comment + DELETE/INSERT/DELETE pattern at lines 553, 593, 619). Pattern is delete-existing-for-tenant → insert-batch → promote-to-final OR delete-on-error. Buffer rows exist for seconds during a sync; 0 rows in production today (no sync running). The 8 May audit's "if not in active use, drop them" path didn't apply; the "add explicit deny-all or read-only policies for clarity" path did.
- **Service-role bypass is the architectural intent, not an accident.** Migration `20260406002617_de1b3cfc-...` (April 2026) explicitly dropped a prior `tenant_rto_scope_staging_service_all` policy with the comment *"Service role bypasses RLS, so these policies are unnecessary"*. The team already relies on `BYPASSRLS` behaviour. The new deny-all policies cement this: anything that isn't `service_role` is locked out, full stop.
- **Strict deny-all over admin-readable.** Two options were considered: (a) explicit deny-all for `authenticated`/`anon`, or (b) admin SELECT policy via `is_super_admin()` for operational debugging. Chose (a) because staging-buffer debugging has no realistic client-side use case — rows exist for seconds, debugging happens via SQL editor with `service_role`. The deny-all framing matches what the codebase already implicitly does on this table.
- **The `COMMENT ON TABLE` is doing real work.** Without it, the next investigator finds a table with deny-all policies + zero rows and might assume it's dead. The comment explicitly states the service-role-only design and points at the edge function, saving a retrace of the same investigation we just did.
- **Pre-flight verification was unusually clean.** All 4 pre-flight checks passed with bonus internal citation (the April 2026 migration that already articulated the service-role-bypass reasoning). This is the cleanest closure shape for a P2 residual: small surface, clear intent, internal precedent.

---

## DB changes shipped

Single migration applied via Lovable:

```sql
COMMENT ON TABLE public.tenant_rto_scope_staging IS
  'Transient staging buffer for tga-rto-sync edge function.
   Service-role-only by design — RLS denies all authenticated/anon access.
   Rows exist for seconds during a sync (delete-existing → insert-batch → promote-to-final);
   no client-side read use case. See supabase/functions/tga-rto-sync/index.ts.';

CREATE POLICY tenant_rto_scope_staging_deny_authenticated
  ON public.tenant_rto_scope_staging
  FOR ALL TO authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY tenant_rto_scope_staging_deny_anon
  ON public.tenant_rto_scope_staging
  FOR ALL TO anon
  USING (false) WITH CHECK (false);
```

**Verification (live, post-apply):**

```
policy_count                                         → 2 ✅
tenant_rto_scope_staging_deny_anon                   → ALL TO={anon} qual=false check=false ✅
tenant_rto_scope_staging_deny_authenticated          → ALL TO={authenticated} qual=false check=false ✅
table_comment                                        → matches verbatim ✅
RLS-on-no-policy advisor lint                        → cleared (per Lovable) ✅
```

Rollback: 3-statement template captured in the migration's comment header:

```sql
DROP POLICY IF EXISTS tenant_rto_scope_staging_deny_authenticated ON public.tenant_rto_scope_staging;
DROP POLICY IF EXISTS tenant_rto_scope_staging_deny_anon ON public.tenant_rto_scope_staging;
COMMENT ON TABLE public.tenant_rto_scope_staging IS NULL;
```

---

## KB changes shipped

None.

---

## Codebase observations (read-only)

`unicorn-cms-f09c59e5` at session start was on `2ec20216`. No codebase commits — single Supabase migration only. `src/integrations/supabase/types.ts` unaffected (policies do not appear in generated types).

`supabase/functions/tga-rto-sync/index.ts` is the sole consumer of the table. Function creates exactly one Supabase client at line 11 using `SUPABASE_SERVICE_ROLE_KEY`. No fallback path, no JWT-forwarding, no alternate client construction. Service-role bypass is total.

---

## Decisions

- **Deny-all over admin-readable.** Staging buffers have no client-side debugging value; strict semantics match implicit intent.
- **`COMMENT ON TABLE` included.** Functional documentation prevents the next investigator from retracing the same scope-and-purpose questions.
- **Single migration with all three statements.** `COMMENT` + 2 `CREATE POLICY`; can't meaningfully split into phases.
- **No edge function changes.** Service-role bypass means policy additions have zero impact on the sync's write path. Three independent verifications: (a) function creates only one client, (b) `service_role` has `BYPASSRLS` per Supabase docs, (c) prior project migration already articulated this reasoning.

---

## Open questions parked

- **Other RLS-on-no-policy lints** — the 8 May audit listed 2 tables (`tenant_rto_scope_staging` + `unicorn1.U1_XeroURL`). The Unicorn 1.0 legacy table is separate and not in active use; that's the next P2 to close, likely via archive-to-`archive`-schema or drop (depending on whether `unicorn1.*` is preserved as a frozen reference).
- **8 May P2 residuals remaining**: consult tables consolidation, `pg_net` schema move, admin Edge Function `verify_jwt` audit, README L65 slug fix.
- **Pattern for service-role-only tables** — this is the second table in the codebase with explicit `BYPASSRLS` reliance (audit_log was the first, but it had broken policies; this is the first cleanly documented one). Worth a `pinned/conventions.md` note if the pattern recurs.

---

## Tag

`audit-2026-05-14-tenant-rto-scope-staging-rls`
