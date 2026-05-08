SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

DROP INDEX IF EXISTS public.idx_user_notifications_dedupe_key;