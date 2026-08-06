# Audit: 2026-07-22 — invitation-role-ceiling-trigger

**Trigger:** drift-surfaced (discovered while investigating the 18 Jul stuck-PR batch, see [[2026-07-22-git-drift-reconciliation]])
**Scope:** Closed a live, currently-exploitable privilege-escalation gap on `public.user_invitations` — a tenant Admin could bypass the `invite-user` edge function's app-level role ceiling entirely via a direct authenticated REST call, and self-escalate or grant someone else a VIVACITY-tier internal role (Team Leader/Team Member/Integrator/BGT/CSC/CET/Super Admin). Did not action: the `admin.broadcast.send` permission divergence or the remaining 12–13 Jul findings, both handled in the companion reconciliation session.

## Findings
- **Root cause:** RLS policies `user_invitations_manage_superadmin` and `user_invitations_manage_tenant_admin` grant full `INSERT`/`UPDATE` to Super Admins and per-tenant Admins respectively, with no restriction on the `unicorn_role` value of the row being written. The app-level ceiling (only a Super Admin may set an internal role) lives entirely in `invite-user/index.ts`'s application code, which a direct PostgREST call bypasses completely.
- **The code already assumed this was closed.** `invite-user/index.ts` line ~145 references a `DB trigger enforce_invitation_role_ceiling` as the intended backstop — it never existed live (confirmed via `pg_trigger`: only `check_invitation_expiry_trigger` and `update_user_invitations_updated_at` were present).
- **A migration already existed in git, authored 18 Jul 2026, never applied.** `supabase/migrations/20260718065738_enforce_invitation_role_ceiling.sql` was properly written and merged during the 18 Jul security PR batch, but — like the rest of that batch — never reached production because `supabase db push` has been silently failing on every merge since (`schema_migrations` has zero `20260718*` entries). This was not a new design; it was stuck, correctly-authored work that had never shipped.
- **Full writer inventory confirmed before deploying:** only `invite-user` and `activate-ghost-user` edge functions insert into `user_invitations` (both service-role); `resend-invite`/`cancel-invite`/`mailgun-webhook`/`reconcile-invite-delivery-status`/`send-invitation-email`/`set-invite-password` only update non-role columns; `bulk-send-invitations` only calls `invite-user` internally; zero direct frontend writes exist anywhere in `src/`.
- **Deployed and independently verified end-to-end.** Applied under a fresh timestamp (not the stale 18 Jul one, to avoid misrepresenting when it actually shipped) with one addition — `REVOKE EXECUTE ... FROM authenticated, service_role` for defense-in-depth — plus a refreshed code comment. Live DB confirmed: trigger present and enabled (`BEFORE INSERT OR UPDATE ROW`), function `SECURITY DEFINER`/`search_path=''`/all EXECUTE grants revoked (`proacl: {postgres=X/postgres}` only). Git confirmed: orphan 18 Jul file deleted, new dated file content matches exactly, `invite-user/index.ts` comment fixed. Post-deploy log sweep across all five relevant writer functions showed zero unexpected `42501`/ceiling errors.
- Live smoke tests (planned against standardized QA tenant 7517 accounts) were explicitly skipped at the user's request — object-level verification (trigger wiring + function hardening) was judged sufficient given the SQL had already been independently audited line-by-line before applying.

## KB changes shipped
- No changes.

## Codebase observations (read-only)
- unicorn (`unicorn-cms-f09c59e5`) @ `813d756f` — trigger migration `supabase/migrations/20260722054949_eadfd504-f14a-4c7e-b433-d2297ab96e92.sql` added, orphan `20260718065738_enforce_invitation_role_ceiling.sql` removed, `invite-user/index.ts` comment refreshed — all in one commit.

## Decisions
- Applied under today's timestamp rather than the original 18 Jul filename, so git history accurately reflects "authored 18 Jul, applied 22 Jul" rather than falsely implying it shipped on the original date.
- Added a `REVOKE EXECUTE ... FROM authenticated, service_role` line beyond the original migration's scope, since trigger functions don't need direct EXECUTE grants to fire (they run as the table owner) — pure hygiene, no behavior change.
- Skipped the live browser-based smoke test suite (tenant-admin-blocked / tenant-admin-allowed / service-role-allowed / accept-flow-unaffected) at the user's explicit request, relying on object-level DB verification instead.

## Open questions parked
- Only 2 of the ~19 PRs in the 18 Jul stuck batch have been deep-checked for similar "looks fixed in git but isn't live, or has silently diverged" issues (this one, and `admin.broadcast.send` — see [[2026-07-22-git-drift-reconciliation]]). The remaining ~17 have not been individually re-verified.
- The systemic root cause — `supabase db push` silently failing on every merge to `main` since 18 Jul — remains unfixed and out of scope for this session per explicit user instruction ("CI failure is expected... no need to investigate further").

## Tag
audit-2026-07-22-invitation-role-ceiling-trigger
