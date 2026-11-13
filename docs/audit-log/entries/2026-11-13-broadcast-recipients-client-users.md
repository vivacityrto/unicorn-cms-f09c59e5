# Audit: 2026-11-13 — broadcast-recipients-client-users

**Trigger:** ad-hoc (a report that the client "User" role cannot receive messages or broadcasts)
**Scope:** how a broadcast builds its recipient list and delivers, how a direct message reaches client users, and what production currently does for `tenant_users` rows with `relationship_role = 'user'`. Read-only checks of production ref `yxkgdalkbrriasiyyrwk` (function bodies, policies, triggers, row counts) plus the repo code. Not covered: a live send, a real User login, the Vivacity staff `unicorn_role` values, and the `unicorn-qa` target. "User" here means the client-side relationship role (`role = 'child'`, `relationship_role = 'user'`), not a staff role.

## Findings

- **Direct messages reach Users.** Starting a conversation in `TeamCommunicationsPage.tsx` adds every `tenant_users` row for the tenant as a participant with no role filter. Message read access (`tm_select_participant`, `cp_select_member`) is participant membership, and `fn_tm_on_message_insert` notifies every participant except `access_scope = 'academy_only'`. Nothing in this path excludes a User.
- **Broadcast recipient list excludes Users in production.** `BulkMessageDialog.tsx` sends `include_roles = ['parent', 'user']`. The live `fn_preview_broadcast_recipients` filters only on `tu.role = ANY(p_include_roles)`. Users carry `role = 'child'`, so `'user'` matches nothing. `fn_queue_broadcast_campaign` builds `broadcast_recipients` by calling that function, so one function governs both the preview and the queued recipient rows.
- **The fix is already on `main` but not live.** `supabase/migrations/20260907090000_broadcast_include_user_relationship_role.sql` adds `OR tu.relationship_role = ANY(p_include_roles)`. The live function body has no `relationship_role` clause. The repo applies migrations through the Supabase MCP under new timestamps, so the file's version number being absent from `schema_migrations` proves nothing on its own; the function body is the evidence.
- **Users still get the broadcast message itself, in practice.** `send-broadcast-campaign` groups recipients by tenant, creates one conversation per tenant and adds every `tenant_users` row for that tenant as a participant. Every one of the 18 active tenants that has a full-access User also has a full-access `parent` member, so each already gets a conversation and its Users are mirrored in as participants. The gap is therefore the recipient record, not message access: Users get no `broadcast_recipients` row, so they are missing from the campaign's recipient count, per-recipient delivery status and read tracking, and they would be missed entirely in a tenant that had no `parent` member. This corrects the first read of this issue, which treated the exclusion as Users not receiving broadcasts at all; that was not tested live and the mirror step makes it too strong.
- **Size.** Production `tenant_users`: 411 primary contact and 69 secondary contact (`role = 'parent'`), 52 User (`child` / `user`, full access), 15 `child` with null `relationship_role` (full access), 72 academy-only. In active tenants other than 6372, 43 Users across 18 tenants would join the recipient list, plus 1 null-role `child` that the fix still would not match. 11 campaigns have been sent, 4 in the last 90 days.
- **Unexplained.** 34 `broadcast_recipients` rows belong to user/tenant pairs that are `relationship_role = 'user'` today. Either the role changed after sending or the campaign was created with different `include_roles`. Not investigated.
- **Parked hazard in the migration file.** Two migration files share the version prefix `20260907090000` (this one and `..._fix_academy_assessment_questions_completed_enrolments.sql`). Harmless under MCP-applied migrations, but a CLI-based apply would collide.

## KB changes shipped

- This entry and its INDEX line. No other KB change.

## Code changes

- None in this entry. The fix is the existing migration on `main`; this entry records the finding and the rollout plan below. No production change was made while auditing.

## Rollout plan (not yet run; needs Carl's explicit go-ahead before any production write)

1. **Preflight, read-only, production.** Confirm exactly one `fn_preview_broadcast_recipients(text, text, text[])` and that its body still lacks `relationship_role`. Re-run the active-tenant counts above and record them.
2. **Verify on `unicorn-qa` first.** Apply the migration to `unicorn-qa`, then in a transaction rolled back by a raised exception: impersonate a Vivacity staff caller, run the function with `ARRAY['parent','user']` for `everyone`, and confirm Users now appear and `academy_only` users and tenant 6372 still do not. Confirm a non-staff caller still gets `Access denied`.
3. **Apply to production** through the Supabase MCP `apply_migration`, plain SQL with no HTML escaping. The statement is `CREATE OR REPLACE` with an unchanged signature `(text, text, text[])`, so it replaces the existing function and cannot create an overload. No table, policy, trigger or grant changes.
4. **Postflight, read-only.** One row in `pg_proc` for the name; body now contains `relationship_role`; `SECURITY DEFINER` with `search_path = public`; EXECUTE held by `authenticated` and not `anon` or `PUBLIC`. Re-run the recipient count with the same predicate and expect roughly 43 more distinct users than before (a user in two tenants is counted once because of `DISTINCT ON (tu.user_id)`). Do not send a broadcast to test; use a staff-session preview in the UI and read the count.
5. **Rollback.** Re-apply the previous body, which is the same function with the filter reduced to `tu.role = ANY(p_include_roles)`. Existing `broadcast_recipients` rows are untouched by either direction, and no campaign is queued by the migration itself.
6. **Effect to tell staff.** The next broadcast will count and track client Users as individual recipients. Message delivery to them does not change.

## Decisions

- Pending: apply to production after steps 1 to 2 (Carl's approval).
- Fix by widening the role match in the existing function, as the migration does, rather than changing what the dialog sends, so old campaign rows that stored `['parent']` keep working.

## Open questions parked

- The 15 `child` rows with a null `relationship_role` (1 in an active tenant) match neither `parent` nor `user`. Whether they should receive broadcasts is a product decision, not assumed here.
- Whether the 34 existing User recipient rows are a role change after sending or a different `include_roles` on an old campaign.
- The duplicate `20260907090000` migration prefix.
- A live check with a real User session (inbox shows a broadcast; notification appears) was not run; the conclusions come from code and policy reads.
