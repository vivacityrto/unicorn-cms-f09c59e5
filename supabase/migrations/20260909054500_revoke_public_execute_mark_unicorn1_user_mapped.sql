-- Follow-up to 20260909050000_mark_unicorn1_user_mapped_rpc.sql: CREATE
-- FUNCTION grants EXECUTE to PUBLIC by default, and the prior migration's
-- "REVOKE ... FROM authenticated, anon" only strips named grants -- it never
-- touched the implicit PUBLIC grant those roles were actually reaching the
-- function through (confirmed via pg_proc.proacl: "=X/postgres" was present,
-- i.e. PUBLIC still had EXECUTE). search_unicorn1_users, the function this
-- was meant to mirror, has no PUBLIC entry in its ACL at all, so its revoke
-- was effective. Revoking FROM PUBLIC closes the actual leak.
REVOKE EXECUTE ON FUNCTION public.mark_unicorn1_user_mapped(bigint, uuid) FROM PUBLIC;
