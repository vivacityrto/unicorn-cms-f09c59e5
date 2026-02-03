-- Create a view for GWC trends aggregated by seat and quarter
CREATE OR REPLACE VIEW public.gwc_seat_trends AS
WITH qc_quarters AS (
  SELECT 
    qc.id as qc_id,
    qc.tenant_id,
    qc.reviewee_id,
    qc.quarter_start,
    qc.quarter_end,
    qc.status,
    EXTRACT(YEAR FROM qc.quarter_start::date) AS quarter_year,
    EXTRACT(QUARTER FROM qc.quarter_start::date) AS quarter_number,
    fit.seat_id,
    fit.gets_it,
    fit.wants_it,
    fit.capacity,
    fit.notes,
    fit.created_at as assessed_at
  FROM public.eos_qc qc
  JOIN public.eos_qc_fit fit ON fit.qc_id = qc.id
  WHERE qc.status = 'completed'
    AND fit.seat_id IS NOT NULL
)
SELECT 
  tenant_id,
  seat_id,
  quarter_year::integer,
  quarter_number::integer,
  -- Get It stats
  COUNT(*) FILTER (WHERE gets_it = true) as gets_it_yes,
  COUNT(*) FILTER (WHERE gets_it = false) as gets_it_no,
  COUNT(*) FILTER (WHERE gets_it IS NOT NULL) as gets_it_total,
  -- Want It stats
  COUNT(*) FILTER (WHERE wants_it = true) as wants_it_yes,
  COUNT(*) FILTER (WHERE wants_it = false) as wants_it_no,
  COUNT(*) FILTER (WHERE wants_it IS NOT NULL) as wants_it_total,
  -- Capacity stats
  COUNT(*) FILTER (WHERE capacity = true) as capacity_yes,
  COUNT(*) FILTER (WHERE capacity = false) as capacity_no,
  COUNT(*) FILTER (WHERE capacity IS NOT NULL) as capacity_total,
  -- All three true count
  COUNT(*) FILTER (WHERE gets_it = true AND wants_it = true AND capacity = true) as all_gwc_yes,
  COUNT(*) as total_assessments
FROM qc_quarters
GROUP BY tenant_id, seat_id, quarter_year, quarter_number;

-- Grant access to the view
GRANT SELECT ON public.gwc_seat_trends TO authenticated;
GRANT SELECT ON public.gwc_seat_trends TO anon;

-- Create audit table for GWC trend access
CREATE TABLE IF NOT EXISTS public.audit_gwc_trends (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES public.tenants(id),
  user_id UUID,
  seat_id UUID REFERENCES public.accountability_seats(id),
  event_type TEXT NOT NULL, -- 'view_trends', 'export_trends'
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.audit_gwc_trends ENABLE ROW LEVEL SECURITY;

-- RLS policies for audit table
CREATE POLICY "Users can view own tenant audit logs"
ON public.audit_gwc_trends
FOR SELECT
USING (
  tenant_id IN (
    SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert audit logs for own tenant"
ON public.audit_gwc_trends
FOR INSERT
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()
  )
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_audit_gwc_trends_tenant ON public.audit_gwc_trends(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_gwc_trends_seat ON public.audit_gwc_trends(seat_id);