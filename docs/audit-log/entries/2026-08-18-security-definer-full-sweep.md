# Audit: 2026-08-18 — Full SECURITY DEFINER sweep (35 functions)

**Trigger:** drift-surfaced — full follow-up sweep authorized after the 2026-08-18 spot-check
(`2026-08-18-security-definer-grant-spotcheck-and-tga-sync.md`) found 2 real gaps in a 24-function
sample, a hit rate high enough to justify covering the rest of the advisor-flagged list rather than
stopping at a sample.

**Scope:** All `SECURITY DEFINER` functions in `public` still flagged by the Supabase advisor
(`authenticated_security_definer_function_executable` / `anon_security_definer_function_executable`)
as of 2026-08-18, refined from ~450 raw flags down to ~68 live candidates via a classification query
(excludes trigger functions — not directly callable — and boolean predicates — reveal only a
yes/no fact), then cross-checked against live `information_schema.routine_privileges` grants. Did
not re-touch RLS policies, `pg_net`, the Postgres version, or the two `SECURITY DEFINER` functions
already confirmed safe (`stage_instance_tenant_id`, `validate_invitation_token` — see below).

## Method

1. Ran the classification query against `pg_proc`/`pg_get_functiondef` to produce ~78 candidates,
   then confirmed live grants via `information_schema.routine_privileges`, narrowing to ~68 with a
   real `authenticated`/`anon`/`PUBLIC` grant and no recognizable internal check.
2. Split the 68 into two batches and sent each to an independent investigation agent with no
   memory of the earlier session, told to read every function body and confirm real callers rather
   than trust the advisor's flag alone.
