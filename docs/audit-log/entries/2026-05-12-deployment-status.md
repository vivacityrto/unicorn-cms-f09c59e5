# Deployment Status — 12 May 2026

**Trigger:** Standing audit — supersedes Open Issues & Deployment Status, 11 May 2026.
**Author:** Carl
**Scope:** Unicorn 2.0-dev project `yxkgdalkbrriasiyyrwk`; codebase `unicorn-cms-f09c59e5` at `origin/main` (`830c9754`). Live DB queries via MCP. Codebase local branch is 20 commits behind origin/main — this audit was conducted against `origin/main` state.

---

## Headline

P0-a (cron JWT rotation) is fully closed and confirmed live: the `private` schema and `private.cron_function_jwt()` helper exist on Unicorn 2.0-dev, and zero cron jobs contain a JWT-shaped string. BUG-002, BUG-003, and the academy-thumbnails bucket gap also closed. Everything else from 11 May remains open, and the mutable search\_path count has worsened from 24 to 28, with four net-new functions missing `SET search_path`. Three new migrations shipped on 12 May (pdp\_cycles RLS hardening + doc-templates/generated-docs buckets); two new consistency issues were introduced in the process.

---

## What shipped since 11 May

| # | Item | Status |
|---|------|--------|
| 1 | P0-a — cron JWT rotation: private schema + helper deployed; legacy jobs removed | CLOSED |
| 2 | BUG-002 — ClientUsersPage: getTenantRole/isAdmin removed | CLOSED |
| 3 | BUG-003 — ClientTasksPage: getTenantRole/isAdmin removed | CLOSED |
| 4 | P1-d — academy-thumbnails bucket: 2 RLS policies now in place | CLOSED |
| 5 | audit\_user\_events table created on live (out-of-band; no tracked migration) | NEW |
| 6 | pdp\_cycles RLS hardened (3 migrations: 20260512000025, 20260512012213, 20260512021431) | NEW |
| 7 | doc-templates + generated-docs storage buckets + policies (PDP export feature) | NEW |
| 8 | Book Consult button removed from UI (commit 1dc64e05) | NEW |

---

## P0 Status

| # | Item | 11 May | 12 May | Evidence |
|---|------|--------|--------|---------|
| P0-a | Cron job JWT rotation | OPEN | **CLOSED** ✅ | `private_schema_exists=1`, `jwt_helper_exists=1` confirmed via `information_schema`; `SELECT jobid, jobname FROM cron.job WHERE command LIKE '%eyJ%'` returns 0 rows |
| P0-b | audit\_log canonical ledger | OPEN | **PARTIAL — still open** | `audit_user_events` now exists on live (columns: `id`, `actor_user_uuid`, `target_user_uuid`, `action`, `reason`, `details`, `created_at`); no `tenant_id`; not a workspace-wide ledger; 15 domain tables remain unfederated; `v_workspace_audit_log` not built; KB doc `audit-log-inventory.md` Option C not actioned |

---

## P1 Status

| # | Item | 11 May | 12 May | Evidence |
|---|------|--------|--------|---------|
| P1-a | EOS overlapping permissive SELECT policies | OPEN | **OPEN** | Live query: 20 EOS tables carry multiple SELECT policies (e.g. `eos_issues` has 4, `eos_rocks` 4, `eos_vto` 4, `eos_qc` 3, `eos_headlines` 3); no consolidation migrations shipped |
| P1-b | auth.uid() non-subquery uses | OPEN | **OPEN** | RLS policy query shows direct `auth.uid()` comparands on `academy_certificates`, `academy_enrollments`, `active_timers`, `ai_client_query_usage`, `ai_interaction_logs`, `assistant_audit_log`, `assistant_threads`, and many more; helper functions (`is_vivacity_team_safe`, `is_super_admin_safe`) also called with direct `auth.uid()` rather than `(SELECT auth.uid())` subquery on most tables; partial migration to subquery form exists (e.g. `accountability_chart_versions` uses `( SELECT auth.uid() AS uid)`) |
| P1-c | Five empty consultation tables | OPEN | **OPEN** | Live row counts: `consult_entries` 0, `consult_logs` 0, `consult_logs_unmapped_quarantine` 0, `consult_time_entries` 0, `consults` 0; UI button removed but tables persist with zero data |
| P1-d | avatars + academy-thumbnails bucket policies | OPEN | **PARTIALLY CLOSED** | academy-thumbnails: 2 policies now live — `Academy thumbnails: Vivacity staff manage` (ALL, EXISTS-subquery ✅) + `Academy thumbnails: authenticated list` (SELECT, public-read for thumbnails ✅). avatars: 9 overlapping policies including a broad permissive `Avatar select policy` (`bucket_id = 'avatars'`) that makes scoped policies redundant; functionally harmless (avatars are public-readable by design) but adds to policy sprawl |
| P1-e | Mutable search\_path functions | OPEN (24 post-fix) | **OPEN — worsened (28)** | Live count via `information_schema` + `pg_proc.proconfig`: 28 functions in `public` schema without `SET search_path`. Up from 24 after Monday's fix. Net +4 since last count. Full list: `academy_lesson_set_minutes_from_video`, `academy_set_updated_at`, `acknowledge_audit_report`, `audit_flag_overdue_chcs`, `audit_notify_docs_ready`, `audit_send_24hr_confirmation`, `audit_send_evidence_reminders`, `coerce_audit_appointment_attendees`, `compare_unicorn_import_prefix`, `complete_audit_stage_tasks`, `complete_chc_stage_tasks`, `compliance_set_updated_at`, `generate_certificate_number`, `list_code_tables`, `match_srto_chunks`, `normalise_abn`, `normalise_name`, `release_audit_report`, `rpc_match_clickup_to_rto_membership`, `schedule_audit_phase`, `set_client_audit_updated_at`, `set_default_renewal_date`, `suggest_items_set_updated_at`, `sync_audit_actions_to_client_items`, `sync_primary_contact_on_role`, `training_video_refresh_lesson_minutes`, `trg_normalise_tenant_identifier`, `trg_validate_action_item_priority_status` |
| P1-f | Staging/prod project separation | OPEN | **OPEN** | Single project `yxkgdalkbrriasiyyrwk`; no staging environment created |
| P1-g | Postgres security patches | OPEN | **OPEN** | No evidence of patch update in migrations, Studio logs, or audit trail |

