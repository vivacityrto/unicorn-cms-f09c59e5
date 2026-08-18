# Audit: 2026-08-18 — SECURITY DEFINER grant spot-check + 9 more unauthenticated edge functions

**Trigger:** drift-surfaced — follow-up on the remaining open items from the batch-engine audit (2026-08-18). Two independent investigation agents were sent to triage the ~46 functions from the CI check's original 57-function flagged list that weren't covered by the first 11-function fix (PR #361), plus a targeted spot-check of the SECURITY DEFINER advisory list.
**Scope:** Postgres RPC grants (2 functions) + 9 edge functions found unauthenticated via the two agents' investigation. Did not touch RLS policies, the remaining ~420 untriaged SECURITY DEFINER functions, or the `rls_enabled_no_policy`/`extension_in_public`/`vulnerable_postgres_version` advisories (all previously triaged as accepted/blocked, see below).

## Findings

**SECURITY DEFINER grant sample (15 functions checked directly):** confirmed 14/15 sampled functions (e.g. `accept_ai_suggestion`, `admin_search_clients`, `bulk_create_documents_with_versions`) already contain an internal authorization check (`auth.uid()`, `check_permission`, `is_super_admin`, `has_tenant_access`, or an explicit permission-denied `RAISE EXCEPTION`) — confirming the prior session's judgement that most of the 429 are the expected, intentional Supabase pattern (SECURITY DEFINER exposed to `authenticated`, gated internally), not a blanket vulnerability.

Narrowed further to a 9-function sample matching risky one-off-script naming (`backfill_`, `repair_`, `fix_`, `cleanup_`, `bulk_`) since these are more likely to be leftover migration/maintenance helpers never meant for direct user invocation. Two had **no internal check and no cron job or other caller**:

- `backfill_l10_meeting_participants()` — takes no parameters, loops over **every** EOS L10 meeting across **all tenants** and writes participant rows via `sync_l10_meeting_participants`. `EXECUTE` was granted to `authenticated`: any signed-in user (client or staff, any tenant) could trigger a system-wide data mutation.
- `cleanup_old_rate_limits()` — deletes `ai_rate_limits` rows older than 2 hours. `EXECUTE` was granted to `authenticated`: any signed-in user could call this to reset/bypass AI rate limiting for themselves or others.

**`tga-rto-sync` edge function:** found via a parallel agent re-investigating functions from the earlier CI-check sweep that an initial coarse grep had mis-marked "OK" (a false-positive match on unrelated text). Full read confirmed **zero authorization of any kind** — `verify_jwt: false` and no header/claims check anywhere in the function body. It accepts `{ tenantId, rtoId, force }` from the request body and, using the service-role key, overwrites `tenants`, `tenant_profile`, `tga_rto_summary`, `tga_rto_contacts`, `tga_rto_addresses`, `tga_rto_delivery_locations`, and `tenant_rto_scope_staging` for the caller-supplied `tenantId` with data fetched from `training.gov.au` for the caller-supplied `rtoId`. An anonymous caller who could guess/enumerate a small-integer `tenantId` could clobber another tenant's live RTO compliance data and repeatedly hammer the public TGA API through this proxy. Confirmed two real, legitimate frontend callers — `src/hooks/useTgaRtoData.tsx` and `src/components/AddTenantDialog.tsx` — both already forward the caller's session JWT via the default `supabase.functions.invoke(...)`, so a real gate does not break either.

**Second investigation pass (2 parallel agents, ~46 functions) found 9 more edge functions with zero authorization of any kind**, each independently traced to a real caller and real impact:

- `tga-rto-sync` (found first, see above): cross-tenant TGA compliance-data overwrite.
- `outlook-time-draft-worker`: called by the Time Inbox "Refresh" button with **no tenant_id**, which triggers a "process every tenant's calendar events" branch — an anonymous caller (or, until fixed, any authenticated but non-staff caller) could trigger a cross-tenant write to `calendar_time_drafts` for every tenant in the system.
- `ai-suggest-rock`: anonymous caller supplies any `tenant_id` and reads that tenant's EOS VTO (10-year target, core values) and rock data via the service-role client, plus burns paid AI-gateway credits per call.
- `fetch-clickup-comments` / `sync-clickup-time`: both support a "fetch/sync everything for every tenant" mode (`tenant_id: 0` / `mode: sync_all`); anonymous callers could trigger unbounded ClickUp API pulls across all tenants, exhausting the shared `CLICKUP_API_KEY` quota.
- `extract-note-title` / `extract-suggest-title`: pure AI-cost abuse vector — anonymous callers could spam the paid AI gateway indefinitely (no tenant data exposed).
- `tga-fetch-scope`: `fetch_all` mode paginates the public training.gov.au API up to a 50,000-record safety cap per call with no rate limiting — anonymous callers could trigger large, repeated outbound fetches (cost/availability risk).
- `tga-product-lookup`: anonymous callers could write/poison `tga_cache` rows keyed by an arbitrary `tenant_id` and trigger unbounded external TGA lookups.

The same two agents also confirmed several other candidates from the flagged list were already correctly gated by an idiom the original coarse regex didn't recognize (Office Add-in SSO token validation, one-time consumable tokens, RLS-enforced anon-key clients, `authorizeCronInvoke` cron gates) or were already-retired 410 stubs — no changes needed for those. Three (`get-organisation-details`, `search-organisations`, `add-missing-packages`) came back UNCLEAR — no caller found anywhere, similar to the `schedule-task-reminders` precedent, but not fixed in this pass (parked below).

## Fix

- `REVOKE EXECUTE ... FROM authenticated, anon` on both `backfill_l10_meeting_participants()` and `cleanup_old_rate_limits()`. Left `service_role`/`postgres` grants intact so either can still be run administratively (SQL editor) or by a future scheduled job. No internal check was added and neither was dropped — both remain legitimate one-off/maintenance tools, just no longer reachable from the client API surface.
- `tga-rto-sync`, `ai-suggest-rock`, `tga-product-lookup`: gated with `requireCaller(..., { featureKey: FeatureKeys.staffTga, orAllow: hasTenantAccessSafe(tenantId) })` (tga-rto-sync) or the equivalent inline `verifyAuth` + `hasTenantAccessSafe`/`checkVivacityTeam` pattern — allows Vivacity staff OR any caller who already has access to the target tenant, since each is invoked from both staff-only and tenant-facing UI.
- `outlook-time-draft-worker`, `fetch-clickup-comments`, `sync-clickup-time`: gated on `checkVivacityTeam` — these are Vivacity-internal tools (consultant time tracking, ClickUp integration) with no client-facing use, and support cross-tenant "process everything" modes that only make sense for internal staff.
- `extract-note-title`, `extract-suggest-title`, `tga-fetch-scope`: gated on a plain `verifyAuth` check (any active logged-in user) — no tenant-scoped data is read or written by any of these, so the only risk was anonymous-caller cost/quota abuse, which "must be logged in" fully closes.

## Code changes

- Migration `20260818060000_revoke_unauth_maintenance_rpc_grants` (applied directly to production via Supabase MCP; committed to `supabase/migrations/` in this PR).
- 9 files under `supabase/functions/**`: `tga-rto-sync`, `outlook-time-draft-worker`, `ai-suggest-rock`, `fetch-clickup-comments`, `sync-clickup-time`, `extract-note-title`, `extract-suggest-title`, `tga-fetch-scope`, `tga-product-lookup`.
- Merged (PR #363) and deployed to production 2026-08-18 with explicit authorization, after an independent adversarial review found no broken functionality across all 11 fixes (2 SQL + 9 edge functions): `tga-rto-sync` v620, `outlook-time-draft-worker` v623, `ai-suggest-rock` v489, `tga-product-lookup` v592, `fetch-clickup-comments` v442, `sync-clickup-time` v433, `extract-note-title` v446, `extract-suggest-title` v374, `tga-fetch-scope` v593.

## Decisions

- Did not attempt a full read of the remaining ~420 SECURITY DEFINER-flagged functions in this pass — the 15-function sample strongly supports the prior session's judgement that most are intentional, internally-gated RPCs. A full audit remains a legitimate future scope if Carl wants full coverage, but isn't repeated here given the sampling result.
- Confirmed (not re-litigated) that `vulnerable_postgres_version`, `extension_in_public` (`pg_net`), and the 7 `rls_enabled_no_policy` INFO-level findings are unchanged from prior sessions: Postgres upgrade requires a dashboard-initiated restart (no MCP/SQL tool for it — confirmed by checking `PostgreSQL 15.8` directly and the advisor's own remediation link, which points to the Supabase dashboard upgrade flow); `pg_net`'s `net` schema is owned by `supabase_admin` and the project's SQL role has no `CREATE`/relevant privilege on it (confirmed directly via `has_schema_privilege`) — genuinely not movable via any SQL this session can run, not merely assumed.

## Open questions parked

- The remaining ~420 SECURITY DEFINER-flagged functions beyond this session's 24-function sample (15 general + 9 risky-naming) have not been individually verified.
- `get-organisation-details`, `search-organisations`, `add-missing-packages`: no caller found anywhere (frontend, cron, or DB trigger); JWT-required by default so not directly internet-exposed the way the 9 fixed functions were, but likely dead code. Same treatment question as `schedule-task-reminders` — worth asking Carl whether to retire outright in a future session.
- Postgres upgrade and the `pg_net` schema move both require Supabase-dashboard-level or support-ticket action outside any MCP tool available this session — flagged to Carl directly, not something a future Claude Code session can resolve alone either without new tooling/access.
