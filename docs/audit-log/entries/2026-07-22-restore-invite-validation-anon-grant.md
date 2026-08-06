# Audit: 2026-07-22 — restore-invite-validation-anon-grant

**Trigger:** drift-surfaced
**Scope:** Root-caused and fixed a production regression in `public.validate_invitation_token` (Unicorn 2.0, Supabase project `yxkgdalkbrriasiyyrwk`) that was silently blocking every new-user invitation acceptance. Did not fix the other related findings surfaced along the way — those are parked below, not actioned this session.

## Findings
- Investigating an unrelated client-reported TGA sync failure ("Sync Failed — Edge Function returned a non-2xx status code") led to discovering a week-long (12–21 Jul 2026) security-hardening effort, applied to production by `angela@vivacity.com.au` via ~46 migrations, almost none of which were ever committed to `unicorn-cms-f09c59e5`'s git history.
- Two confirmed regressions from that effort, same root shape (an authorization tightening that didn't account for every real caller):
  - `tga_swap_scope_from_staging` / `tga_start_staged_sync` gained an `is_vivacity_team_safe(auth.uid())` staff-only gate (`l3_gate_tga_sync_cluster`, 2026-07-15 23:48 UTC). The `tga-rto-sync` edge function calls these via a service-role client with no user JWT, so `auth.uid()` is always `NULL` and the gate rejects every call unconditionally — TGA "Sync Now" has had a 100% failure rate since, unrelated to the specific client originally reported.
  - `validate_invitation_token` lost its `anon` EXECUTE grant, swept up in a broader "revoke anon EXECUTE from SECURITY DEFINER functions not used inside RLS" pass (~14 Jul) that didn't check for functions called directly from a pre-login page. `AcceptInvitation.tsx` calls this function on page load before any session exists, so every brand-new invitee (no prior Unicorn account) hit "Invalid invitation" immediately. Confirmed via `user_invitations`: weekly acceptance rate dropped from a normal 40–75% to ~17–18% starting the week of 13 Jul and never recovered; several invitations showed `delivery_status='delivered'` but stayed `status='pending'` indefinitely, ruling out an email-delivery explanation.
- Fixed `validate_invitation_token` this session (see Codebase observations). The TGA gate and several other likely-affected functions (found via a broader blast-radius pass) remain open — see Open questions parked.
- Fix verified three independent ways, not just Lovable's own report: (1) `has_function_privilege('anon', 'public.validate_invitation_token(text)', 'EXECUTE')` queried directly → `true`; (2) `git fetch`/diff against `origin/main` confirmed exactly one new migration file landed, matching the proposed fix byte-for-byte, no other object touched; (3) a real logged-out browser test against a live pending invitation succeeded post-fix (confirmed broken pre-fix, confirmed working post-fix).

## KB changes shipped
- No changes.

## Codebase observations (read-only)
- unicorn (`unicorn-cms-f09c59e5`) @ `020069e4947c82c3edd2c7a8f8e19cbd14a42e9f` — merge commit "Added anon to grant row", adding `supabase/migrations/20260722020914_0a51a437-9925-4a81-8fd2-8f466d652cb2.sql`. `CREATE OR REPLACE` on `validate_invitation_token` (aligned to current hardening convention: `SET search_path = ''`, fully-schema-qualified `public.user_invitations`, logic otherwise unchanged) followed by `REVOKE ALL ... FROM PUBLIC` + `GRANT EXECUTE ... TO anon, authenticated, service_role`.

## Decisions
- Fixed `validate_invitation_token` in isolation rather than bundling it with the other confirmed/likely blast-radius findings — the severity gap (new staff and new client onboarding fully blocked for over a week, vs. the other findings being either dormant/low-traffic or admin-page-only) justified an immediate, narrowly-scoped, low-risk fix over waiting for a larger batched remediation.
- Applied via Lovable (Supabase-connected) with explicit instructions to scope to this one function only and to commit the migration file — the first migration from the July remediation window to actually land in git, rather than living only in the database like the rest of that week.

## Open questions parked
- **Still broken, not yet fixed:** `tga_start_staged_sync` + `tga_swap_scope_from_staging` (TGA sync, same `l3_gate_tga_sync_cluster` migration), `upsert_excel_template_bindings` (scan-document edge function), `stall_bulk_document_job` (bulk-generate-documents-worker error path), `persist_tga_scope_items` (no confirmed live caller, same TGA cluster) — all gated with an unconditional `auth.uid()` check that fails for their service-role callers. `users.select('*')` hard-fails in `ManagePackages.tsx`, `TenantDetail.tsx`, `TenantMembers.tsx` from the M5 personal-contact column REVOKE. `internal-onboarding` storage bucket has a permission-key mismatch between its upload policy and its read/update/delete policy, blocking non-admin staff from reading back what they just uploaded.
- The entire 12–21 Jul security remediation window (~46 migrations, applied by `angela@vivacity.com.au`) exists live in the database but — apart from this session's fix — has never been committed to `unicorn-cms-f09c59e5`. Reconciliation debt; the codebase is stale for anything security-related after 8 Jul.
- A process fix to prevent recurrence was discussed (require checking all three caller categories — frontend-anon, edge-function-service-role, cron-direct — before any future REVOKE/GATE migration, likely landing in the `unicorn-security-audit` skill or `unicorn-kb/pinned/`) but was explicitly parked by the user this session, not yet drafted.

## Tag
audit-2026-07-22-restore-invite-validation-anon-grant
