-- Audit finding C2: force personal_email/personal_phone reads through the
-- already-correct get_user_private_contact() RPC (owner-or-admin.team_users.manage
-- gate) instead of the broad users_select_staff RLS policy.
-- Verified live (15 Jul 2026, post-deploy of PR #6, pg_stat_statements reset +
-- re-check): zero remaining direct-select queries against these two columns,
-- only the RPC is being called.
-- street_address / po_box_address intentionally excluded (organisational
-- RTO/tenant fields per product decision, not personal contact info).
REVOKE SELECT (personal_email, personal_phone) ON public.users FROM authenticated;
NOTIFY pgrst, 'reload schema';