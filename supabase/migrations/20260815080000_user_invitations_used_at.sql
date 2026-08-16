-- Single-use invitation tokens: record when a pending invite is claimed.
-- used_at is nullable so existing INSERT/UPDATE writers (invite-user,
-- activate-ghost-user, accept_invitation_v2, resend-invite, cancel-invite)
-- do not need to supply it.
--
-- 'successful' is added to the status CHECK because set-invite-password
-- claims a token with status='successful'. The live constraint only allowed
-- pending/sent/expired/failed/accepted/revoked; without this the claim
-- UPDATE would fail. accept_invitation_v2 already treats 'successful' as
-- already-consumed (ALREADY_ACCEPTED).

ALTER TABLE public.user_invitations
  ADD COLUMN IF NOT EXISTS used_at timestamptz;

COMMENT ON COLUMN public.user_invitations.used_at IS
  'Set when the invitation token is claimed (single-use). Null means unused.';

ALTER TABLE public.user_invitations
  DROP CONSTRAINT IF EXISTS user_invitations_status_check;

ALTER TABLE public.user_invitations
  ADD CONSTRAINT user_invitations_status_check
  CHECK (status = ANY (ARRAY[
    'pending'::text,
    'sent'::text,
    'expired'::text,
    'failed'::text,
    'accepted'::text,
    'revoked'::text,
    'successful'::text
  ]));

-- Ghost-activation claims set status='successful' rather than 'accepted'.
-- Fire the same accepted-timeline event so those completions are visible.
DROP TRIGGER IF EXISTS trg_invitation_accepted_timeline ON public.user_invitations;
CREATE TRIGGER trg_invitation_accepted_timeline
  AFTER UPDATE OF status ON public.user_invitations
  FOR EACH ROW
  WHEN (
    OLD.status IS DISTINCT FROM NEW.status
    AND NEW.status = ANY (ARRAY['accepted'::text, 'successful'::text])
  )
  EXECUTE FUNCTION public.fn_invitation_accepted_timeline_trigger();

NOTIFY pgrst, 'reload schema';
