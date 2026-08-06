# Audit: 2026-05-14 — `unicorn1."U1_XeroURL"` RLS deny-all + comment

**Trigger:** Drift-surfaced. 8 May 2026 Deployment Readiness Audit flagged `unicorn1."U1_XeroURL"` as the second of two P2 "RLS-on-no-policy" lints (the first, `public.tenant_rto_scope_staging`, was closed earlier this session). Pre-verification confirmed the table is genuinely legacy: 122 frozen rows, consumed once by migration `20260228063003` (Feb 2026) into `public.tenants.xero_contact_url`, never read by application code since. This session closes the lint with the **minimum-touch** path — adding deny-all policies + a `COMMENT ON TABLE` in place — after an archive-move plan was rejected mid-flight following Lovable's pre-flight pushback.
**Author:** Carl
**Scope:** Single migration: 1 `COMMENT ON TABLE` + 2 `CREATE POLICY` statements on `unicorn1."U1_XeroURL"`. Table stays in `unicorn1`; RLS already on, kept on. No schema move. No frontend changes. No other table touched.
**Supabase project:** `yxkgdalkbrriasiyyrwk` — Unicorn 2.0-dev (ap-southeast-2)

---

## Findings

- **The table is genuinely legacy.** 122 rows, frozen since Feb 2026 initial load. Consumed by exactly one migration (`20260228063003_*`) that backfilled `public.tenants.xero_contact_url`. `pg_stat_user_tables` shows 122 inserts, 0 updates, 0 deletes, and 44 total reads — all attributable to that one backfill plus subsequent forensic audit queries (including ~5 from this session's investigation). Zero application read paths.
- **The initial archive plan was wrong.** Earlier this session we archived `public.audit_log` to `archive` because it was a 0-row orphan in the active app schema. By momentum, the next prompt proposed the same move for `U1_XeroURL`. Pre-flight pushback from Lovable surfaced two factual errors that invalidated the move:
  - **`authenticated` has USAGE on `archive`**, while `unicorn1` has USAGE denied for all client-facing roles. Moving to archive would have *downgraded* defense-in-depth (from schema-USAGE-denied + RLS-on, to schema-USAGE-granted + RLS-on-with-policies).
  - **6 of 7 existing archive.* tables have RLS on with policies**, not RLS off as the audit prompt claimed. The "match the archive schema's posture by disabling RLS" framing was based on a factually wrong premise.
- **`unicorn1` is itself a legacy holding schema with stronger access protection than `archive`.** Schema-USAGE is denied for `anon`, `authenticated`, and `service_role`. The schema-grant denial is the existing security gate; per-table RLS layers on top. Moving to archive would have swapped a two-layer defense for a one-layer defense, gaining nothing meaningful in exchange — the semantic distinction between "Unicorn 1.0 snapshot" (unicorn1) and "finished one-shot backfill source" (would-be archive) is real but is not a convention the codebase otherwise establishes.
- **The minimum-touch closure is honest and minimal.** Add two deny-all policies + a COMMENT in place. Closes the advisor lint. Preserves the schema-USAGE denial. Documents the table's role for forensic-only access. Doesn't introduce a new sub-convention.
- **The momentum-reflex was the bug.** The morning's `audit_log` archive set a pattern that the next two prompts (`tenant_rto_scope_staging` deny-all earlier today, and the initial `U1_XeroURL` archive proposal) reached for too quickly. Lovable's pushback on the `U1_XeroURL` archive plan caught it before it shipped; the user's "wait, why are we archiving this again?" challenge caught the deeper issue (that the move's value proposition was unclear in the first place).

---

## DB changes shipped

Single migration applied via Lovable:

