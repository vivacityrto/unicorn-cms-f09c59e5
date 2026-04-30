-- Per-user daily query cap tracker for client-mode Ask Viv
CREATE TABLE public.ai_client_query_usage (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL
                 REFERENCES public.users(user_uuid) ON DELETE CASCADE,
  tenant_id    bigint      NOT NULL
                 REFERENCES public.tenants(id)      ON DELETE CASCADE,
  query_date   date        NOT NULL DEFAULT CURRENT_DATE,
  query_count  integer     NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_client_query_usage_user_date_unique
    UNIQUE (user_id, query_date)
);

-- Enable RLS (deny-by-default until policies match)
ALTER TABLE public.ai_client_query_usage ENABLE ROW LEVEL SECURITY;

-- Self-read: users can see only their own daily counter
CREATE POLICY "users_select_own_usage"
  ON public.ai_client_query_usage
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Vivacity internal staff: full access
CREATE POLICY "vivacity_internal_all_usage"
  ON public.ai_client_query_usage
  FOR ALL
  TO authenticated
  USING (public.is_vivacity_internal_safe(auth.uid()))
  WITH CHECK (public.is_vivacity_internal_safe(auth.uid()));

-- Maintain updated_at on every UPDATE
CREATE TRIGGER update_ai_client_query_usage_updated_at
  BEFORE UPDATE ON public.ai_client_query_usage
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();