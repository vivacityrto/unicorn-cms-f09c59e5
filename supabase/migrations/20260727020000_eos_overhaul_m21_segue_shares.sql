-- ============================================================
-- EOS Meeting Overhaul — Migration 21 (Segue shares)
-- Hand-authored hotfix, applied via explicit override (root CLAUDE.md),
-- re-confirmed in-session 2026-07-27.
--
-- The Segue segment was a single shared free-text notes field
-- (eos_meeting_segments.notes) with two real bugs found live: the local
-- state backing it was never hydrated from the DB (so it always rendered
-- blank, even after a save), and it had no realtime broadcast wired up.
-- User feedback confirmed the intended UX is per-person contributions
-- ("we usually share OUR personal and professional win"), not one shared
-- scratchpad where the last save wins - so instead of patching the shared
-- textarea, this replaces it with a per-person list, mirroring
-- eos_headlines exactly (same RLS shape: broad Vivacity-team access,
-- client-viewer read visibility, own-entry delete, workspace scoping).
-- No FK on user_id, matching eos_headlines/eos_meeting_participants -
-- there is no bridging FK from public.users to auth.users in this schema,
-- so user_id is resolved client-side same as the other participant lists.
-- ============================================================

BEGIN;

CREATE TABLE public.eos_segue_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.eos_meetings(id) ON DELETE CASCADE,
  user_id uuid,
  personal_win text NOT NULL,
  professional_win text NOT NULL,
  rating smallint CHECK (rating IS NULL OR (rating BETWEEN 1 AND 10)),
  created_at timestamptz DEFAULT now(),
  workspace_id uuid DEFAULT public.get_vivacity_workspace_id() REFERENCES public.eos_workspaces(id)
);

ALTER TABLE public.eos_segue_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eos_segue_shares REPLICA IDENTITY FULL;

CREATE POLICY eos_segue_shares_select ON public.eos_segue_shares
  FOR SELECT
  USING (
    public.is_vivacity_team_user((SELECT auth.uid()))
    OR public.is_super_admin()
    OR public.is_meeting_participant((SELECT auth.uid()), meeting_id)
  );

CREATE POLICY eos_segue_shares_client_viewer_select ON public.eos_segue_shares
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.users u
      JOIN public.eos_meetings m ON (m.client_id = u.client_id)
      WHERE u.user_uuid = (SELECT auth.uid())
        AND m.id = eos_segue_shares.meeting_id
        AND public.has_eos_role((SELECT auth.uid()), m.tenant_id, 'client_viewer'::eos_role)
    )
  );

CREATE POLICY eos_segue_shares_insert ON public.eos_segue_shares
  FOR INSERT
  WITH CHECK (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.eos_meetings m
      WHERE m.id = eos_segue_shares.meeting_id
        AND (m.tenant_id = public.get_current_user_tenant()
             OR public.is_meeting_participant((SELECT auth.uid()), eos_segue_shares.meeting_id))
    )
  );

CREATE POLICY eos_segue_shares_vivacity_insert ON public.eos_segue_shares
  FOR INSERT
  WITH CHECK (
    public.is_vivacity_team_user((SELECT auth.uid()))
    AND (workspace_id IS NULL OR workspace_id = public.get_vivacity_workspace_id())
  );

CREATE POLICY eos_segue_shares_update ON public.eos_segue_shares
  FOR UPDATE
  USING (public.is_super_admin() OR user_id = (SELECT auth.uid()));

CREATE POLICY eos_segue_shares_vivacity_update ON public.eos_segue_shares
  FOR UPDATE
  USING (public.is_vivacity_team_user((SELECT auth.uid())))
  WITH CHECK (public.is_vivacity_team_user((SELECT auth.uid())));

CREATE POLICY eos_segue_shares_delete ON public.eos_segue_shares
  FOR DELETE
  USING (public.is_super_admin() OR user_id = (SELECT auth.uid()));

CREATE POLICY eos_segue_shares_vivacity_delete ON public.eos_segue_shares
  FOR DELETE
  USING (public.is_vivacity_team_user((SELECT auth.uid())));

ALTER PUBLICATION supabase_realtime ADD TABLE public.eos_segue_shares;

NOTIFY pgrst, 'reload schema';

COMMIT;
