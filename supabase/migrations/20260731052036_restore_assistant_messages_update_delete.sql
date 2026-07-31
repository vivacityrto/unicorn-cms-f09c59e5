-- =====================================================
-- Fix: assistant_messages had no UPDATE/DELETE policy at all.
--
-- Caught by Cursor Bugbot on PR #112. The original (20260205035602) FOR ALL
-- policy "assistant_messages_via_thread" covered UPDATE/DELETE; the Feb 6
-- "Phase 4C: RLS Policy Standardization" migration (20260206214240) only
-- replaced SELECT and INSERT with new policies and never touched
-- "assistant_messages_via_thread" by name, so it likely remained the sole
-- UPDATE/DELETE allow-path. This session's role-gating migration
-- (20260731035754) dropped it and replaced it with a FOR ALL staff policy —
-- fine on its own — but the follow-up correction (20260731040112) dropped
-- that replacement too, without restoring anything for UPDATE/DELETE,
-- leaving the table with only assistant_messages_select/assistant_messages_insert.
--
-- Verified live before this migration: pg_policies shows exactly those two
-- policies and nothing else for assistant_messages.
-- =====================================================
CREATE POLICY "assistant_messages_manage"
  ON public.assistant_messages
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.assistant_threads t
      WHERE t.id = thread_id
      AND t.viewer_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.assistant_threads t
      WHERE t.id = thread_id
      AND t.viewer_user_id = auth.uid()
    )
  );
