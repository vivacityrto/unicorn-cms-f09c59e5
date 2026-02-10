
-- Populate legacy_login_snapshot from existing users data
-- Using migration context which bypasses RLS
INSERT INTO public.legacy_login_snapshot (user_id, last_sign_in_at)
SELECT user_uuid, last_sign_in_at
FROM public.users
WHERE last_sign_in_at IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;
