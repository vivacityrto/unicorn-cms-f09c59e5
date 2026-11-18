-- Rollback for 20261118120000_cst_client_detail.sql: removes the one function it added. Nothing else was changed.
DROP FUNCTION IF EXISTS public.get_cst_client_detail(bigint, date);
