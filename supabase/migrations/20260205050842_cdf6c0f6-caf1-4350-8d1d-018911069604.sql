-- Part A: Knowledge Library supporting tables

-- Knowledge item versions for audit trail
CREATE TABLE public.knowledge_item_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    knowledge_item_id UUID NOT NULL REFERENCES public.knowledge_items(id) ON DELETE CASCADE,
    version TEXT NOT NULL,
    content TEXT NOT NULL,
    edit_reason TEXT NOT NULL,
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Knowledge item audit log
CREATE TABLE public.knowledge_item_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    knowledge_item_id UUID NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('create', 'update', 'approve', 'archive')),
    actor_user_id UUID NOT NULL,
    before_snapshot JSONB NOT NULL DEFAULT '{}',
    after_snapshot JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Part C: EOS Processes Library

-- Main EOS processes table
CREATE TABLE public.eos_processes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    eos_component TEXT NOT NULL CHECK (eos_component IN ('Vision', 'People', 'Data', 'Issues', 'Process', 'Traction')),
    purpose TEXT,
    scope TEXT,
    steps JSONB NOT NULL DEFAULT '[]',
    inputs JSONB NOT NULL DEFAULT '[]',
    outputs JSONB NOT NULL DEFAULT '[]',
    roles_responsible JSONB NOT NULL DEFAULT '[]',
    evidence_records JSONB NOT NULL DEFAULT '[]',
    version TEXT NOT NULL DEFAULT '1.0',
    approval_status TEXT NOT NULL DEFAULT 'draft' CHECK (approval_status IN ('draft', 'approved', 'archived')),
    review_date DATE,
    owner_user_id UUID,
    tenant_id INTEGER REFERENCES public.tenants(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- EOS process versions
CREATE TABLE public.eos_process_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    eos_process_id UUID NOT NULL REFERENCES public.eos_processes(id) ON DELETE CASCADE,
    version TEXT NOT NULL,
    content_snapshot JSONB NOT NULL,
    edit_reason TEXT NOT NULL,
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- EOS process audit log
CREATE TABLE public.eos_process_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    eos_process_id UUID NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('create', 'update', 'approve', 'archive')),
    actor_user_id UUID NOT NULL,
    before_snapshot JSONB NOT NULL DEFAULT '{}',
    after_snapshot JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Part B: Summary-safe data access views (Security Invoker mode)

-- Client engagement summary view (excludes sensitive data)
CREATE OR REPLACE VIEW public.v_client_engagement_summary 
WITH (security_invoker = true)
AS
SELECT 
    t.id as tenant_id,
    t.name as client_name,
    t.status as client_status,
    t.rto_id,
    t.created_at as client_since,
    (SELECT COUNT(*) FROM public.package_instances pi WHERE pi.tenant_id = t.id) as total_packages,
    (SELECT COUNT(*) FROM public.package_instances pi WHERE pi.tenant_id = t.id AND pi.is_complete = false) as active_packages,
    (SELECT COUNT(*) FROM public.eos_meetings em WHERE em.tenant_id = t.id) as total_meetings,
    (SELECT COUNT(*) FROM public.eos_rocks er WHERE er.tenant_id = t.id) as total_rocks,
    (SELECT COUNT(*) FROM public.eos_issues ei WHERE ei.tenant_id = t.id AND ei.deleted_at IS NULL) as total_issues
FROM public.tenants t;

-- Client package usage summary (no pricing, no free-text notes)
CREATE OR REPLACE VIEW public.v_client_package_usage_summary
WITH (security_invoker = true)
AS
SELECT 
    pi.id as instance_id,
    pi.tenant_id,
    t.name as client_name,
    p.name as package_name,
    p.package_type,
    pi.start_date,
    pi.end_date,
    pi.is_complete,
    pi.hours_included,
    pi.hours_used,
    pi.hours_added,
    COALESCE(pi.hours_included, 0) + COALESCE(pi.hours_added, 0) - COALESCE(pi.hours_used, 0) as hours_remaining
