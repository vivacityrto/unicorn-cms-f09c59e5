-- Assessment Validation Tool — Sprint 3, schema half (Addendum §3.3/§3.7).
-- Two pieces only in this migration:
--   1. Trial assessment / pilot participant log (5th testing method).
--   2. Reuse the evidence_requests / portal_documents plumbing already
--      wired for audits (A1) so clients can upload assessment kits against
--      a specific validation_tools row, instead of building a parallel
--      upload path.
--
-- Entitlement tracking (Addendum §2, "validations per year per package
-- tier") is deliberately NOT touched here. membership_entitlements turned
-- out to be a single per-cycle status tracker (validation_status /
-- validation_scheduled_date / validation_delivered_at — one validation per
-- membership cycle), not a per-tier annual count. That's a real mismatch
-- against the "2/year vs annual by tier" model in the brief, and building
-- a count-based tracker on top of the wrong table would just create a
-- second, conflicting source of truth. Left for the Sam workshop per the
-- open decisions in the unicorn-assessment-validation-tool skill.

ALTER TABLE public.evidence_requests
  ADD COLUMN validation_tool_id uuid REFERENCES public.validation_tools(id) ON DELETE SET NULL;

CREATE INDEX ON public.evidence_requests (validation_tool_id);

COMMENT ON COLUMN public.evidence_requests.validation_tool_id IS
  'Sprint 3: links an evidence request to a specific assessment tool being validated, reusing the same portal-upload + reminder plumbing built for audits (evidence_requests.audit_id / A1) rather than a parallel kit-upload path.';

CREATE TABLE public.validation_pilot_participants (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id           uuid NOT NULL REFERENCES public.validation_sessions(id) ON DELETE CASCADE,
  participant_ref      text NOT NULL, -- de-identified reference, never a student name (Privacy Act gate)
  pauses_count         integer,
  questions_count      integer,
  misreads_count       integer,
  timeouts_count       integer,
  observation_notes    text,
  debrief_notes        text,
  ai_summary           text,
  ai_summary_generated boolean NOT NULL DEFAULT false,
  created_by           uuid REFERENCES auth.users(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON public.validation_pilot_participants (session_id);

COMMENT ON TABLE public.validation_pilot_participants IS
  'Trial assessment / pilot method (Addendum §3.3, 5th testing method): 3-5 participant log with observation + debrief capture, revision gate before formal use. participant_ref must be de-identified per the AI human-in-the-loop rules (no student names/IDs reach this table or any AI prompt).';
COMMENT ON COLUMN public.validation_pilot_participants.participant_ref IS
  'De-identified reference only (e.g. "Participant 1"), never a student name or ID — matches the de-identification gate required before any content reaches an AI model.';

ALTER TABLE public.validation_pilot_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "validation_pilot_participants_select_tenant_or_staff"
ON public.validation_pilot_participants FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.validation_sessions vs
  JOIN public.validation_tools vt ON vt.id = vs.tool_id
  WHERE vs.id = validation_pilot_participants.session_id
    AND public.has_tenant_access_safe(vt.subject_tenant_id, auth.uid())
));

CREATE POLICY "validation_pilot_participants_write_staff_only"
ON public.validation_pilot_participants FOR ALL TO authenticated
USING (public.is_vivacity_team_safe(auth.uid()))
WITH CHECK (public.is_vivacity_team_safe(auth.uid()));