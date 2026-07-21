ALTER TABLE public.user_invitations
  ADD COLUMN IF NOT EXISTS first_opened_at  timestamptz,
  ADD COLUMN IF NOT EXISTS open_count       integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS first_clicked_at timestamptz,
  ADD COLUMN IF NOT EXISTS click_count      integer NOT NULL DEFAULT 0;