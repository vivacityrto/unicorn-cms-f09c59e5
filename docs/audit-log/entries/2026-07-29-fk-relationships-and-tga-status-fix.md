# Audit: 2026-07-29 — FK relationships and TGA status fix (direct migration)

**Trigger:** ad-hoc, surfaced during a full-app Playwright audit (SuperAdmin/Executive/Academy Builder + Internal Staff sections)
**Scope:** Fixed 4 confirmed DB bugs found during the audit, plus 2 more discovered mid-fix (hiding behind one of the original 4). Read-only investigation for 3 further findings (RLS 403s on 6 executive/strategic views, `get_user_audit`/`list_code_tables` errors, `handle_staff_first_login` 400) — root cause not fully isolated for those, no fix applied, no schema touched for them.

## Findings

- `tga_sync_status()` (PL/pgSQL, `SECURITY DEFINER`) referenced an unassigned `record` variable (`v_last_job`) whenever no TGA sync had ever run or the referenced job row was gone, raising `record "v_last_job" is not assigned yet` on every load of `/admin/integrations/tga`. Distinct from the already-known `l3_gate_tga_sync_cluster` auth.uid()-vs-service-role outage (a different bug in the *sync* RPC, not the *status* RPC fixed here).
- `compliance_pack_exports.tenant_id` (column present, no constraint) had no FK to `tenants` — PostgREST's embed syntax on `/admin/compliance-packs` had no relationship to resolve, 400ing.
- `stages.created_by` (column present, no constraint) had no FK to `public.users` — same failure mode on `/manage-stages`.
- `stage_release_reviews.reviewer_user_id` had an FK, but to `auth.users`, not `public.users` — the frontend's embed hint (`reviewer:users!stage_release_reviews_reviewer_user_id_fkey(first_name,last_name,email)`) needs `public.users` (has those columns; `auth.users` doesn't), so PostgREST couldn't resolve "users" through that constraint.
- Fixing the above exposed two more layers of the *same* `/admin/reviews` query: `stage_releases.stage_id` had an FK to the **deprecated** `documents_stages` table instead of the authoritative `stages` table (per `docs/stage-registry.md`), and `stage_releases.tenant_id` had no FK to `tenants` at all. Both fixed in follow-up migrations the same session. `stage_releases` is completely empty in prod (0 rows) — confirmed via read-only count before each fix — so all three "add/repoint FK" changes were zero-risk (nothing to violate the new constraints, no backfill needed).
- Every FK addition was checked for orphaned rows against prod data *before* being written (0 found in all cases).
- Route taken: **direct hand-written migration**, not a Lovable prompt (Carl's explicit instruction for this session) — the phased Lovable-prompt workflow doesn't apply, but this audit entry does per the standing KB policy for schema changes regardless of route.

## KB changes shipped

- `unicorn-kb` PR #59 (open, not yet merged): route inventory by role + SuperAdmin/Executive/Academy Builder audit + Internal Staff audit docs, written during the same audit pass that surfaced these DB bugs.

## Codebase observations (read-only)

- `unicorn-cms-f09c59e5` @ `741792c491fdfca17f484671923916625f04a33f` (branch `hotfix/fix-broken-fk-relationships-and-tga-status`, PR #87): 3 new migrations (`20260729050455_fix_broken_fk_relationships_and_tga_status.sql`, `20260729051207_repoint_stage_releases_stage_id_fkey.sql`, `20260729051556_add_stage_releases_tenant_id_fkey.sql`) + one frontend change (`src/hooks/useStageReviews.tsx`, updated to reference the new FK constraint name in its embed hint).
- Migrations were applied directly to prod Supabase (project `yxkgdalkbrriasiyyrwk`) via the Supabase MCP tool before the PR was opened, with Carl's explicit per-step approval. Verified live post-migration: `/admin/integrations/tga`, `/admin/compliance-packs`, `/manage-stages`, `/admin/reviews` all confirmed 0 console errors (all previously 400/500).
- Checked Supabase security advisors after each migration step — no new issues introduced; the one advisory touching `tga_sync_status()` (flagging it as a `SECURITY DEFINER` function callable by `authenticated`) is a pre-existing, intentional characteristic (the function's own internal `is_super_admin()` guard, unchanged by this fix), not a regression.

## Decisions

- No ADRs drafted or resolved this session.

## Open questions parked

- **RLS 403s on `v_executive_anomalies_30d`, `v_executive_consultant_distribution`, `v_executive_client_health`, `v_exec_alignment_signals_7d`, `v_strategic_capacity_pressure`, `v_strategic_portfolio_risk`** — confirmed NOT a missing `GRANT` (authenticated has `SELECT` on all 6 views and at least one underlying table checked). Root cause still open; possibly related to the schema-cache theory below, possibly a genuine RLS gap on a different underlying table not yet checked.
- **`get_user_audit` RPC 404 + `list_code_tables` RPC 400** — both functions exist in prod with signatures that exactly match what the frontend sends (verified via `pg_get_function_identity_arguments`), so not a missing function or param mismatch. Working theory: stale PostgREST schema cache. Cheapest next step: a manual schema reload (`NOTIFY pgrst, 'reload schema'`) — not attempted this session, flagged for a follow-up.
- **`handle_staff_first_login` 400 on `/triage-dashboard`** — function body and `ON CONFLICT` target both check out correctly under read-only inspection; root cause not isolated without a live repro + Postgres logs.
- **Legacy "Parent"/"Child" terminology on `/admin/tenant-users`** — investigated, not fixed. The page's Role column keys off `users.user_type` ('Client Parent'/'Client Child'), a different field than `/client/users`' `tenant_users.relationship_role`. Queried the actual overlap in prod: "Client Child" alone spans 4 different `relationship_role` values (29 `user`, 36 `academy_user`, 1 `primary_contact`, 1 `secondary_contact`). A direct relabel would misrepresent real data for a meaningful chunk of rows — needs a product decision (is `user_type` legacy and should the page switch to `relationship_role`, or do the two fields intentionally track different things?) before any fix, not a code change.

## Tag

audit-2026-07-29-fk-relationships-and-tga-status-fix
