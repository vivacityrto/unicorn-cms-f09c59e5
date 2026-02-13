
-- ============================================================
-- TAS Extracts: Structured extraction from Training & Assessment Strategy docs
-- ============================================================

CREATE TABLE public.tas_extracts (
  tas_extract_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id bigint NOT NULL,
  doc_file_id uuid NOT NULL REFERENCES public.doc_files(doc_file_id) ON DELETE CASCADE,
  extracted_json jsonb NOT NULL,
  units text[] NOT NULL DEFAULT '{}',
  delivery_mode text NULL,
  aqf_level text NULL,
  duration_weeks int NULL,
  confidence numeric,
  ai_event_id uuid NULL REFERENCES public.ai_events(ai_event_id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_tas_extracts_tenant ON public.tas_extracts(tenant_id);
CREATE INDEX idx_tas_extracts_doc_file ON public.tas_extracts(doc_file_id);

-- RLS
ALTER TABLE public.tas_extracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tas_extracts_staff_select"
  ON public.tas_extracts FOR SELECT
  USING (is_vivacity_team_safe(auth.uid()));

CREATE POLICY "tas_extracts_staff_insert"
  ON public.tas_extracts FOR INSERT
  WITH CHECK (is_vivacity_team_safe(auth.uid()));

CREATE POLICY "tas_extracts_staff_update"
  ON public.tas_extracts FOR UPDATE
  USING (is_vivacity_team_safe(auth.uid()));

-- Tenant admin can view their own extracts
CREATE POLICY "tas_extracts_tenant_select"
  ON public.tas_extracts FOR SELECT
  USING (has_tenant_access_safe(tenant_id, auth.uid()));

-- ============================================================
-- Trainer Matrix Extracts: Structured extraction from Trainer Matrix docs
-- ============================================================

CREATE TABLE public.trainer_matrix_extracts (
  trainer_matrix_extract_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id bigint NOT NULL,
  doc_file_id uuid NOT NULL REFERENCES public.doc_files(doc_file_id) ON DELETE CASCADE,
  extracted_json jsonb NOT NULL,
  trainers jsonb NOT NULL DEFAULT '[]'::jsonb,
  trainer_unit_links jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence numeric,
  ai_event_id uuid NULL REFERENCES public.ai_events(ai_event_id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_trainer_matrix_extracts_tenant ON public.trainer_matrix_extracts(tenant_id);
CREATE INDEX idx_trainer_matrix_extracts_doc_file ON public.trainer_matrix_extracts(doc_file_id);

-- RLS
ALTER TABLE public.trainer_matrix_extracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trainer_matrix_extracts_staff_select"
  ON public.trainer_matrix_extracts FOR SELECT
  USING (is_vivacity_team_safe(auth.uid()));

CREATE POLICY "trainer_matrix_extracts_staff_insert"
  ON public.trainer_matrix_extracts FOR INSERT
  WITH CHECK (is_vivacity_team_safe(auth.uid()));

CREATE POLICY "trainer_matrix_extracts_staff_update"
  ON public.trainer_matrix_extracts FOR UPDATE
  USING (is_vivacity_team_safe(auth.uid()));

-- Tenant admin can view their own extracts
CREATE POLICY "trainer_matrix_extracts_tenant_select"
  ON public.trainer_matrix_extracts FOR SELECT
  USING (has_tenant_access_safe(tenant_id, auth.uid()));
