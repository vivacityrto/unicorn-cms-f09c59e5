-- =====================================================
-- SUPERHERO MEMBERSHIP DASHBOARD SCHEMA
-- Supports perpetual memberships with entitlements tracking
-- =====================================================

-- Membership entitlements per tenant (tracks hours, access, obligations)
CREATE TABLE IF NOT EXISTS public.membership_entitlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    package_id BIGINT NOT NULL REFERENCES public.packages(id) ON DELETE CASCADE,
    -- Hours tracking (monthly)
    hours_included_monthly INTEGER NOT NULL DEFAULT 0,
    hours_used_current_month INTEGER NOT NULL DEFAULT 0,
    month_start_date DATE NOT NULL DEFAULT date_trunc('month', CURRENT_DATE)::DATE,
    -- Membership state
    membership_state TEXT NOT NULL DEFAULT 'active' CHECK (membership_state IN ('active', 'at_risk', 'paused', 'exiting')),
    -- Onboarding
    setup_complete BOOLEAN NOT NULL DEFAULT FALSE,
    setup_completed_at TIMESTAMPTZ,
    setup_completed_by UUID,
    -- Annual obligations
    health_check_status TEXT NOT NULL DEFAULT 'not_scheduled' CHECK (health_check_status IN ('not_scheduled', 'scheduled', 'delivered')),
    health_check_scheduled_date DATE,
    health_check_delivered_at TIMESTAMPTZ,
    validation_status TEXT NOT NULL DEFAULT 'not_scheduled' CHECK (validation_status IN ('not_scheduled', 'scheduled', 'delivered')),
    validation_scheduled_date DATE,
    validation_delivered_at TIMESTAMPTZ,
    -- CSC assignment
    csc_user_id UUID REFERENCES auth.users(id),
    -- Timestamps
    membership_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_activity_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, package_id)
);

-- Membership activity log (for feed and AI analysis)
CREATE TABLE IF NOT EXISTS public.membership_activity (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    package_id BIGINT NOT NULL REFERENCES public.packages(id) ON DELETE CASCADE,
    user_id UUID,
    activity_type TEXT NOT NULL CHECK (activity_type IN (
        'consult_logged', 'note_added', 'task_created', 'task_completed',
        'document_accessed', 'training_accessed', 'obligation_scheduled',
        'obligation_delivered', 'state_changed', 'csc_assigned', 'system_alert'
    )),
    title TEXT NOT NULL,
    description TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Membership tasks/actions
CREATE TABLE IF NOT EXISTS public.membership_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    package_id BIGINT NOT NULL REFERENCES public.packages(id) ON DELETE CASCADE,
    assigned_to UUID,
    title TEXT NOT NULL,
    description TEXT,
    task_type TEXT NOT NULL DEFAULT 'general' CHECK (task_type IN (
        'general', 'consult_followup', 'obligation', 'onboarding', 'risk_mitigation'
    )),
    priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
    due_date DATE,
    completed_at TIMESTAMPTZ,
    completed_by UUID,
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- AI suggestions for memberships (strict - suggest only)
CREATE TABLE IF NOT EXISTS public.membership_ai_suggestions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    package_id BIGINT NOT NULL REFERENCES public.packages(id) ON DELETE CASCADE,
    suggestion_type TEXT NOT NULL CHECK (suggestion_type IN (
        'next_action', 'risk_flag', 'hours_warning', 'activity_summary', 'draft_note', 'draft_email'
    )),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    priority TEXT NOT NULL DEFAULT 'normal',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'dismissed')),
    actioned_by UUID,
    actioned_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Membership notes (quick notes for activity feed)
CREATE TABLE IF NOT EXISTS public.membership_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    package_id BIGINT NOT NULL REFERENCES public.packages(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    note_type TEXT NOT NULL DEFAULT 'general' CHECK (note_type IN ('general', 'followup', 'risk', 'system')),
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS on all tables
ALTER TABLE public.membership_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.membership_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.membership_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.membership_ai_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.membership_notes ENABLE ROW LEVEL SECURITY;

-- RLS Policies (Staff can access all membership data)
CREATE POLICY "Staff can view all membership entitlements"
ON public.membership_entitlements FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.user_uuid = auth.uid()
        AND u.unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member')
    )
);

CREATE POLICY "Staff can manage membership entitlements"
ON public.membership_entitlements FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.user_uuid = auth.uid()
        AND u.unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member')
    )
);

CREATE POLICY "Staff can view all membership activity"
ON public.membership_activity FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.user_uuid = auth.uid()
        AND u.unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member')
    )
);

CREATE POLICY "Staff can create membership activity"
ON public.membership_activity FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.user_uuid = auth.uid()
        AND u.unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member')
    )
);

CREATE POLICY "Staff can view all membership tasks"
ON public.membership_tasks FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.user_uuid = auth.uid()
        AND u.unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member')
    )
);

CREATE POLICY "Staff can manage membership tasks"
ON public.membership_tasks FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.user_uuid = auth.uid()
        AND u.unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member')
    )
);

CREATE POLICY "Staff can view AI suggestions"
ON public.membership_ai_suggestions FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.user_uuid = auth.uid()
        AND u.unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member')
    )
);

CREATE POLICY "Staff can manage AI suggestions"
ON public.membership_ai_suggestions FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.user_uuid = auth.uid()
        AND u.unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member')
    )
);

