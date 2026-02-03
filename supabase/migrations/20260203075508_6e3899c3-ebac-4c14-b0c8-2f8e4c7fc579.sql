-- EOS Accountability Chart Tables
-- Core chart with status and versioning

-- Main chart table (one per tenant)
CREATE TABLE public.accountability_charts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft', 'Active', 'Archived')),
  current_version_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT one_active_per_tenant UNIQUE (tenant_id, status) DEFERRABLE INITIALLY DEFERRED
);

-- Version snapshots
CREATE TABLE public.accountability_chart_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chart_id uuid NOT NULL REFERENCES public.accountability_charts(id) ON DELETE CASCADE,
  tenant_id bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  version_number integer NOT NULL DEFAULT 1,
  change_summary text NOT NULL,
  snapshot jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  UNIQUE(chart_id, version_number)
);

-- Functions (columns in the chart)
CREATE TABLE public.accountability_functions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chart_id uuid NOT NULL REFERENCES public.accountability_charts(id) ON DELETE CASCADE,
  tenant_id bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Seats within functions
CREATE TABLE public.accountability_seats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  function_id uuid NOT NULL REFERENCES public.accountability_functions(id) ON DELETE CASCADE,
  chart_id uuid NOT NULL REFERENCES public.accountability_charts(id) ON DELETE CASCADE,
  tenant_id bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  seat_name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Role bullets/accountabilities per seat
CREATE TABLE public.accountability_seat_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seat_id uuid NOT NULL REFERENCES public.accountability_seats(id) ON DELETE CASCADE,
  tenant_id bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  role_text text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- User assignments to seats
CREATE TABLE public.accountability_seat_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seat_id uuid NOT NULL REFERENCES public.accountability_seats(id) ON DELETE CASCADE,
  tenant_id bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  assignment_type text NOT NULL CHECK (assignment_type IN ('Primary', 'Secondary')),
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  end_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_accountability_charts_tenant ON public.accountability_charts(tenant_id);
CREATE INDEX idx_accountability_charts_status ON public.accountability_charts(tenant_id, status);
CREATE INDEX idx_accountability_functions_chart ON public.accountability_functions(chart_id);
CREATE INDEX idx_accountability_seats_function ON public.accountability_seats(function_id);
CREATE INDEX idx_accountability_seats_chart ON public.accountability_seats(chart_id);
CREATE INDEX idx_accountability_seat_roles_seat ON public.accountability_seat_roles(seat_id);
CREATE INDEX idx_accountability_seat_assignments_seat ON public.accountability_seat_assignments(seat_id);
CREATE INDEX idx_accountability_seat_assignments_user ON public.accountability_seat_assignments(user_id);

-- Enable RLS
ALTER TABLE public.accountability_charts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accountability_chart_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accountability_functions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accountability_seats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accountability_seat_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accountability_seat_assignments ENABLE ROW LEVEL SECURITY;

-- View policies (all tenant users can view)
CREATE POLICY "Users can view their tenant charts"
ON public.accountability_charts FOR SELECT TO authenticated
USING (public.user_has_tenant_access(tenant_id));

CREATE POLICY "Users can view their tenant chart versions"
ON public.accountability_chart_versions FOR SELECT TO authenticated
USING (public.user_has_tenant_access(tenant_id));

CREATE POLICY "Users can view their tenant functions"
ON public.accountability_functions FOR SELECT TO authenticated
USING (public.user_has_tenant_access(tenant_id));

CREATE POLICY "Users can view their tenant seats"
ON public.accountability_seats FOR SELECT TO authenticated
USING (public.user_has_tenant_access(tenant_id));

CREATE POLICY "Users can view their tenant seat roles"
ON public.accountability_seat_roles FOR SELECT TO authenticated
USING (public.user_has_tenant_access(tenant_id));

CREATE POLICY "Users can view their tenant seat assignments"
ON public.accountability_seat_assignments FOR SELECT TO authenticated
USING (public.user_has_tenant_access(tenant_id));

-- Edit policies (SuperAdmin, Team Leader, Client Admin)
CREATE POLICY "Admins can manage charts"
ON public.accountability_charts FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users 
    WHERE user_uuid = auth.uid() 
    AND (
      unicorn_role IN ('Super Admin', 'Team Leader')
      OR (tenant_id = accountability_charts.tenant_id AND tenant_role = 'Admin')
    )
  )
);

