-- Pre-state dry-run (captured 2026-05-19): exactly 1 row matched
-- (id 1a45a5b1-4414-4820-b340-2c29c4b79176, Khian d695317e-ed0c-4450-83c5-b3b25808edc2,
--  type suggestion_submitted, created_at 2026-05-06 04:48:31+00, tenant 7517)
--
-- SELECT un.id, un.user_id, un.type, un.created_at, tu.tenant_id
-- FROM public.user_notifications un
-- JOIN public.tenant_users tu ON tu.user_id = un.user_id
-- WHERE tu.access_scope = 'academy_only';

DELETE FROM public.user_notifications un
USING public.tenant_users tu
WHERE tu.user_id = un.user_id
  AND tu.access_scope = 'academy_only'
RETURNING un.id, un.user_id, un.type;