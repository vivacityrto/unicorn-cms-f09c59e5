-- OAuth states table for CSRF protection during OAuth flow
CREATE TABLE IF NOT EXISTS public.oauth_states (
  state text PRIMARY KEY,
  data jsonb NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.oauth_states ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (used by edge functions)
CREATE POLICY "Service role can manage oauth states" ON public.oauth_states
  FOR ALL USING (true);

-- Clean up expired states (index for cleanup query)
CREATE INDEX idx_oauth_states_expires ON public.oauth_states(expires_at);