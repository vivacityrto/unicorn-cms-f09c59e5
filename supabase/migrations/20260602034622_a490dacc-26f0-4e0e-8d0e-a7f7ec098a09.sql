ALTER TABLE public.user_invitations
  ADD COLUMN IF NOT EXISTS delivery_status text,
  ADD COLUMN IF NOT EXISTS delivery_event_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_user_invitations_delivery_status
  ON public.user_invitations (delivery_status);