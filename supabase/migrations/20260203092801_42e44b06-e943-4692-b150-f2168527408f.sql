-- Client Impact Reports table (stores generated quarterly summaries)
CREATE TABLE public.client_impact_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    client_id UUID REFERENCES public.clients_legacy(id) ON DELETE CASCADE,
    reporting_period VARCHAR(20) NOT NULL, -- e.g., 'Q1 2026'
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    executive_summary TEXT,
    overall_status VARCHAR(20) DEFAULT 'on_track', -- on_track, needs_attention, at_risk
    focus_areas TEXT[], -- Array of high-level focus area strings
    is_published BOOLEAN DEFAULT false,
    published_at TIMESTAMPTZ,
    published_by UUID,
    generated_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(tenant_id, client_id, reporting_period)
);

-- Client Impact Items table (individual items within a report)
CREATE TABLE public.client_impact_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID NOT NULL REFERENCES public.client_impact_reports(id) ON DELETE CASCADE,
    tenant_id BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    section VARCHAR(50) NOT NULL, -- 'improvements', 'risks', 'process_enhancements', 'forward_focus'
    category VARCHAR(100), -- e.g., 'Compliance', 'Delivery Quality', 'Communication'
    title TEXT NOT NULL,
    description TEXT,
    client_benefit TEXT, -- Why it matters to the client
    status VARCHAR(30), -- 'completed', 'mitigated', 'closed', 'in_progress', 'identified'
    completed_date DATE,
    source_type VARCHAR(50), -- Internal only: 'rock', 'issue', 'process', 'meeting'
    source_id UUID, -- Internal only: reference to EOS entity
    display_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.client_impact_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_impact_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies for client_impact_reports
-- Vivacity team can see all reports
CREATE POLICY "Vivacity team can view all impact reports"
ON public.client_impact_reports
FOR SELECT
USING (
    public.user_has_tenant_access(tenant_id)
);

-- Only Vivacity admins can publish reports
CREATE POLICY "Vivacity admins can update impact reports"
ON public.client_impact_reports
FOR UPDATE
USING (
    public.user_has_tenant_access(tenant_id)
    AND EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.user_uuid = auth.uid()
        AND u.unicorn_role IN ('Super Admin', 'Admin')
    )
);

-- System can insert reports
CREATE POLICY "System can insert impact reports"
ON public.client_impact_reports
FOR INSERT
WITH CHECK (public.user_has_tenant_access(tenant_id));

-- RLS Policies for client_impact_items
CREATE POLICY "Users can view impact items"
ON public.client_impact_items
FOR SELECT
USING (public.user_has_tenant_access(tenant_id));

CREATE POLICY "System can insert impact items"
ON public.client_impact_items
FOR INSERT
WITH CHECK (public.user_has_tenant_access(tenant_id));

-- Indexes for performance
CREATE INDEX idx_client_impact_reports_tenant ON public.client_impact_reports(tenant_id);
CREATE INDEX idx_client_impact_reports_client ON public.client_impact_reports(client_id);
CREATE INDEX idx_client_impact_reports_period ON public.client_impact_reports(period_start, period_end);
CREATE INDEX idx_client_impact_items_report ON public.client_impact_items(report_id);
CREATE INDEX idx_client_impact_items_section ON public.client_impact_items(section);

-- Add audit triggers
CREATE TRIGGER update_client_impact_reports_updated_at
    BEFORE UPDATE ON public.client_impact_reports
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();