CREATE POLICY "Staff can view membership notes"
ON public.membership_notes FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.user_uuid = auth.uid()
        AND u.unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member')
    )
);

CREATE POLICY "Staff can manage membership notes"
ON public.membership_notes FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.user_uuid = auth.uid()
        AND u.unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member')
    )
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_membership_entitlements_tenant ON public.membership_entitlements(tenant_id);
CREATE INDEX IF NOT EXISTS idx_membership_entitlements_package ON public.membership_entitlements(package_id);
CREATE INDEX IF NOT EXISTS idx_membership_entitlements_state ON public.membership_entitlements(membership_state);
CREATE INDEX IF NOT EXISTS idx_membership_entitlements_csc ON public.membership_entitlements(csc_user_id);
CREATE INDEX IF NOT EXISTS idx_membership_activity_tenant ON public.membership_activity(tenant_id);
CREATE INDEX IF NOT EXISTS idx_membership_activity_created ON public.membership_activity(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_membership_tasks_tenant ON public.membership_tasks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_membership_tasks_status ON public.membership_tasks(status);
CREATE INDEX IF NOT EXISTS idx_membership_tasks_due ON public.membership_tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_membership_tasks_assigned ON public.membership_tasks(assigned_to);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_membership_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
DROP TRIGGER IF EXISTS trg_membership_entitlements_updated ON public.membership_entitlements;
CREATE TRIGGER trg_membership_entitlements_updated
    BEFORE UPDATE ON public.membership_entitlements
    FOR EACH ROW EXECUTE FUNCTION public.update_membership_updated_at();

DROP TRIGGER IF EXISTS trg_membership_tasks_updated ON public.membership_tasks;
CREATE TRIGGER trg_membership_tasks_updated
    BEFORE UPDATE ON public.membership_tasks
    FOR EACH ROW EXECUTE FUNCTION public.update_membership_updated_at();

DROP TRIGGER IF EXISTS trg_membership_notes_updated ON public.membership_notes;
CREATE TRIGGER trg_membership_notes_updated
    BEFORE UPDATE ON public.membership_notes
    FOR EACH ROW EXECUTE FUNCTION public.update_membership_updated_at();

-- Function to calculate membership health score
CREATE OR REPLACE FUNCTION public.calculate_membership_health(p_tenant_id BIGINT, p_package_id BIGINT)
RETURNS JSONB AS $$
DECLARE
    v_entitlement RECORD;
    v_health_score INTEGER := 100;
    v_risk_factors JSONB := '[]'::JSONB;
    v_days_since_activity INTEGER;
    v_hours_pct DECIMAL;
BEGIN
    SELECT * INTO v_entitlement
    FROM public.membership_entitlements
    WHERE tenant_id = p_tenant_id AND package_id = p_package_id;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('score', 0, 'status', 'unknown', 'risk_factors', '[]'::JSONB);
    END IF;
    
    -- Check hours usage (high usage = risk)
    IF v_entitlement.hours_included_monthly > 0 THEN
        v_hours_pct := (v_entitlement.hours_used_current_month::DECIMAL / v_entitlement.hours_included_monthly) * 100;
        IF v_hours_pct >= 90 THEN
            v_health_score := v_health_score - 30;
            v_risk_factors := v_risk_factors || jsonb_build_object('type', 'hours_critical', 'message', 'Hours usage at ' || v_hours_pct || '%');
        ELSIF v_hours_pct >= 70 THEN
            v_health_score := v_health_score - 15;
            v_risk_factors := v_risk_factors || jsonb_build_object('type', 'hours_warning', 'message', 'Hours usage at ' || v_hours_pct || '%');
        END IF;
    END IF;
    
    -- Check activity recency
    IF v_entitlement.last_activity_at IS NOT NULL THEN
        v_days_since_activity := EXTRACT(DAY FROM NOW() - v_entitlement.last_activity_at);
        IF v_days_since_activity > 21 THEN
            v_health_score := v_health_score - 20;
            v_risk_factors := v_risk_factors || jsonb_build_object('type', 'inactivity', 'message', 'No activity in ' || v_days_since_activity || ' days');
        END IF;
    ELSE
        v_health_score := v_health_score - 10;
        v_risk_factors := v_risk_factors || jsonb_build_object('type', 'no_activity', 'message', 'No recorded activity');
    END IF;
    
    -- Check annual obligations
    IF v_entitlement.health_check_status = 'not_scheduled' THEN
        v_health_score := v_health_score - 10;
        v_risk_factors := v_risk_factors || jsonb_build_object('type', 'obligation_pending', 'message', 'Health Check not scheduled');
    END IF;
    
    IF v_entitlement.validation_status = 'not_scheduled' THEN
        v_health_score := v_health_score - 10;
        v_risk_factors := v_risk_factors || jsonb_build_object('type', 'obligation_pending', 'message', 'Validation not scheduled');
    END IF;
    
    -- Ensure score is within bounds
    v_health_score := GREATEST(0, LEAST(100, v_health_score));
    
    RETURN jsonb_build_object(
        'score', v_health_score,
        'status', CASE 
            WHEN v_health_score >= 80 THEN 'healthy'
            WHEN v_health_score >= 50 THEN 'warning'
            ELSE 'critical'
        END,
        'risk_factors', v_risk_factors
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;