# Audit: 2026-05-14 — `eos_rocks.client_id` → `client_tenant_id` rename

**Trigger:** Drift-surfaced. The 14 May 2026 docs refresh audit closed the architecture-doc workstream but left "EOS §3 DDL doc fix" parked because the spec showed `eos_rocks.client_id UUID REFERENCES clients_legacy(id)` while live had `integer REFERENCES tenants(id)`. Investigation traced the mismatch back to migration `20260213055852` (13 Feb 2026), which had remodelled the column semantically (legacy client UUID → client tenant integer) without renaming it. The lexically misleading name had caused two prior audits to misread the schema (13 May 2026 P1-a EOS dedup; 14 May 2026 docs refresh). This rename closes the trap.
**Author:** Carl
**Scope:** `public.eos_rocks` column rename + FK rename + index rename + 2 RPC body updates + 5 hand-written frontend files + 5 documentation sites. No data backfill required (2 of 100 rows populated, both still resolve correctly via the renamed FK). `eos_issues.client_id` and `users.client_id` deliberately out of scope — both retain the pre-2026 UUID/`clients_legacy` model and form a separate parked workstream.
**Supabase project:** `yxkgdalkbrriasiyyrwk` — Unicorn 2.0-dev (ap-southeast-2)

---

## Findings

- **The misleading name was the bug.** `eos_rocks.client_id` (integer, FK to `tenants(id)`) is semantically a *second tenant_id* — pointing at the *client* tenant when a consultancy creates a Rock about a client. The two populated rows confirmed: `tenant_id=6372` (Vivacity Coaching & Consulting, the consultancy workspace) plus `client_id=7539` (Think Real Estate, the client tenant). The post-Feb-2026 model uses `tenants` for both consultancy and client workspaces; the legacy `clients_legacy` table is archived (11 rows).
- **`information_schema.constraint_column_usage` silently omits FKs across implicit type casts.** Initial query reported zero FKs on `eos_rocks.client_id`; `pg_constraint` showed `eos_rocks_client_id_fkey FOREIGN KEY (client_id) REFERENCES tenants(id)` exists. The `int4 → int8` implicit cast on the FK target trips up the information_schema view. **Always cross-check with `pg_constraint` for FKs that target a column of a different integer width.**
- **The Prompt 1 audit grep missed 4 frontend call sites.** "`eos_rocks` + `client_id` in same file" missed three sites that read `rock.client_id` from a destructured object without the `eos_rocks` literal nearby (`LiveMeetingView.tsx`, `RockProgressControl.tsx`, `ClientRocksList.tsx`) — surfaced by the build's type checker on apply. A fourth (`QuarterlyRocksSection.tsx` line 16, a local `Rock` interface) had no consumers in-file so TypeScript didn't catch it; surfaced by post-apply repo grep against `origin/main`. **Tightened heuristic for future renames: pair the type signature (`number | null`) with file-level proximity to the target table, and run a final repo-wide grep against `origin/main` (not the working tree) before declaring done.**
- **Two RPCs (`cascade_items(uuid[])` and `get_client_eos_overview(uuid)`) are silently broken since 13 Feb 2026** — their argument types are `uuid` / `uuid[]` against an `integer` column. Surfaced during Prompt 1 audit. Out of scope for this rename; parked as a separate "EOS RPCs unmigrated from clients_legacy" workstream.
- **`eos_issues.client_id` retains the pre-2026 UUID/`clients_legacy` model.** Was not part of the 13 Feb 2026 migration. 0 rows populated. Doc edits explicitly mark this as `(legacy, unmigrated)` to prevent the next reader assuming the rename was symmetric.
- **The 14 May 2026 docs-refresh `EOS_LEVEL10_SPECIFICATION.md` §5.2 footnote already correctly described `has_eos_role(uuid, bigint, eos_role)` as the live signature** — no doc edits needed to that part this session. The §3 DDL fix landed cleanly via this rename's docs Prompt.

---

## DB changes shipped

### Migration — `eos_rocks` column rename

Single migration applied via Lovable, equivalent to:

```sql
ALTER TABLE public.eos_rocks RENAME COLUMN client_id TO client_tenant_id;
ALTER TABLE public.eos_rocks RENAME CONSTRAINT eos_rocks_client_id_fkey TO eos_rocks_client_tenant_id_fkey;
ALTER INDEX public.idx_eos_rocks_client_id RENAME TO idx_eos_rocks_client_tenant_id;

-- CREATE OR REPLACE of both functions to rebind column references and the JSONB payload key:
--   public.upsert_rock_with_parenting(p_payload jsonb)
--   public.drop_rock_to_issue(p_rock_id uuid)
```

`ux_team_client_rock` partial unique index left unchanged (name already neutral; column reference inside the index definition auto-rewrote with the column rename). The `eos_rocks_client_viewer_select` RLS policy USING expression auto-rewrote inside `pg_policy.polqual` — verified post-migration via `pg_get_expr(polqual, polrelid)`.

