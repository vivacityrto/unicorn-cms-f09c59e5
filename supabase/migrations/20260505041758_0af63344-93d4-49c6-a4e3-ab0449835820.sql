-- =====================================================================
-- Suggestion Register — M2 of 3: data backfill only
-- Marks existing client-authored suggest_items as visible to clients.
-- No schema changes, no RLS changes, no triggers (those are M1 and M3).
--
-- Lock impact: per-row write locks only. Pre-flight: 0 rows affected
-- (all 8 existing rows authored by Vivacity staff). Off-peak NOT required.
--
-- Verification (post-state expected: visible = 0, total = 8):
--   SELECT count(*) FILTER (WHERE is_client_visible) AS visible,
--          count(*) AS total
--     FROM public.suggest_items;
--
-- Sanity (expect 0 rows — no staff member should appear):
--   SELECT si.id, u.unicorn_role
--     FROM public.suggest_items si
--     LEFT JOIN public.users u ON u.user_uuid = si.created_by
--    WHERE si.is_client_visible = true;
--
-- Rollback (reverse the same predicate):
--   UPDATE public.suggest_items si
--      SET is_client_visible = false
--    WHERE created_by IN (
--      SELECT user_uuid FROM public.users
--       WHERE unicorn_role IS NULL
--          OR unicorn_role NOT IN ('Super Admin','Team Leader','Team Member')
--    );
-- =====================================================================

UPDATE public.suggest_items si
   SET is_client_visible = true
  WHERE created_by IN (
    SELECT user_uuid FROM public.users
     WHERE unicorn_role IS NULL
        OR unicorn_role NOT IN ('Super Admin','Team Leader','Team Member')
  );