3. Re-verified every reported "REAL GAP" myself directly against `pg_get_functiondef()` (not just
   the agents' quoted excerpts) before designing a fix.
4. For every function slated for a fix, grepped `src/` and `supabase/functions/**` myself for
   actual `.rpc('<name>', ...)` call sites to decide between two remedies:
   - **No legitimate authenticated caller found** → `REVOKE EXECUTE ... FROM authenticated, anon`,
     leaving `service_role`/`postgres` untouched.
   - **Real, confirmed caller that must keep working** → `CREATE OR REPLACE FUNCTION` adding an
     internal guard, reusing the schema's own existing correct patterns
     (`public.has_tenant_access_safe(tenant_id, user_id)` for tenant-scoped data,
     `public.is_vivacity_team_safe(user_id)` for internal-staff-only tools, or a plain
     `auth.uid() = p_user_id` check for "my X" personal-scope RPCs).

## Findings

**Confirmed SAFE, no action needed:**
- `stage_instance_tenant_id` — genuine RLS helper invoked by Postgres itself inside
  `stage_instances`/`client_task_instances` policies; broad grants are required for policy
  evaluation to work for every role. Direct callability lets an anonymous caller map a guessable
  `stage_instance_id` → `tenant_id` (low-value recon), not a data leak.
- `validate_invitation_token` — the intended pre-login flow. Tokens are `crypto.randomUUID()`
  generated, SHA-256 hashed at rest, single-use, and expiring (per the 2026-08-15
  single-use-invitation-tokens audit entry); the token itself is the credential.

**REAL GAP — 16 functions with no legitimate authenticated/anon caller found (fixed via REVOKE):**

| Function | Exposure |
|---|---|
| `derive_org_type_for_tenant(bigint)` | **Write.** Force-overwrites any tenant's `org_type` classification. |
| `fn_auth_user_id_by_email(text)` | Account-enumeration + `auth.users.id` disclosure primitive. |
| `calculate_membership_health(bigint,bigint)` | Cross-tenant membership health/risk score disclosure. |
| `compute_membership_usage(bigint)` | Cross-tenant billing/hours-usage disclosure. |
| `compute_client_weekly_required(bigint)` | Cross-tenant billing calc; only a real caller internally (unaffected by revoke). |
| `resolve_billing_tenant_id(bigint)` | Parent/child tenant billing-relationship disclosure; only a real caller internally. |
| `tga_get_sync_progress(uuid)` | Only reached via `tga-sync`'s service-role client. |
| `fn_check_phase_gate(uuid)` | No caller found anywhere — dead code, same category as prior `schedule-task-reminders` finds. |
| `fn_match_client_for_event(bigint,text,text[])` | No caller found; cross-tenant email/client-matching probe. |
| `fn_package_used_minutes(bigint)` | No caller found; cross-tenant billable-minutes disclosure. |
| `rpc_get_client_time_rollup(bigint,integer)` | No caller found anywhere. |
| `rpc_get_package_time_rollup(bigint,bigint,integer)` | No caller found anywhere. |
| `search_vector_embeddings(...)` | Only reached via `vector-search`'s service-role client (already Ask-Viv-gated). |
| `search_unicorn1_users(text,boolean)` | Only reached via `search-unicorn1-users`'s service-role client (already `FeatureKeys.adminUnicorn1`-gated). |
| `audit_send_evidence_reminders()` | Zero-param, cron-only; sends real client emails via `net.http_post` — mass-email abuse vector. |
| `run_user_uuid_fk_validation()` | Zero-param; runs live `ALTER TABLE ... VALIDATE CONSTRAINT` DDL — an ops tool, not an RPC. |

**REAL GAP — 19 functions with a confirmed real caller (fixed via added internal guard):**

`rpc_check_package_thresholds`, `get_tenant_scope_items`, `get_tenant_scope_sync_status`,
`get_tenant_user_capacity`, `get_active_membership_packages` — tenant-scoped reads, gated with
`has_tenant_access_safe(p_tenant_id, auth.uid())`.

`compute_consultant_current_load`, `compute_consultant_weekly_capacity` — take a *consultant's*
UUID, not a tenant; gated staff-only with `is_vivacity_team_safe(auth.uid())` since both real
callers (`BulkReassignCscDialog.tsx`, `TeamReassignmentPage.tsx`) are staff reassignment tools.

`validate_document_readiness`, `validate_release_readiness` — `p_tenant_id` is optional; guard only
fires when a tenant is actually supplied.

`get_membership_rollups()`, `get_stage_progress()` — zero-parameter, dump every tenant's data by
design. Their only caller (`useMembershipDashboard.tsx`) renders at `/membership-dashboard`, a
plain `ProtectedRoute` (not `/client/*`) — a Vivacity-internal dashboard per this repo's established
route convention, so the correct guard is staff-only (`is_vivacity_team_safe`), not a tenant filter.

`calculate_quorum(p_meeting_id)` — no tenant param; resolves `eos_meetings.tenant_id` internally
before applying `has_tenant_access_safe`.

`generate_rock_outcomes`, `increment_rate_limit`, `rpc_export_client_timeline`,
`list_acting_user_options` — straightforward tenant-scoped reads/writes, gated with
`has_tenant_access_safe`.

`fn_preview_broadcast_recipients` — real caller is `BulkMessageDialog.tsx`, rendered only at the
staff-only Team Communications page; gated with `is_vivacity_team_safe`.

`rpc_get_inbox_items`, `rpc_get_my_action_items` — "my X" RPCs whose only real callers
(`useTeamInbox.ts`, `useMyWork.tsx`) always pass the caller's own `auth.uid()` as `p_user_id`
despite having no internal check that this was true; gated with
`auth.uid() = p_user_id OR is_vivacity_team_safe(auth.uid())` (staff override kept in case an
internal tool needs to view a colleague's items on their behalf; the exploit path — a non-staff
caller passing someone else's UUID — is fully closed either way).

Five of the 19 (`get_tenant_user_capacity`, `get_active_membership_packages`,
`list_acting_user_options`, `rpc_get_inbox_items`, `get_stage_progress`) were originally
`LANGUAGE sql` and were converted to `plpgsql` to allow the `IF ... THEN RAISE EXCEPTION` guard;
no signature or return-type change, so `DROP FUNCTION` first was not required.

## Fix

- Migration `20260818090000_security_definer_full_sweep_fixes` — 16 `REVOKE EXECUTE` statements
  plus 19 `CREATE OR REPLACE FUNCTION` bodies (guard added, logic otherwise unchanged).
- [Deployment status and PR link to be added once merged — see below.]

## Decisions

- Chose `REVOKE` over "add a check and leave it granted" for the 16 no-caller functions to match
  this session's established PR #363 precedent (`backfill_l10_meeting_participants`,
  `cleanup_old_rate_limits`) — least-privilege by default, `service_role`/`postgres` can still
  reach them for admin/cron use.
- Chose to patch (not revoke) the 19 caller-confirmed functions rather than break the features that
  depend on them.
- Every "real caller" claim was verified directly via `Grep` against `src/` and
  `supabase/functions/**` for an actual `.rpc('<name>', ...)` call site — not taken on the
  investigating agents' word alone.

## Open questions parked

- The remaining ~33 of the ~68 candidates (beyond this entry's 35 fixed + the prior session's 24
  sampled + the 2 confirmed-safe) were reviewed by the same two investigation agents and found to
  already have a correct internal check the original text-filter didn't recognize (e.g. an
  `app.user_can_access_tenant(...)` check inside a CTE), or return only non-sensitive/aggregate
  data — no further action needed, not re-litigated here.
