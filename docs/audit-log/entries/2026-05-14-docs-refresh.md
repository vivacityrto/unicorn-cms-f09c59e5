# Audit: 2026-05-14 — Docs refresh (architecture doc drift)

**Trigger:** Drift-surfaced. The 8 May 2026 Deployment Readiness Audit (§3) identified the architecture documentation as mis-mapped to the live database — table-name spec vs reality differed across `clients`/`tenants`, `staff`/`profiles`, `client_assignments`/`tenant_csc_assignments`, etc. Audit flagged this as "the biggest indirect risk" because following the docs as written would produce duplicate parallel schemas.
**Author:** Carl
**Scope:** `unicorn-cms-f09c59e5` documentation surfaces only. No DB changes. No migrations. No production touches. Six plan-mode Lovable prompts (audit + 5 implementation), 25 file changes.

---

## Findings

- **There is no single "architecture document" in the repo.** The drift the 8 May audit flagged lives across `sql-setup/` (12 SQL files + README), `CONTRIBUTING.md`, `docs/EOS_LEVEL10_SPECIFICATION.md`, `docs/eos/*.md`, and a constellation of smaller docs. Memory (`mem://`) is the de facto canonical source; the on-disk docs are the drift surface. Decision recorded: memory remains canonical, docs are corrected to fact, no new `docs/ARCHITECTURE.md` introduced.
- **`sql-setup/02-tenant-functions.sql` was the highest indirect risk in the codebase.** It defined `is_vivacity()`, `is_superadmin()`, `current_tenant()` — none exist in production. A contractor running the bootstrap as documented would have created parallel helpers and silently bypassed live RLS. Renamed to `.HISTORICAL.sql` so `psql -f` of the original path now 404s.
- **`CONTRIBUTING.md` "PKs: UUID; never incremental" rule actively contradicted memory.** Corrected: `bigint` identity default for new tenanted tables; `tenant_id` always `bigint`; `uuid` only for `auth.users` links and external integration IDs.
- **EOS RLS consolidation is partial, not complete, against `eos_rocks`/`eos_issues`/`eos_headlines`.** Pre-flight against `pg_policies` showed 2 SELECT policies still present on these three tables. Doc footnote phrased as "partially achieved; remaining parallel policies will be collapsed in a follow-up" rather than overstating to match the 8 May audit's "fully consolidated" framing.
- **`public.user_client_access` does not exist** — `docs/EOS_LEVEL10_SPECIFICATION.md` §8.5.2 invented it. Reframed the entire subsection as `DEPRECATED — design-only, not implemented`; canonical viewer-access path goes through `tenant_users` + role classification, not a parallel access table.
- **Helper-existence assumption was wrong.** My Prompt 5 pre-flight assumed `has_eos_role` and `can_facilitate_eos` did not exist. Lovable's pre-flight confirmed both ship live, with signatures `has_eos_role(uuid, bigint, eos_role)` and `can_facilitate_eos(uuid, bigint)`. Prompt 6 corrected the now-misleading "does not exist" wording introduced by Prompt 4.
- **EOS §3 DDL has its own tech debt** (`eos_rocks.client_id UUID REFERENCES clients_legacy(id)` — live FK target mixed with the bigint/uuid PK question). Deferred to a separate scoped prompt with `\d+ public.eos_rocks` + `pg_constraint` confirmation rather than risk silent DDL doc edits.
- **`docs/stage-registry.md`, `docs/client-portal/data-access-checklist.md`, `docs/INVITE_USER_DIAGNOSTICS.md`, `docs/training-gov-au-integration.md`, and `MAILGUN_SETUP.md`** were all scoped as Prompt 6 candidates but pre-flight found no real drift — either already correct, or the audit's recommended content was speculative and didn't match the files. Skipped rather than manufacturing edits to fit the audit's estimate.

---

## KB changes shipped

None. Memory was confirmed as canonical and untouched.

---

## Codebase observations (read-only)

`unicorn-cms-f09c59e5` — six plan-mode prompts produced commits between `7889f3f7` and `267b97ef`. All commits are gpt-engineer-app[bot] Lovable apply commits, no manual edits. Specific commits:

- `7889f3f7` — Prompt 2: `sql-setup/` deprecation (14 files; 1 rename)
- `9f310d3c` — Prompt 3: `CONTRIBUTING.md` Database Conventions rewrite
- `6fe27380` — Prompt 4: `docs/EOS_LEVEL10_SPECIFICATION.md` (5 edits; §3 DDL deferred)
- `19e38db8` — Prompt 5: EOS satellite docs (`eos-audit-report.md`, `eos-test-matrix.md`, `eos/phase-3.md`)
- `109eeee9` — Prompt 6: README slug, SUPABASE_SETUP preview URL, EOS §5.2/§8.5.1 cleanup, `.lovable/backlog.md` archive

Intervening `Update plan` commits are Lovable scratchpad churn, not in-scope edits.

No migrations applied. No DB objects touched. Live Supabase project `yxkgdalkbrriasiyyrwk` unchanged.

---

## Decisions

- **Memory (`mem://`) is canonical.** Docs are corrected to fact; no parallel `docs/ARCHITECTURE.md` introduced.
- **`sql-setup/` deprecation strategy: banner + rename, not delete or archive-move.** Preserves git history and external link integrity; rename only the one file that could damage production if re-run.
- **No parallel helpers.** Document each live helper by its actual signature. No proposals to rename live helpers to match older doc names.
- **Custom Knowledge scope: durable rules only.** Table catalogues drift; rules don't. CK gets RLS pattern, `(select auth.uid())` wrap, `SET search_path = ''`, `security_invoker = true`, no legacy anon JWT, no Prisma, no secrets in `VITE_`. Table-naming mapping stays in audit + memory, not in CK.
- **`tenant_users` remains canonical** for tenant membership counts despite row-count inversion vs `tenant_members` (785 → 457; 808 → 811). Verified post-cleanup orphan count = 0; the drop is the 9 May FK cleanup landing, not data loss.
- **EOS §3 DDL doc fix deferred** to a separate scoped prompt with fresh schema confirmation.

---

## Open questions parked

- **EOS RLS dedup follow-up** — `eos_rocks`, `eos_issues`, `eos_headlines` each still carry 2 SELECT policies. Needs its own DB session, not a docs prompt.
- **EOS §3 DDL doc fix** — `eos_rocks.client_id` / `eos_issues.client_id` FK targets vs the bigint/uuid PK question. Needs `\d+ public.eos_rocks` + `pg_constraint` confirmation up front.
- **README.md L65 residual** — third slug occurrence missed by Lovable's pre-flight (Prompt 6 reported "2 occurrences" but file has 3). Cosmetic; one-line follow-up.
- **Migration 1 stale-path comment** (`supabase/migrations/20251127225243_*.sql:1`) — harness-restricted, not applied. Comment still references `sql-setup/02-tenant-functions.sql` (the renamed file). Cosmetic; the file still exists at the new `.HISTORICAL.sql` path so the comment is misleading but not breaking.
- **Remaining 8 May audit items** outside the doc workstream: consult tables consolidation, `tenant_rto_scope_staging` RLS-no-policy, `pg_net` schema move, admin Edge Function `verify_jwt = false` audit, legacy `audit_log` table drop, 457 anon+SECURITY DEFINER functions triage. These were always out of scope for the doc refresh.

---

## Tag

`audit-2026-05-14-docs-refresh`
