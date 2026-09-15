-- is_qa_persona was added without an explicit per-column SELECT grant for
-- `authenticated` -- same gap class as the 2026-08-25 is_system_account
-- incident (see docs/audit-log/entries/2026-08-25-grant-authenticated-select-is-system-account.md).
-- Every frontend .eq('is_qa_persona', ...) filter added in this PR would
-- 403 for logged-in users without this grant. Kept as its own migration
-- (rather than folded into the column-add migration above) to mirror
-- exactly what was applied live via MCP, in the order it was discovered
-- and fixed.

GRANT SELECT (is_qa_persona) ON public.users TO authenticated;