FROM public.package_instances pi
JOIN public.tenants t ON t.id = pi.tenant_id
JOIN public.packages p ON p.id = pi.package_id;

-- Client phase timeline (documents progress without content)
CREATE OR REPLACE VIEW public.v_client_phase_timeline
WITH (security_invoker = true)
AS
SELECT 
    d.id as document_id,
    d.tenant_id,
    t.name as client_name,
    d.title as document_title,
    d.document_status,
    d.stage,
    d.category,
    d.createdat as created_at,
    d.updated_at,
    d.due_date,
    d.is_released
FROM public.documents d
JOIN public.tenants t ON t.id = d.tenant_id;

-- Client decisions and approvals (metadata only, no content)
CREATE OR REPLACE VIEW public.v_client_decisions_approvals
WITH (security_invoker = true)
AS
SELECT 
    em.id as meeting_id,
    em.tenant_id,
    t.name as client_name,
    em.meeting_type,
    em.title as meeting_title,
    em.scheduled_date,
    em.status as meeting_status,
    em.is_complete,
    em.completed_at,
    em.quorum_met,
    (SELECT COUNT(*) FROM public.eos_todos et WHERE et.meeting_id = em.id) as todos_created,
    (SELECT COUNT(*) FROM public.eos_issues ei WHERE ei.meeting_id = em.id AND ei.deleted_at IS NULL) as issues_created
FROM public.eos_meetings em
JOIN public.tenants t ON t.id = em.tenant_id;

-- Client risks and actions (excludes description/solution free-text, shows metadata)
CREATE OR REPLACE VIEW public.v_client_risks_actions
WITH (security_invoker = true)
AS
SELECT 
    ei.id as issue_id,
    ei.tenant_id,
    t.name as client_name,
    ei.title,
    ei.item_type,
    ei.category,
    ei.status,
    ei.impact,
    ei.priority,
    ei.source,
    ei.created_at,
    ei.resolved_at,
    ei.escalated_at,
    ei.quarter_year,
    ei.quarter_number
FROM public.eos_issues ei
JOIN public.tenants t ON t.id = ei.tenant_id
WHERE ei.deleted_at IS NULL;

-- Client EOS summary (aggregated metrics only) - cast status to text for comparison
CREATE OR REPLACE VIEW public.v_client_eos_summary
WITH (security_invoker = true)
AS
SELECT 
    t.id as tenant_id,
    t.name as client_name,
    (SELECT COUNT(*) FROM public.eos_rocks er WHERE er.tenant_id = t.id) as total_rocks,
    (SELECT COUNT(*) FROM public.eos_rocks er WHERE er.tenant_id = t.id AND er.status::text = 'On_Track') as rocks_on_track,
    (SELECT COUNT(*) FROM public.eos_rocks er WHERE er.tenant_id = t.id AND er.status::text = 'Off_Track') as rocks_off_track,
    (SELECT COUNT(*) FROM public.eos_rocks er WHERE er.tenant_id = t.id AND er.status::text = 'Complete') as rocks_completed,
    (SELECT COUNT(*) FROM public.eos_issues ei WHERE ei.tenant_id = t.id AND ei.deleted_at IS NULL) as total_issues,
    (SELECT COUNT(*) FROM public.eos_issues ei WHERE ei.tenant_id = t.id AND ei.status::text = 'Open' AND ei.deleted_at IS NULL) as open_issues,
    (SELECT COUNT(*) FROM public.eos_issues ei WHERE ei.tenant_id = t.id AND ei.status::text = 'Solved' AND ei.deleted_at IS NULL) as solved_issues,
    (SELECT COUNT(*) FROM public.eos_issues ei WHERE ei.tenant_id = t.id AND ei.item_type::text = 'Risk' AND ei.deleted_at IS NULL) as risk_count,
    (SELECT COUNT(*) FROM public.eos_issues ei WHERE ei.tenant_id = t.id AND ei.item_type::text = 'Opportunity' AND ei.deleted_at IS NULL) as opportunity_count,
    (SELECT COUNT(*) FROM public.eos_todos et WHERE et.tenant_id = t.id) as total_todos,
    (SELECT COUNT(*) FROM public.eos_todos et WHERE et.tenant_id = t.id AND et.status::text = 'Done') as completed_todos,
    (SELECT COUNT(*) FROM public.eos_meetings em WHERE em.tenant_id = t.id) as total_meetings,
    (SELECT COUNT(*) FROM public.eos_meetings em WHERE em.tenant_id = t.id AND em.is_complete = true) as completed_meetings