---

## Bug Status

| # | File | 11 May | 12 May | Detail |
|---|------|--------|--------|--------|
| BUG-001 | [supabase/functions/bulk-send-invitations/index.ts](../unicorn-cms-f09c59e5/supabase/functions/bulk-send-invitations/index.ts) line 133 | OPEN | **OPEN** | Still `.eq("primary_contact", true)`; `relationship_role` not used for recipient lookup. The `invite-user` edge function explicitly warns "check `relationship_role` column, NOT the primary\_contact boolean — the boolean is unreliable"; bulk-send hasn't adopted this. One-line fix. |
| BUG-002 | [src/components/client/ClientUsersPage.tsx](../unicorn-cms-f09c59e5/src/components/client/ClientUsersPage.tsx) | OPEN | **CLOSED** ✅ | No matches for `isAdmin` or `getTenantRole`; fix confirmed by 11 May audit `2026-05-11-bug-002-003-secondary-contact-portal-access.md` |
| BUG-003 | [src/pages/ClientTasksPage.tsx](../unicorn-cms-f09c59e5/src/pages/ClientTasksPage.tsx) | OPEN | **CLOSED** ✅ | Same fix; confirmed no matches in current origin/main |
| BUG-004 | [src/contexts/ClientTenantContext.tsx](../unicorn-cms-f09c59e5/src/contexts/ClientTenantContext.tsx) line 209 | OPEN | **OPEN** | `canAccessClientPortal = fullScope && isContact` where `isContact = primary_contact === true \|\| secondary_contact === true`. Users with `access_scope = 'full'` who are not a marked contact are locked out of the portal. Code comment ("Backup-admin model") suggests this is intentional for the contact-level access model, but the design intent for non-contact full-scope users has not been explicitly confirmed. |
| BUG-005 | [src/components/client/users/useInviteMutations.ts](../unicorn-cms-f09c59e5/src/components/client/users/useInviteMutations.ts) | OPEN | **UNVERIFIED** | Client-side sends `relationship_role` (not `access_scope`) to `invite-user` edge function via `ROLE_MAP` (`academy` → `relationship_role: "academy_user"`). Accept-invitation flow not verified in this session — `access_scope = 'academy_only'` mapping presumably occurs server-side on acceptance. Verify in accept-invitation edge function before closing. |

---

## Ticket Status

| # | Item | 11 May | 12 May | Detail |
|---|------|--------|--------|--------|
| TICKET-007 | Acting-user picker auth.users JOIN | OPEN | **PARTIAL** | `useClientActingUser.ts`: Strategy 1 now queries `tenant_users` with `.eq("relationship_role", "primary_contact")` ✅ (correct canonical field). Falls back to `tenant_members` (Admin role, oldest first) then any active member. Final profile fetched from `public.users`, not via `INNER JOIN auth.users`. Whether TICKET-007 specifically required an `auth.users` join (for existence guarantee) or just the `relationship_role` lookup is not resolvable without the original ticket. Current implementation is functionally correct. |
| TICKET-008 | RPC error UX | OPEN | **PARTIAL** | Invite/resend/revoke mutations use `extractEdgeError()` to surface `edge.detail` rather than a generic message (e.g. `"Couldn't resend"` + specific detail string). Other RPC callers across the codebase not audited in this session; some may still show generic messages. |
| TICKET-003 | enrol\_as\_impersonator tenant match | OPEN | **OPEN** | Function validates: actor authenticated ✅, actor is superadmin/admin/vivacity\_internal ✅, target user exists in `public.users` ✅, target has at least one `tenant_users` row ✅, course published ✅. Does **not** validate that target's tenant matches the actor's current tenant context — a staff user acting in Tenant A could enrol a user who only belongs to Tenant B. Tenant match check missing. |

