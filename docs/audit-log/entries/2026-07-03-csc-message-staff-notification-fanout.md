# Audit: 2026-07-03 — CSC message staff notification fan-out

**Trigger:** Ad-hoc — Carl asked why internal staff receive no bell notification when a client sends a "Message CSC" message, and requested the behaviour change so all internal staff can be notified.
**Scope:** `public.tenant_messages` → `public.user_notifications` fan-out via trigger `trg_tm_on_message_insert` / function `fn_tm_on_message_insert()`, and its `EXECUTE` grants. Followed `unicorn-kb/handoffs/lovable-production-db-change.md` in full (audit → design-decisions gate → implementation plan → apply → verify). Out of scope: two concurrent migrations applied by Angela in a separate Lovable session during the same window (`tenant_users_insert` RLS policy change, `auto_assign_consultant` fix) — see "Concurrent changes observed" below; not reviewed or authored by this session.

---

## Findings

- **Root cause of "no bell notification":** `fn_tm_on_message_insert()` only ever notified `conversation_participants` that also had a matching `tenant_users` row for that tenant (INNER JOIN). Internal staff never have a `tenant_users` row for a client's tenant, so they were silently excluded — by original design (per `unicorn-kb/codebase-state/messaging-pipeline.md`, "not a bug"), not a defect. Business decision: change the design so all internal staff receive a notification on client-sent messages.
- **Design decisions confirmed with Carl before implementation:** (1) "internal staff" = all users matching `is_vivacity_internal = true AND archived = false AND disabled = false` (19 active users, no role narrowing); (2) notification title prefixed with the client tenant's display name (`public.tenants.name`) so staff can identify which client messaged, since most of the 19 don't work that tenant.
- **Bug caught in Lovable's first implementation draft, before deploy:** the draft resolved the tenant display name via `public.tenants WHERE tenant_id = _tenant_id` — `tenant_id` does not exist on `public.tenants` (its PK is `id`). Verified directly against `information_schema.columns` and `pg_index`. This lookup sits outside the function's inner exception-handling block, so left uncorrected it would have raised an unhandled exception on every client-sent message, aborting the `tenant_messages` INSERT entirely — i.e. clients would have been unable to send messages at all. Sent back for correction before approval; corrected version verified against live schema before apply.
- **Function hardening folded into the same migration:** `fn_tm_on_message_insert()` was upgraded from `SET search_path TO 'public'` to `SET search_path = ''` (all references already fully schema-qualified), and grants tightened to `REVOKE ALL ... FROM PUBLIC` + explicit `GRANT EXECUTE ... TO authenticated, service_role`.
- **Follow-up migration:** the function pre-dated this session with `EXECUTE` also granted to `anon` (legacy default grant, unrelated to this session's changes). Since the function is only ever invoked via trigger — never called directly/via RPC — `anon` did not need it. Revoked in a second, separate migration.
- **Post-implementation verification (performed directly against production via Supabase MCP, not just taking the "applied successfully" report at face value):**
  - Pulled the live function definition and confirmed it matches the approved corrected body, byte-for-byte.
  - Confirmed live grants: `anon` removed, `authenticated` + `service_role` present.
  - Confirmed exactly one migration (`20260703061102`) shipped this change — no unrelated statements bundled into it.
  - Ran a live dry-run against the QA test tenant (Test RTO A, tenant 7517): inserted a synthetic client message inside a `DO` block that forces a `RAISE EXCEPTION` after reading results, guaranteeing the INSERT and all trigger side-effects roll back regardless of outcome. Result: **exactly 19 notification rows**, all titled `"Test RTO A — New message"` (tenant name resolved correctly). Confirmed zero residual rows in either `tenant_messages` or `user_notifications` afterward.
- **Rollback captured and verified** — the pre-change function body was pulled directly from prod via `pg_get_functiondef` before any change, and the rollback SQL supplied in the implementation plan was diffed against that pull and confirmed identical.

## Concurrent changes observed (not part of this session)

While this session's migrations were being applied, two further migrations landed in the same window, both attributed to `angela@vivacity.com.au` in `supabase_migrations.schema_migrations.created_by` (i.e. a separate, concurrent Lovable session — not requested or reviewed as part of this session):

- `20260703061940` — `fix_auto_assign_consultant_on_conflict_target`: rewrites `auto_assign_consultant()`. Not reviewed for correctness by this session.
- `20260703063458` — `tenant_users_insert` RLS policy on `public.tenant_users` tightened: removed an `OR NOT tenant_has_any_users_safe(tenant_id)` clause that allowed an authenticated user to self-insert as the first member of a zero-member ("orphan") tenant, leaving only `is_tenant_parent_safe(tenant_id, auth.uid())`. Reported to Carl as fixing a security finding named `tenant_users_insert_orphan_tenant_claim` — **this finding name does not appear anywhere in the live Supabase Security Advisor output** (verified directly); the actual advisor's only "orphan"-related findings concern unrelated functions (`audit_orphan_auth_users()`, `audit_orphan_profiles()`).
  - Checked for immediate breakage risk only (not a full review): no orphan (zero-`tenant_users`) tenants exist currently; no client-side code path in `src/` inserts into `tenant_users` directly (all real provisioning paths — `accept_invitation_v2` RPC, `invite-user`/`provision-m365-user`/`import-unicorn1-client` edge functions — are `SECURITY DEFINER` or service-role, bypassing RLS regardless of this policy). No evidence of active breakage found.
  - Carl's call: accept as-is for now ("as long as nothing broke its fine"). Not rolled back. Flagged here for traceability; full review/reconciliation deferred to Carl/Angela outside this session.

## KB changes shipped

- `unicorn-kb@<pending — branch kb/messaging-staff-fanout>`: updated `codebase-state/messaging-pipeline.md` — documented the Branch A/Branch B UNION fan-out logic, the staff notification addition, and marked the old "staff excluded — not a bug" note as historical.

## Codebase observations (read-only)

- `unicorn-cms-f09c59e5@2782e17f50ae590778ebdccac8c79b38f8b5a1e5` (origin/main at time of audit): includes this session's `fn_tm_on_message_insert()` changes plus the two concurrent Angela migrations noted above, plus unrelated same-window commits ("Updated system prompts", "Added extra gap to section headers") not investigated as part of this audit.

## Decisions

- Staff notification scope: all `is_vivacity_internal` users, no role narrowing (Carl, 2026-07-03).
- Notification title: tenant-name-prefixed for the staff branch only; tenant-scoped participants keep the existing plain title (Carl, 2026-07-03).
- `anon` EXECUTE grant on `fn_tm_on_message_insert()`: revoked, no longer needed (trigger-only invocation).

## Open questions parked

- The `tenant_users_insert` RLS narrowing and `auto_assign_consultant` fix (both Angela's, concurrent) have not been formally audited. Recommend Angela (or whoever ran that session) author their own audit entry per the standard authorship rule, or Carl reconcile directly with her.
- What tool/process produced the `tenant_users_insert_orphan_tenant_claim` finding name Lovable cited, if not the Supabase Security Advisor — worth confirming so future sessions know whether to trust that naming.
- Two people (Carl, Angela) applied migrations to the same production database concurrently in separate, uncoordinated Lovable sessions this session window. No collision occurred this time, but worth a process conversation.

---

## Tag
`audit-2026-07-03-csc-message-staff-notification-fanout`