CREATE POLICY "Admins can manage chart versions"
ON public.accountability_chart_versions FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users 
    WHERE user_uuid = auth.uid() 
    AND (
      unicorn_role IN ('Super Admin', 'Team Leader')
      OR (tenant_id = accountability_chart_versions.tenant_id AND tenant_role = 'Admin')
    )
  )
);

CREATE POLICY "Admins can manage functions"
ON public.accountability_functions FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users 
    WHERE user_uuid = auth.uid() 
    AND (
      unicorn_role IN ('Super Admin', 'Team Leader')
      OR (tenant_id = accountability_functions.tenant_id AND tenant_role = 'Admin')
    )
  )
);

CREATE POLICY "Admins can manage seats"
ON public.accountability_seats FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users 
    WHERE user_uuid = auth.uid() 
    AND (
      unicorn_role IN ('Super Admin', 'Team Leader')
      OR (tenant_id = accountability_seats.tenant_id AND tenant_role = 'Admin')
    )
  )
);

CREATE POLICY "Admins can manage seat roles"
ON public.accountability_seat_roles FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users 
    WHERE user_uuid = auth.uid() 
    AND (
      unicorn_role IN ('Super Admin', 'Team Leader')
      OR (tenant_id = accountability_seat_roles.tenant_id AND tenant_role = 'Admin')
    )
  )
);

CREATE POLICY "Admins can manage seat assignments"
ON public.accountability_seat_assignments FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users 
    WHERE user_uuid = auth.uid() 
    AND (
      unicorn_role IN ('Super Admin', 'Team Leader')
      OR (tenant_id = accountability_seat_assignments.tenant_id AND tenant_role = 'Admin')
    )
  )
);

-- Audit trigger for accountability chart changes
CREATE OR REPLACE FUNCTION public.audit_accountability_chart_change()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.audit_eos_events (
    tenant_id,
    entity,
    entity_id,
    action,
    user_id,
    details
  ) VALUES (
    COALESCE(NEW.tenant_id, OLD.tenant_id),
    TG_TABLE_NAME,
    COALESCE(NEW.id::text, OLD.id::text),
    TG_OP,
    auth.uid(),
    jsonb_build_object(
      'operation', TG_OP,
      'table', TG_TABLE_NAME,
      'new_data', CASE WHEN TG_OP != 'DELETE' THEN row_to_json(NEW) ELSE NULL END,
      'old_data', CASE WHEN TG_OP != 'INSERT' THEN row_to_json(OLD) ELSE NULL END
    )
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Apply audit triggers
CREATE TRIGGER audit_accountability_charts
AFTER INSERT OR UPDATE OR DELETE ON public.accountability_charts
FOR EACH ROW EXECUTE FUNCTION public.audit_accountability_chart_change();

CREATE TRIGGER audit_accountability_chart_versions
AFTER INSERT ON public.accountability_chart_versions
FOR EACH ROW EXECUTE FUNCTION public.audit_accountability_chart_change();

CREATE TRIGGER audit_accountability_functions
AFTER INSERT OR UPDATE OR DELETE ON public.accountability_functions
FOR EACH ROW EXECUTE FUNCTION public.audit_accountability_chart_change();

CREATE TRIGGER audit_accountability_seats
AFTER INSERT OR UPDATE OR DELETE ON public.accountability_seats
FOR EACH ROW EXECUTE FUNCTION public.audit_accountability_chart_change();

CREATE TRIGGER audit_accountability_seat_assignments
AFTER INSERT OR UPDATE OR DELETE ON public.accountability_seat_assignments
FOR EACH ROW EXECUTE FUNCTION public.audit_accountability_chart_change();

-- Updated_at trigger
CREATE TRIGGER update_accountability_charts_updated_at
BEFORE UPDATE ON public.accountability_charts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_accountability_functions_updated_at
BEFORE UPDATE ON public.accountability_functions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_accountability_seats_updated_at
BEFORE UPDATE ON public.accountability_seats
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_accountability_seat_assignments_updated_at
BEFORE UPDATE ON public.accountability_seat_assignments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();