# Audit: 2026-05-13 — P1-b RLS `auth.uid()` subquery hardening

**Trigger:** P1-b from the 12 May 2026 deployment status audit — all RLS policies in the public schema using bare `auth.uid()` rather than `(SELECT auth.uid())`. Without the subquery form, Postgres may re-evaluate `auth.uid()` per qualifying row despite its `STABLE` marking. The subquery form forces single evaluation per query.
**Author:** Carl
**Scope:** All `public` schema RLS policies containing bare `auth.uid()`. Zero access-rule changes — pure performance hardening throughout. Non-public schemas not in scope.
**Supabase project:** `yxkgdalkbrriasiyyrwk` — Unicorn 2.0-dev (ap-southeast-2)

---

## Background

The 12 May 2026 deployment status audit flagged that the majority of RLS policies were using bare `auth.uid()` calls, which can result in per-row re-evaluation in qualifying scans. The fix pattern is mechanical: replace `auth.uid()` with `(SELECT auth.uid())` in every USING and WITH CHECK expression. No access rules change — the subquery evaluates to the same value, just once per query rather than once per row.

The session ran across two Claude Code context windows. The full-schema starting count before any P1-b work began was not captured in this audit (an earlier partial session had applied some batches), but verified counts are recorded per batch below.

**Interaction with P1-a:** The P1-a EOS SELECT policy deduplication (also 13 May) had already rewritten all consolidated `eos_*` policies using `(SELECT auth.uid())` form. When P1-b reached the `e%` prefix, `eos_meeting_*`, `eos_qc_*`, `eos_rocks`, `eos_todos`, `eos_vto` etc. were already clean — only 15 policies across 5 non-eos `e%` tables remained (`evidence_*`, `excel_*`, `exec_*`).

---

## Verdict

**Closed — zero bare `auth.uid()` calls remain in any `public` schema RLS policy.**

---

## Findings

### Batch summary

| Batch | Tables | Policies hardened | Migration file |
|-------|--------|-------------------|----------------|
| B+C1 | 9 | 31 | `p1b_rls_auth_uid_subquery_bc1.sql` |
| C1b | 39 | 91 | `p1b_rls_auth_uid_subquery_c1b.sql` |
| C2 | 23 | 58 | `p1b_rls_auth_uid_subquery_c2.sql` |
| D | 45 | 69 | `p1b_rls_auth_uid_subquery_d.sql` |
| E1 (e% < eos_m) | 18 | 54 | `p1b_rls_auth_uid_subquery_e1.sql` |
| E2 (evidence*, excel*, exec*) | 5 | 15 | `p1b_rls_auth_uid_subquery_e2.sql` |
| G+H+K+L | 14 | 37 | `p1b_rls_auth_uid_subquery_ghkl.sql` |
| M1 (meeting_action* – meeting_notes) | 7 | 21 | `p1b_rls_auth_uid_subquery_m1.sql` |
| M2 (meeting_participants – momentum*) | 13 | 37 | `p1b_rls_auth_uid_subquery_m2.sql` |
| O | 4 | 14 | `p1b_rls_auth_uid_subquery_o.sql` |
| D straggler (dd_meeting_type) | 1 | 1 | `p1b_rls_auth_uid_subquery_d_straggler.sql` |
| **Total** | **—** | **428** | |

### Generation method

A 3-step `regexp_replace` CTE was used for all batches to avoid double-wrapping any policies already using `(SELECT auth.uid())`:

1. Protect existing subquery form: replace `(\s*SELECT\s+auth.uid()\s*)` → `__AUID__`
2. Replace remaining bare `auth.uid()` → `(SELECT auth.uid())`
3. Restore placeholder: `__AUID__` → `(SELECT auth.uid())`

A `changed` CTE filtered to only rows where `new_qual IS DISTINCT FROM qual OR new_with_check IS DISTINCT FROM with_check`, ensuring only genuinely affected policies were emitted.

### D straggler

`dd_meeting_type_admin` appeared in the full-schema final check after all prefix batches had been applied. It was caught by the final verification query and fixed in a single-policy follow-up migration. Likely added to the schema in a migration that ran concurrently with the P1-b session.

### Batches split for size

`b%+c%`, `e%`, and `m%` exceeded the MCP inline result limit and were split on tablename boundaries before generating migration SQL:
- `b%+c%` → B+C1 (`< 'client'`) and C1b+C2 (`>= 'client'`, two further splits)
- `e%` → E1 (`< 'eos_m'`) and E2 (remaining — only 15 policies after P1-a cleanup)
- `m%` → M1 (`< 'meeting_p'`) and M2 (`>= 'meeting_p'`)

### P1-c status (out of scope, noted)

5 `consult_*` tables were excluded from P1-b — they are actively queried by Ask Viv edge functions and cannot be touched until corresponding codebase changes are made. P1-c remains blocked.

---

## DB changes shipped

11 migrations applied via Lovable (migration file names listed in batch summary above). All were DROP + CREATE pairs within the same migration file — no transactional wrapper added (Lovable applies migrations in a transaction by default).

**Final verification (live `pg_policies` query):**

```sql
SELECT left(tablename, 1) AS prefix, COUNT(*) AS remaining_policies
FROM pg_policies WHERE schemaname = 'public'
  AND ((qual ~ 'auth\.uid\(\)' AND qual !~ '\(\s*SELECT\s+auth\.uid')
       OR (with_check ~ 'auth\.uid\(\)' AND with_check !~ '\(\s*SELECT\s+auth\.uid'))
GROUP BY left(tablename, 1) ORDER BY left(tablename, 1);
-- Result: 0 rows ✅
```

---

## KB changes shipped

None. The `(SELECT auth.uid())` convention is already documented in `unicorn-kb/pinned/conventions.md`.

---

## Codebase observations (read-only)

- All policy changes were applied directly to the Supabase project via Lovable-generated migrations. No frontend or edge function code was modified.
- `consult_*` tables are referenced in Ask Viv edge functions — confirmed as the blocking reason for P1-c. Exact function names not inspected this session.

---

## Decisions

- Bare `auth.uid()` → `(SELECT auth.uid())` applied uniformly with no exceptions (other than P1-c blocked tables, which are not yet touched).
- Existing `(SELECT auth.uid())` expressions were protected before substitution — no double-wrapping occurred.
- `dd_meeting_type` straggler handled in a separate final migration rather than being retrofitted into the D batch, to keep each migration's scope clean and verifiable.

---

## Open questions parked

- **P1-c (consult_* tables):** 5 tables excluded — blocked on codebase changes to Ask Viv edge functions. Separate session required once the function bodies are updated.
- **P1-e-ii (function body audit):** 28 functions may use `SET search_path = 'public'` rather than the hardened `SET search_path = ''` form. Body audit not yet conducted.
- **Helper function internals:** `has_any_eos_role`, `is_meeting_participant`, `get_current_user_tenant`, `is_vivacity_team_user` and similar SECURITY DEFINER helpers called from these policies may themselves contain bare `auth.uid()` internally. This is a separate function-body audit item (related to P1-e-ii).

---

## Tag

`audit-2026-05-13-p1b-rls-auth-uid-subquery`