**Verification (live):**

```sql
-- 4-check post-apply
column          → client_tenant_id                                   ✅
fk_constraint   → eos_rocks_client_tenant_id_fkey                    ✅
index           → idx_eos_rocks_client_tenant_id (+ ux_team_client_rock preserved) ✅
rls_policy_qual → has_tenant_access_safe((client_tenant_id)::bigint, …) ✅
```

The two populated rows (`tenant_id=6372, client_tenant_id=7539`) preserved exactly through the rename.

### Migrations parked

`cascade_items(p_target_client_ids uuid[], …)` and `get_client_eos_overview(p_client_id uuid)` — silently broken since 13 Feb 2026 due to uuid args vs integer column. Not touched in this session.

---

## KB changes shipped

None.

---

## Codebase observations (read-only)

`unicorn-cms-f09c59e5` — four plan-mode Lovable prompts produced commits across the rename. Apply commits, with intervening `Update plan` autocommits omitted:

- DB migration (Prompt 2) — Lovable apply commit; column / FK / index / RPC bodies. Verified via live MCP query rather than commit SHA.
- `56a90bbd` — Prompt 3 part 1: `src/types/eos.ts` L116
- `5ad93899` — Prompt 3 part 2: `LiveMeetingView.tsx`, `RockFormDialog.tsx`, `RockProgressControl.tsx`, `client/ClientRocksList.tsx`
- `8bdcda06` — Prompt 3 part 3: `QuarterlyRocksSection.tsx` L16 (audit-miss caught on `origin/main` verification)
- `192c48f2` — Prompt 4: `docs/EOS_LEVEL10_SPECIFICATION.md` 5 edit sites (L194, L327, L452, L671–673, L881)

`docs/eos-audit-report.md` not touched — Site F from the original Prompt 4 scope was discovered during Lovable's pre-flight to refer to `workspace_id`, not `client_id`, so the recommended edit was skipped.

Hand-written frontend files updated:

- `src/types/eos.ts` L116
- `src/hooks/useEosRocksHierarchy.tsx` L33
- `src/components/eos/RockFormDialog.tsx` L72, L130, L208, L231, L243, L301
- `src/components/eos/LiveMeetingView.tsx` L447
- `src/components/eos/RockProgressControl.tsx` L36 (read renamed; destination JSONB key `client_id` preserved because target is `eos_issues`, which retains the legacy model)
- `src/components/eos/client/ClientRocksList.tsx` L60
- `src/components/eos/flight-plan/QuarterlyRocksSection.tsx` L16 (audit miss)

`src/integrations/supabase/types.ts` auto-regenerated by Lovable post-migration; not hand-edited.

---

## Decisions

- **Rename, not silent doc-fix.** The misleading name had caused two prior audits to misread the schema. A doc-only fix would have left the trap in place.
- **JSONB payload key renamed in lockstep.** `upsert_rock_with_parenting` previously accepted `p_payload->>'client_id'`. The single in-repo caller (`RockFormDialog.tsx`) is updated in the same release; no external callers exist, so back-compat aliasing was not needed.
- **`v_client_id` local variable in `upsert_rock_with_parenting` preserved.** Only column references and the JSONB payload key were rebound; internal logic naming kept stable.
- **`ux_team_client_rock` index name preserved.** Already neutral — does not embed the column name.
- **`eos_issues.client_id` and `users.client_id` left on the legacy UUID model.** Different migration path; `eos_issues` has 0 rows so easy to migrate later if desired, but not in this session.
- **`cascade_items` and `get_client_eos_overview` parked.** Pre-existing breakage from the 13 Feb 2026 partial migration; not regressed by this rename, but flagged for separate workstream.
- **Three prompts kept separate (DB / types-frontend / docs)** rather than collapsed. Each independently revertible; cleaner git history; types regeneration drove the find-and-fix in the frontend.

---

## Open questions parked

- **EOS RPCs unmigrated from `clients_legacy` model** — `cascade_items(uuid[])` and `get_client_eos_overview(uuid)` carry uuid arg types against the now-integer column. Silently broken since 13 Feb 2026. Worth a focused audit + repair.
- **`eos_issues.client_id` migration to integer/`tenants` model** — 0 rows populated, would close the inconsistency, but the `eos_issues_client_viewer_select` RLS policy joins via `users.client_id` (still UUID). Migrating eos_issues requires either also migrating `users.client_id` or accepting a permanent split between the two access paths.
- **`information_schema.constraint_column_usage` blind spot** — worth a KB note under `pinned/conventions.md` so the next investigator doesn't waste a round on it.
- **`audit-miss` heuristic** — "type signature alone" is too broad; "type signature + file-level proximity to target table + final origin/main grep" is the tighter form. Worth folding into the lovable-production-db-change.md handoff under "post-apply verification."

---

## Tag

`audit-2026-05-14-eos-rocks-client-tenant-id-rename`