```sql
COMMENT ON TABLE unicorn1."U1_XeroURL" IS
  'Legacy Unicorn 1.0 source for Xero contact URLs. Consumed
   by migration 20260228063003 (Feb 2026), which backfilled
   122 rows into public.tenants.xero_contact_url. Frozen since;
   no application read path. Defense-in-depth: schema-USAGE
   denied for anon/authenticated/service_role; these per-table
   deny-all policies layer on top.';

CREATE POLICY "U1_XeroURL_deny_authenticated"
  ON unicorn1."U1_XeroURL"
  FOR ALL TO authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY "U1_XeroURL_deny_anon"
  ON unicorn1."U1_XeroURL"
  FOR ALL TO anon
  USING (false) WITH CHECK (false);
```

**Verification (live, post-apply):**

```
still_in_unicorn1                  → 1 ✅
not_in_archive                     → 0 ✅
policy_count                       → 2 ✅
U1_XeroURL_deny_authenticated      → ALL TO={authenticated} qual=false check=false ✅
U1_XeroURL_deny_anon               → ALL TO={anon} qual=false check=false ✅
comment_first_60                   → "Legacy Unicorn 1.0 source for Xero contact URLs. Consumed" ✅
RLS-on-no-policy advisor lint      → cleared (per Lovable)
```

Rollback: 3-statement template captured in the migration's comment header (DROP both policies + COMMENT NULL).

---

## KB changes shipped

None.

---

## Codebase observations (read-only)

`unicorn-cms-f09c59e5` at session start was on `2ec20216`. No codebase commits — single Supabase migration only. `types.ts` unaffected (policies do not surface in generated types).

`unicorn1` schema's broader posture (for the audit record):
- 43 tables total; only `U1_XeroURL` had RLS on (now also has policies)
- All other tables have RLS off
- Schema-USAGE denied for `anon`, `authenticated`, `service_role`
- Frontend reference at `src/components/InviteUserDialog.tsx:186` uses `.schema('unicorn1').from('users')` despite the USAGE denial — must go through a SECURITY DEFINER RPC or edge function under the hood. Worth a separate investigation but not blocking.

---

## Decisions

- **In-place policies over schema move.** Archive would have downgraded defense-in-depth without contributing to the lint closure (which is achieved by policies, not by schema). Minimum-touch wins.
- **Deny-all over admin-readable.** Same reasoning as the morning's `tenant_rto_scope_staging` closure: no client-side debug value for frozen legacy data. Service-role still bypasses RLS for forensic SQL access if ever needed.
- **Two separate policies, one per role.** Matches the morning's `tenant_rto_scope_staging` shape exactly. A single combined `TO authenticated, anon` policy would have been equivalent functionally but less explicit.
- **`COMMENT ON TABLE` included.** Documents the legacy role and the defense-in-depth design so the next investigator doesn't have to retrace.

---

## Open questions parked

- **`InviteUserDialog.tsx:186` schema-USAGE mystery.** Frontend writes to `unicorn1.users.mapped_user_uuid` even though `authenticated` has no USAGE on `unicorn1`. Must go through a SECURITY DEFINER path; worth confirming for completeness but not security-blocking (the deny-by-default posture means the call would fail loudly if the SECURITY DEFINER path is missing).
- **8 May P2 residuals remaining**: consult tables consolidation, `pg_net` schema move, admin Edge Function `verify_jwt` audit, README L65 slug fix.
- **Defense-in-depth pattern worth a KB note.** Two tables now use the `schema-USAGE-denied + per-table-RLS-deny-all` pattern (unicorn1.U1_XeroURL via this audit; the broader unicorn1.* schema implicitly). And one uses `schema-USAGE-granted + per-table-RLS-deny-all` (tenant_rto_scope_staging from this morning's audit). Briefly worth documenting when these patterns apply.
- **Momentum-reflex lesson.** Three closures in one session followed similar patterns — archive-move (audit_log), deny-all-in-place (tenant_rto_scope_staging), then this. The momentum suggested "archive again" by reflex; pre-flight pushback caught it; the user's explicit "why?" challenge surfaced the deeper question. Pattern-matching is useful for speed but needs deliberate audit-the-justification checks especially as a session goes long.

---

## Tag

`audit-2026-05-14-u1-xerourl-rls`
