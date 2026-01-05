-- ============================================================================
-- TGA INTEGRATION REDESIGN - Full Database Schema
-- ============================================================================

-- 1. TGA Links - Core client link table
CREATE TABLE IF NOT EXISTS public.tga_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients_legacy(id) ON DELETE CASCADE,
  rto_number text NOT NULL,
  is_linked boolean NOT NULL DEFAULT true,
  link_status text NOT NULL DEFAULT 'linked' 
    CHECK (link_status IN ('linked', 'unlinked', 'invalid_rto', 'not_found', 'error')),
  last_sync_at timestamptz NULL,
  last_sync_status text NULL 
    CHECK (last_sync_status IS NULL OR last_sync_status IN ('success', 'partial', 'failed')),
  last_sync_error text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tga_links_rto_format CHECK (rto_number ~ '^\d{4,6}$'),
  CONSTRAINT tga_links_client_unique UNIQUE (client_id)
);

-- 2. TGA Import Runs - Track each dataset import
CREATE TABLE IF NOT EXISTS public.tga_import_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_type text NOT NULL CHECK (run_type IN ('scheduled', 'manual')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz NULL,
  status text NOT NULL DEFAULT 'running' 
    CHECK (status IN ('running', 'success', 'failed')),
  source_ref text NULL,
  source_checksum text NULL,
  records_processed int NOT NULL DEFAULT 0,
  error_message text NULL,
  created_by uuid NULL
);

CREATE INDEX IF NOT EXISTS idx_tga_import_runs_started 
  ON public.tga_import_runs(started_at DESC);

-- 3. TGA RTOs - Normalised RTO snapshot table
CREATE TABLE IF NOT EXISTS public.tga_rtos (
  rto_number text PRIMARY KEY,
  legal_name text NULL,
  trading_name text NULL,
  abn text NULL,
  status text NULL,
  registration_start date NULL,
  registration_end date NULL,
  cricos_provider_number text NULL,
  website text NULL,
  phone text NULL,
  email text NULL,
  address_json jsonb NULL,
  last_seen_in_import_id uuid REFERENCES public.tga_import_runs(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tga_rtos_abn ON public.tga_rtos(abn);
CREATE INDEX IF NOT EXISTS idx_tga_rtos_status ON public.tga_rtos(status);
CREATE INDEX IF NOT EXISTS idx_tga_rtos_import ON public.tga_rtos(last_seen_in_import_id);

-- 4. TGA Scope Items - RTO scope data
CREATE TABLE IF NOT EXISTS public.tga_scope_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rto_number text NOT NULL REFERENCES public.tga_rtos(rto_number) ON DELETE CASCADE,
  code text NOT NULL,
  type text NOT NULL 
    CHECK (type IN ('qualification', 'unit', 'skill_set', 'accredited_course', 'short_course')),
  title text NULL,
  status text NULL 
    CHECK (status IS NULL OR status IN ('current', 'superseded', 'removed', 'unknown')),
  currency_start date NULL,
  currency_end date NULL,
  import_id uuid REFERENCES public.tga_import_runs(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tga_scope_items_unique UNIQUE (rto_number, code, type, import_id)
);

CREATE INDEX IF NOT EXISTS idx_tga_scope_items_rto ON public.tga_scope_items(rto_number);
CREATE INDEX IF NOT EXISTS idx_tga_scope_items_code ON public.tga_scope_items(code);
CREATE INDEX IF NOT EXISTS idx_tga_scope_items_type ON public.tga_scope_items(type);

-- 5. Client TGA Snapshot - Fast UI materialised view
CREATE TABLE IF NOT EXISTS public.client_tga_snapshot (
  client_id uuid PRIMARY KEY REFERENCES public.clients_legacy(id) ON DELETE CASCADE,
  rto_number text NOT NULL,
  rto_status text NULL,
  registration_end date NULL,
  scope_total int NOT NULL DEFAULT 0,
  quals_total int NOT NULL DEFAULT 0,
  units_total int NOT NULL DEFAULT 0,
  skill_sets_total int NOT NULL DEFAULT 0,
  last_sync_at timestamptz NULL,
  source_import_id uuid NULL REFERENCES public.tga_import_runs(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 6. TGA Import State - Track latest successful import
CREATE TABLE IF NOT EXISTS public.tga_import_state (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  latest_success_import_id uuid NULL REFERENCES public.tga_import_runs(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Insert default state row
INSERT INTO public.tga_import_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- RLS Policies
-- ============================================================================

-- Enable RLS
ALTER TABLE public.tga_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tga_import_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tga_rtos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tga_scope_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_tga_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tga_import_state ENABLE ROW LEVEL SECURITY;

-- TGA Links - Client-scoped with admin write access
CREATE POLICY "tga_links_select" ON public.tga_links
  FOR SELECT USING (true);

CREATE POLICY "tga_links_insert" ON public.tga_links
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE user_uuid = auth.uid() 
      AND role IN ('superadmin', 'admin')
    )
  );

CREATE POLICY "tga_links_update" ON public.tga_links
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE user_uuid = auth.uid() 
      AND role IN ('superadmin', 'admin')
    )
  );

CREATE POLICY "tga_links_delete" ON public.tga_links
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE user_uuid = auth.uid() 
      AND role IN ('superadmin', 'admin')
    )
  );

