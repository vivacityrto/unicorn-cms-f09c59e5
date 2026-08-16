-- Single-use marker for OAuth CSRF state rows.
-- Nullable: existing unconsumed rows stay valid until expires_at.
-- Edge functions set consumed_at on first exchange and refuse reuse.

ALTER TABLE public.oauth_states
  ADD COLUMN IF NOT EXISTS consumed_at timestamptz;

COMMENT ON COLUMN public.oauth_states.consumed_at IS
  'Set on first authorization-code exchange. NULL means unused; a non-null value makes the state single-use even if the row is still within its 10-minute TTL.';

CREATE INDEX IF NOT EXISTS idx_oauth_states_consumed_at
  ON public.oauth_states (consumed_at)
  WHERE consumed_at IS NULL;
