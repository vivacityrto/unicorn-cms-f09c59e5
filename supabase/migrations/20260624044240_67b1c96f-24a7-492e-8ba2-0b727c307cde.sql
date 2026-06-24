CREATE POLICY "oauth_tokens_users_select_own"
  ON public.oauth_tokens
  FOR SELECT
  USING ((SELECT auth.uid()) = user_id);