-- TGA Import Runs - Global read, superadmin write
CREATE POLICY "tga_import_runs_select" ON public.tga_import_runs
  FOR SELECT USING (true);

CREATE POLICY "tga_import_runs_insert" ON public.tga_import_runs
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE user_uuid = auth.uid() 
      AND role = 'superadmin'
    )
  );

CREATE POLICY "tga_import_runs_update" ON public.tga_import_runs
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE user_uuid = auth.uid() 
      AND role = 'superadmin'
    )
  );

-- TGA RTOs - Global read-only for users, system writes via service role
CREATE POLICY "tga_rtos_select" ON public.tga_rtos
  FOR SELECT USING (true);

CREATE POLICY "tga_rtos_all" ON public.tga_rtos
  FOR ALL USING (auth.role() = 'service_role');

-- TGA Scope Items - Global read-only for users
CREATE POLICY "tga_scope_items_select" ON public.tga_scope_items
  FOR SELECT USING (true);

CREATE POLICY "tga_scope_items_all" ON public.tga_scope_items
  FOR ALL USING (auth.role() = 'service_role');

-- Client TGA Snapshot - Client-scoped read, system writes
CREATE POLICY "client_tga_snapshot_select" ON public.client_tga_snapshot
  FOR SELECT USING (true);

CREATE POLICY "client_tga_snapshot_all" ON public.client_tga_snapshot
  FOR ALL USING (auth.role() = 'service_role');

-- TGA Import State - Global read, system writes
CREATE POLICY "tga_import_state_select" ON public.tga_import_state
  FOR SELECT USING (true);

CREATE POLICY "tga_import_state_all" ON public.tga_import_state
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- Trigger for updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_tga_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tga_links_updated_at
  BEFORE UPDATE ON public.tga_links
  FOR EACH ROW EXECUTE FUNCTION public.update_tga_updated_at();

CREATE TRIGGER tga_rtos_updated_at
  BEFORE UPDATE ON public.tga_rtos
  FOR EACH ROW EXECUTE FUNCTION public.update_tga_updated_at();

CREATE TRIGGER client_tga_snapshot_updated_at
  BEFORE UPDATE ON public.client_tga_snapshot
  FOR EACH ROW EXECUTE FUNCTION public.update_tga_updated_at();

CREATE TRIGGER tga_import_state_updated_at
  BEFORE UPDATE ON public.tga_import_state
  FOR EACH ROW EXECUTE FUNCTION public.update_tga_updated_at();