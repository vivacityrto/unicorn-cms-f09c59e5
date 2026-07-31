-- =====================================================
-- Correction to 20260731040000_ask_viv_role_gating_and_thread_rls.sql
--
-- That migration was based on an incomplete read of migration history: it
-- treated is_vivacity_staff() as still holding its original (20260217004131)
-- hardcoded 3-role list, and treated assistant_threads/assistant_messages as
-- still Super-Admin-only per the original 20260205035602 migration. Neither
-- was true by the time this session ran:
--
-- 1. is_vivacity_staff() was already consolidated on 20260609072651 into a
--    thin alias delegating to is_vivacity_team_safe(), which checks
--    users.is_vivacity_internal (a dedicated boolean column, correctly
--    excluding archived/disabled staff) rather than an enumerated role
--    list. Overwriting it with a hardcoded 7-role list undid that
--    consolidation and dropped the archived/disabled exclusion — a real
--    regression, even though (verified) every current user's role-list
--    membership and is_vivacity_internal flag happen to agree today.
--
-- 2. assistant_threads/assistant_messages RLS was already loosened to
--    ownership-only (no role check at all) by 20260206214240 ("Phase 4C:
--    RLS Policy Standardization"), superseding the original Super-Admin-only
--    policies. The staff-scoped policies added in the prior migration were
--    therefore pure no-ops — Postgres OR's multiple permissive policies for
--    the same command together, so the pre-existing, more permissive
--    ownership-only policies already granted the access being "added".
--
-- This migration restores both to their correct, already-intentional state.
-- =====================================================

CREATE OR REPLACE FUNCTION public.is_vivacity_staff(p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.is_vivacity_team_safe(p_user);
$$;

DROP POLICY IF EXISTS "assistant_threads_staff_own" ON public.assistant_threads;
DROP POLICY IF EXISTS "assistant_messages_staff_via_thread" ON public.assistant_messages;