FROM public.tenants t;

-- Enable RLS on new tables
ALTER TABLE public.knowledge_item_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_item_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eos_processes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eos_process_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eos_process_audit_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies for Knowledge Library tables (SuperAdmin only)
CREATE POLICY "knowledge_item_versions_superadmin_all"
ON public.knowledge_item_versions
FOR ALL
TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "knowledge_item_audit_log_superadmin_all"
ON public.knowledge_item_audit_log
FOR ALL
TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

-- RLS Policies for EOS Processes tables (SuperAdmin only)
CREATE POLICY "eos_processes_superadmin_all"
ON public.eos_processes
FOR ALL
TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "eos_process_versions_superadmin_all"
ON public.eos_process_versions
FOR ALL
TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "eos_process_audit_log_superadmin_all"
ON public.eos_process_audit_log
FOR ALL
TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

-- Create indexes for performance
CREATE INDEX idx_knowledge_item_versions_item ON public.knowledge_item_versions(knowledge_item_id);
CREATE INDEX idx_knowledge_item_audit_log_item ON public.knowledge_item_audit_log(knowledge_item_id);
CREATE INDEX idx_eos_processes_status ON public.eos_processes(approval_status);
CREATE INDEX idx_eos_processes_component ON public.eos_processes(eos_component);
CREATE INDEX idx_eos_process_versions_process ON public.eos_process_versions(eos_process_id);
CREATE INDEX idx_eos_process_audit_log_process ON public.eos_process_audit_log(eos_process_id);

-- Function to log knowledge item changes
CREATE OR REPLACE FUNCTION public.log_knowledge_item_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO knowledge_item_audit_log (knowledge_item_id, action, actor_user_id, after_snapshot)
        VALUES (NEW.id, 'create', auth.uid(), to_jsonb(NEW));
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO knowledge_item_audit_log (knowledge_item_id, action, actor_user_id, before_snapshot, after_snapshot)
        VALUES (NEW.id, 
            CASE 
                WHEN NEW.approval_status = 'approved' AND OLD.approval_status != 'approved' THEN 'approve'
                WHEN NEW.approval_status = 'archived' AND OLD.approval_status != 'archived' THEN 'archive'
                ELSE 'update'
            END,
            auth.uid(), to_jsonb(OLD), to_jsonb(NEW));
    END IF;
    RETURN NEW;
END;
$$;

-- Function to log EOS process changes
CREATE OR REPLACE FUNCTION public.log_eos_process_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO eos_process_audit_log (eos_process_id, action, actor_user_id, after_snapshot)
        VALUES (NEW.id, 'create', auth.uid(), to_jsonb(NEW));
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO eos_process_audit_log (eos_process_id, action, actor_user_id, before_snapshot, after_snapshot)
        VALUES (NEW.id, 
            CASE 
                WHEN NEW.approval_status = 'approved' AND OLD.approval_status != 'approved' THEN 'approve'
                WHEN NEW.approval_status = 'archived' AND OLD.approval_status != 'archived' THEN 'archive'
                ELSE 'update'
            END,
            auth.uid(), to_jsonb(OLD), to_jsonb(NEW));
    END IF;
    RETURN NEW;
END;
$$;

-- Create triggers for audit logging
CREATE TRIGGER trg_knowledge_item_audit
AFTER INSERT OR UPDATE ON public.knowledge_items
FOR EACH ROW EXECUTE FUNCTION public.log_knowledge_item_change();

CREATE TRIGGER trg_eos_process_audit
AFTER INSERT OR UPDATE ON public.eos_processes
FOR EACH ROW EXECUTE FUNCTION public.log_eos_process_change();