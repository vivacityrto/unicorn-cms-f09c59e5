-- Seat-Level Scorecards Tables

-- Main scorecard table (one per seat)
CREATE TABLE public.seat_scorecards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  seat_id uuid NOT NULL REFERENCES public.accountability_seats(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft', 'Active', 'Archived')),
  current_version_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(seat_id)
);

-- Version snapshots for scorecards
CREATE TABLE public.seat_scorecard_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seat_scorecard_id uuid NOT NULL REFERENCES public.seat_scorecards(id) ON DELETE CASCADE,
  tenant_id bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  version_number integer NOT NULL DEFAULT 1,
  change_summary text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  UNIQUE(seat_scorecard_id, version_number)
);

-- Measurables for each scorecard
CREATE TABLE public.seat_measurables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seat_scorecard_id uuid NOT NULL REFERENCES public.seat_scorecards(id) ON DELETE CASCADE,
  tenant_id bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  target_value numeric NOT NULL,
  comparison_type text NOT NULL DEFAULT '>=' CHECK (comparison_type IN ('>=', '<=', '=')),
  frequency text NOT NULL DEFAULT 'Weekly' CHECK (frequency IN ('Weekly')),
  unit text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Weekly entries for measurables
CREATE TABLE public.seat_measurable_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seat_measurable_id uuid NOT NULL REFERENCES public.seat_measurables(id) ON DELETE CASCADE,
  tenant_id bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  week_start_date date NOT NULL,
  actual_value numeric NOT NULL,
  status text NOT NULL GENERATED ALWAYS AS (
    CASE 
      WHEN comparison_type_stored = '>=' AND actual_value >= target_value_stored THEN 'On Track'
      WHEN comparison_type_stored = '<=' AND actual_value <= target_value_stored THEN 'On Track'
      WHEN comparison_type_stored = '=' AND actual_value = target_value_stored THEN 'On Track'
      ELSE 'Off Track'
    END
  ) STORED,
  comparison_type_stored text NOT NULL,
  target_value_stored numeric NOT NULL,
  notes text,
  entered_by uuid NOT NULL,
  entered_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(seat_measurable_id, week_start_date)
);

-- Indexes
CREATE INDEX idx_seat_scorecards_tenant ON public.seat_scorecards(tenant_id);
CREATE INDEX idx_seat_scorecards_seat ON public.seat_scorecards(seat_id);
CREATE INDEX idx_seat_scorecards_status ON public.seat_scorecards(tenant_id, status);
CREATE INDEX idx_seat_scorecard_versions_scorecard ON public.seat_scorecard_versions(seat_scorecard_id);
CREATE INDEX idx_seat_measurables_scorecard ON public.seat_measurables(seat_scorecard_id);
CREATE INDEX idx_seat_measurable_entries_measurable ON public.seat_measurable_entries(seat_measurable_id);
CREATE INDEX idx_seat_measurable_entries_week ON public.seat_measurable_entries(week_start_date);

-- Enable RLS
ALTER TABLE public.seat_scorecards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seat_scorecard_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seat_measurables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seat_measurable_entries ENABLE ROW LEVEL SECURITY;

-- View policies (all tenant users can view)
CREATE POLICY "Users can view their tenant seat scorecards"
ON public.seat_scorecards FOR SELECT TO authenticated
USING (public.user_has_tenant_access(tenant_id));

CREATE POLICY "Users can view their tenant scorecard versions"
ON public.seat_scorecard_versions FOR SELECT TO authenticated
USING (public.user_has_tenant_access(tenant_id));

CREATE POLICY "Users can view their tenant measurables"
ON public.seat_measurables FOR SELECT TO authenticated
USING (public.user_has_tenant_access(tenant_id));

CREATE POLICY "Users can view their tenant measurable entries"
ON public.seat_measurable_entries FOR SELECT TO authenticated
USING (public.user_has_tenant_access(tenant_id));

-- Edit policies for scorecards and measurables (SuperAdmin, Team Leader, Client Admin)
CREATE POLICY "Admins can manage seat scorecards"
ON public.seat_scorecards FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users 
    WHERE user_uuid = auth.uid() 
    AND (
      unicorn_role IN ('Super Admin', 'Team Leader')
      OR (tenant_id = seat_scorecards.tenant_id AND unicorn_role = 'Admin')
    )
  )
);

CREATE POLICY "Admins can manage scorecard versions"
ON public.seat_scorecard_versions FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users 
    WHERE user_uuid = auth.uid() 
    AND (
      unicorn_role IN ('Super Admin', 'Team Leader')
      OR (tenant_id = seat_scorecard_versions.tenant_id AND unicorn_role = 'Admin')
    )
  )
);

CREATE POLICY "Admins can manage measurables"
ON public.seat_measurables FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users 
    WHERE user_uuid = auth.uid() 
    AND (
      unicorn_role IN ('Super Admin', 'Team Leader')
      OR (tenant_id = seat_measurables.tenant_id AND unicorn_role = 'Admin')
    )
  )
);

-- Entry policies - seat owners can enter, admins can manage
CREATE POLICY "Seat owners can enter measurable data"
ON public.seat_measurable_entries FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.seat_measurables sm
    JOIN public.seat_scorecards ss ON sm.seat_scorecard_id = ss.id
    JOIN public.accountability_seat_assignments asa ON ss.seat_id = asa.seat_id
    WHERE sm.id = seat_measurable_entries.seat_measurable_id
    AND asa.user_id = auth.uid()
    AND asa.end_date IS NULL
    AND public.user_has_tenant_access(seat_measurable_entries.tenant_id)
  )
  OR EXISTS (
    SELECT 1 FROM public.users 
    WHERE user_uuid = auth.uid() 
    AND (
      unicorn_role IN ('Super Admin', 'Team Leader')
      OR (tenant_id = seat_measurable_entries.tenant_id AND unicorn_role = 'Admin')
    )
  )
);

CREATE POLICY "Admins can manage measurable entries"
ON public.seat_measurable_entries FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users 
    WHERE user_uuid = auth.uid() 
    AND (
      unicorn_role IN ('Super Admin', 'Team Leader')
      OR (tenant_id = seat_measurable_entries.tenant_id AND unicorn_role = 'Admin')
    )
  )
);

-- Audit trigger for seat scorecard changes
CREATE TRIGGER audit_seat_scorecards
AFTER INSERT OR UPDATE OR DELETE ON public.seat_scorecards
FOR EACH ROW EXECUTE FUNCTION public.audit_accountability_chart_change();

CREATE TRIGGER audit_seat_scorecard_versions
AFTER INSERT ON public.seat_scorecard_versions
FOR EACH ROW EXECUTE FUNCTION public.audit_accountability_chart_change();

CREATE TRIGGER audit_seat_measurables
AFTER INSERT OR UPDATE OR DELETE ON public.seat_measurables
FOR EACH ROW EXECUTE FUNCTION public.audit_accountability_chart_change();

CREATE TRIGGER audit_seat_measurable_entries
AFTER INSERT OR UPDATE ON public.seat_measurable_entries
FOR EACH ROW EXECUTE FUNCTION public.audit_accountability_chart_change();

-- Updated_at triggers
CREATE TRIGGER update_seat_scorecards_updated_at
BEFORE UPDATE ON public.seat_scorecards
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_seat_measurables_updated_at
BEFORE UPDATE ON public.seat_measurables
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();