---

## trg\_sync\_primary\_contact

Trigger `trg_sync_primary_contact` (migration 20260309075733) still fires on `role = 'parent'`, setting `primary_contact = true`. It has **not** been updated to key off `relationship_role`. The `invite-user` edge function already works around this explicitly: *"IMPORTANT: check relationship\_role column, NOT the primary\_contact boolean — the boolean is unreliable (trigger sets it true for all parent-role rows)."* The new pdp\_cycles tenant admins policy (20260512021431) also uses `primary_contact = true OR secondary_contact = true` rather than `relationship_role`, adding a second consumer of the unreliable boolean. The trigger should be rekeyed before the boolean-vs-column inconsistency propagates further.

---

## New issues surfaced

| # | Severity | Item | Detail |
|---|----------|------|--------|
| NEW-001 | Low | pdp\_cycles UPDATE policy: direct auth.uid() | Migration 20260512000025 `USING (user_id = auth.uid())` and `WITH CHECK (user_id = auth.uid())` — direct comparand, not subquery. Minor; consistent with existing pattern but adds to P1-b debt. |
| NEW-002 | Medium | pdp\_cycles tenant admins view policy uses primary\_contact boolean | Migration 20260512021431 gates tenant-admin view on `primary_contact = true OR secondary_contact = true` — the unreliable boolean, not `relationship_role`. Introduces a second RLS policy that will drift when the trigger is fixed. Should be updated alongside trg\_sync\_primary\_contact. |
| NEW-003 | Medium | generated-docs bucket: no write policy; service-role assumed | Migration 20260512012213 creates a SELECT-only policy for `generated-docs`. Comment states "service role handles writes" but no SECURITY DEFINER function or edge function was verified as the write path. If the write path changes, objects in this bucket will be inaccessible to any non-service-role writer. |
| NEW-004 | Medium | Mutable search\_path regression: +4 functions | Live count rose from 24 (after Monday's fix) to 28. The 4 additions are present in the full list above (P1-e). Root cause not yet identified — likely recent PDP or audit-workflow additions in origin/main commits not yet pulled locally. |
| NEW-005 | Low | avatars bucket: 9 overlapping SELECT policies | Broad `Avatar select policy` (`bucket_id = 'avatars'`) makes `Avatars: own avatar list` and `Avatars: super admin list` unreachable (first permissive wins). Not a security regression. Contributes to policy sprawl. |
| NEW-006 | Low | audit\_user\_events: no tenant\_id; created out-of-band | Table exists on live but has no `tenant_id` column and no tracked migration. Not possible to scope audit events to a tenant. Should be formalised with a migration and `tenant_id` before data accumulates. |
| NEW-007 | Info | Local codebase 20 commits behind origin/main | `unicorn-cms-f09c59e5` local HEAD `aa81aab0` vs origin `830c9754`. Three new migrations on origin (20260512000025, 20260512012213, 20260512021431). Pull before any new local dev work. |

---

## What's still open — at a glance

| Ref | Item | Severity |
|-----|------|----------|
| P0-b | Canonical audit ledger (audit\_user\_events exists but no workspace federated view; no tenant\_id) | P0 |
| P1-a | EOS overlapping SELECT policies — 20 tables | P1 |
| P1-b | auth.uid() direct comparands in RLS policies — many tables | P1 |
| P1-c | Five empty consult tables (0 rows each; button removed) | P1 |
| P1-d (partial) | avatars — 9 overlapping policies including broad permissive SELECT | P1 |
| P1-e | Mutable search\_path — 28 functions (worsened from 24) | P1 |
| P1-f | Single dev project; no staging environment | P1 |
| P1-g | Postgres security patches — status unknown | P1 |
| BUG-001 | bulk-send-invitations: recipient lookup still on primary\_contact boolean | Bug |
| BUG-004 | canAccessClientPortal gates non-contact full-scope users out | Bug |
| BUG-005 | accept-invitation access\_scope mapping unverified | Bug |
| TICKET-003 | enrol\_as\_impersonator: no tenant match validation | Ticket |
| TICKET-007 | Acting-user picker: no auth.users JOIN (functional but unverified vs ticket intent) | Ticket |
| TICKET-008 | RPC error UX: partial only (invite flow fixed; others not audited) | Ticket |
| trg | trg\_sync\_primary\_contact still keys off role='parent' not relationship\_role | Trigger |
| NEW-001 | pdp\_cycles UPDATE: direct auth.uid() in USING | Low |
| NEW-002 | pdp\_cycles tenant admin policy uses primary\_contact boolean | Medium |
| NEW-003 | generated-docs: write path not verified | Medium |
| NEW-004 | search\_path regression +4 | Medium |
| NEW-005 | avatars 9-policy overlap | Low |
| NEW-006 | audit\_user\_events: no tenant\_id; out-of-band | Medium |
| NEW-007 | Local codebase 20 commits behind origin | Info |

---

## Recommended next moves (ordered by leverage)

1. **Pull local codebase** — 20 commits, 3 new migrations on origin. Do before any dev work. (`git pull` in `unicorn-cms-f09c59e5`.)

2. **BUG-001: Fix bulk-send-invitations recipient lookup** — Change line 133 from `.eq("primary_contact", true)` to `.eq("relationship_role", "primary_contact")`. One line in one file. Unblocks reliable bulk invite delivery to the correct contact.

3. **trg\_sync\_primary\_contact + NEW-002: Rekey trigger on relationship\_role** — Update `sync_primary_contact_on_role()` to key off `relationship_role = 'primary_contact'` instead of `role = 'parent'`. Simultaneously fix the pdp\_cycles tenant admin policy (NEW-002) to use `relationship_role` instead of the boolean. These two changes together stop the boolean-vs-column inconsistency from spreading further. Do as a single Lovable prompt.

4. **P1-e + NEW-004: Mutable search\_path — Lovable prompt** — 28 functions need `SET search_path = ''`. Raise a single Lovable prompt listing all 28 by name. Prioritise trigger functions (`sync_primary_contact_on_role`, `trg_normalise_tenant_identifier`, `trg_validate_action_item_priority_status`) and auth-adjacent functions. Blocks security hardening milestone.

5. **TICKET-003: Add tenant match to enrol\_as\_impersonator** — Add a check that `p_target_user_id` has a `tenant_users` row for the tenant the actor is operating in (pass `p_tenant_id` as a parameter or derive from JWT claims). Without this, cross-tenant enrolment is possible by any staff user.

6. **NEW-006: Formalise audit\_user\_events** — Add `tenant_id bigint NOT NULL` via migration; write a Lovable prompt to backfill from `users` or `tenant_users`. Then begin populating via the accept-invitation flow and role-change triggers (the "medium-term" step from KB Option C).

7. **P0-b: Build v\_workspace\_audit\_log** — Follow `audit-log-inventory.md` Option C short-term: (a) add `tenant_id` to `package_builder_audit_log`, (b) create `v_workspace_audit_log` over the 12 tenant-scoped domain tables. Decision from Carl/Angela required first (see KB doc decision table items 1–3).

8. **BUG-004/BUG-005: Confirm design intent** — BUG-004: explicitly confirm whether non-contact full-scope users should reach the portal. BUG-005: read accept-invitation edge function and verify `access_scope = 'academy_only'` is set on acceptance for `relationship_role = 'academy_user'` invites. These are verification tasks, not necessarily fixes.

9. **NEW-003: Verify generated-docs write path** — Confirm the edge function (or service-role caller) that writes to `generated-docs`. If no service-role writer exists yet, add a SECURITY DEFINER function before the feature goes live.

10. **P1-a: EOS overlapping SELECT policies** — 20 tables; systematic cleanup. Medium effort. Merge per-table on a quiet sprint.

---

## Codebase observations

- `unicorn-cms-f09c59e5` at `origin/main` SHA `830c9754` (local HEAD `aa81aab0` — 20 commits behind). Audit conducted against origin/main.
- Three migrations on origin not yet in local: `20260512000025`, `20260512012213`, `20260512021431`.
- Recent unicorn-audit entries (`4c3a5ba`, `ad5f70a`) confirm pdp\_cycles RLS fix and doc-templates/generated-docs buckets were deliberate, audited changes.

## KB changes shipped

None this session.

## Decisions

No new ADRs. Design-intent confirmation needed for BUG-004 and P0-b use case (see items 8 and 7 above).

## Open questions parked

- BUG-004: Is `canAccessClientPortal = fullScope && isContact` the intended final model? If regular full-scope users should reach the portal without being a marked contact, this is still a bug. Carl/Angela to confirm.
- BUG-005: Does the accept-invitation flow set `access_scope = 'academy_only'` when `relationship_role = 'academy_user'`? Verify in accept-invitation edge function.
- P1-g: What is the current Postgres version on Unicorn 2.0-dev? Has the Studio auto-patch applied since 11 May?

## Tag

`audit-2026-05-12-deployment-status`

---

*Vivacity Coaching & Consulting · Unicorn 2.0 · Internal CMS · staff-only, Phase 1*
