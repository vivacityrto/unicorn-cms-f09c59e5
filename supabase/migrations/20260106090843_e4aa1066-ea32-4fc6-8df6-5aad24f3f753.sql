-- =====================================================
-- Package Instance Engine - Client Package Instances
-- =====================================================

-- 1. Client Packages (main instance record)
CREATE TABLE IF NOT EXISTS public.client_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  package_id BIGINT NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'closed')),
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE NULL,
  assigned_csc_user_id UUID NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID NULL
);

CREATE INDEX IF NOT EXISTS idx_client_packages_tenant_status ON public.client_packages(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_client_packages_package ON public.client_packages(package_id);

-- 2. Client Package Stages (stage instances)
CREATE TABLE IF NOT EXISTS public.client_package_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_package_id UUID NOT NULL REFERENCES client_packages(id) ON DELETE CASCADE,
  stage_id BIGINT NOT NULL REFERENCES documents_stages(id),
  sort_order INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'complete', 'skipped')),
  started_at TIMESTAMPTZ NULL,
  completed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_package_id, stage_id)
);

CREATE INDEX IF NOT EXISTS idx_client_package_stages_package ON public.client_package_stages(client_package_id);

-- 3. Client Team Tasks (staff task instances)
CREATE TABLE IF NOT EXISTS public.client_team_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_package_stage_id UUID NOT NULL REFERENCES client_package_stages(id) ON DELETE CASCADE,
  template_task_id UUID NULL,
  name TEXT NOT NULL,
  instructions TEXT NULL,
  owner_role TEXT NULL,
  estimated_hours NUMERIC(5,2) NULL,
  is_mandatory BOOLEAN DEFAULT true,
  sort_order INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'done', 'blocked')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_team_tasks_stage ON public.client_team_tasks(client_package_stage_id);

-- 4. Client Tasks (client-facing task instances)
CREATE TABLE IF NOT EXISTS public.client_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_package_stage_id UUID NOT NULL REFERENCES client_package_stages(id) ON DELETE CASCADE,
  template_task_id UUID NULL,
  name TEXT NOT NULL,
  instructions TEXT NULL,
  due_date DATE NULL,
  sort_order INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'submitted', 'done')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_tasks_stage ON public.client_tasks(client_package_stage_id);

-- 5. Client Email Queue (email instances)
CREATE TABLE IF NOT EXISTS public.client_email_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_package_stage_id UUID NOT NULL REFERENCES client_package_stages(id) ON DELETE CASCADE,
  email_template_id UUID NOT NULL REFERENCES email_templates(id),
  trigger_type TEXT NOT NULL,
  recipient_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'skipped')),
  scheduled_at TIMESTAMPTZ NULL,
  sent_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_email_queue_stage ON public.client_email_queue(client_package_stage_id);

-- 6. Client Stage Documents (document instance links)
CREATE TABLE IF NOT EXISTS public.client_stage_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_package_stage_id UUID NOT NULL REFERENCES client_package_stages(id) ON DELETE CASCADE,
  document_id BIGINT NOT NULL REFERENCES documents(id),
  visibility TEXT NOT NULL,
  delivery_type TEXT NOT NULL,
  sort_order INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_stage_documents_stage ON public.client_stage_documents(client_package_stage_id);

-- =====================================================
-- RLS Policies
-- =====================================================

ALTER TABLE public.client_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_package_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_team_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_email_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_stage_documents ENABLE ROW LEVEL SECURITY;

-- Client Packages policies
CREATE POLICY "SuperAdmin can manage all client packages"
ON public.client_packages FOR ALL
USING (
  EXISTS (SELECT 1 FROM users WHERE user_uuid = auth.uid() AND unicorn_role = 'Super Admin')
);

CREATE POLICY "Tenants can view own client packages"
ON public.client_packages FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM tenant_members tm 
    WHERE tm.user_id = auth.uid() 
    AND tm.tenant_id = client_packages.tenant_id
  )
);

-- Client Package Stages policies
CREATE POLICY "SuperAdmin can manage all client package stages"
ON public.client_package_stages FOR ALL
USING (
  EXISTS (SELECT 1 FROM users WHERE user_uuid = auth.uid() AND unicorn_role = 'Super Admin')
);

CREATE POLICY "Tenants can view own client package stages"
ON public.client_package_stages FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM client_packages cp
    JOIN tenant_members tm ON tm.tenant_id = cp.tenant_id
    WHERE cp.id = client_package_stages.client_package_id
    AND tm.user_id = auth.uid()
  )
);

-- Client Team Tasks policies
CREATE POLICY "SuperAdmin can manage all client team tasks"
ON public.client_team_tasks FOR ALL
USING (
  EXISTS (SELECT 1 FROM users WHERE user_uuid = auth.uid() AND unicorn_role = 'Super Admin')
);

CREATE POLICY "Tenants can view own client team tasks"
ON public.client_team_tasks FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM client_package_stages cps
    JOIN client_packages cp ON cp.id = cps.client_package_id
    JOIN tenant_members tm ON tm.tenant_id = cp.tenant_id
    WHERE cps.id = client_team_tasks.client_package_stage_id
    AND tm.user_id = auth.uid()
  )
);

-- Client Tasks policies
CREATE POLICY "SuperAdmin can manage all client tasks"
ON public.client_tasks FOR ALL
USING (
  EXISTS (SELECT 1 FROM users WHERE user_uuid = auth.uid() AND unicorn_role = 'Super Admin')
);

CREATE POLICY "Tenants can view and update own client tasks"
ON public.client_tasks FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM client_package_stages cps
    JOIN client_packages cp ON cp.id = cps.client_package_id
    JOIN tenant_members tm ON tm.tenant_id = cp.tenant_id
    WHERE cps.id = client_tasks.client_package_stage_id
    AND tm.user_id = auth.uid()
  )
);

-- Client Email Queue policies (internal only)
CREATE POLICY "SuperAdmin can manage email queue"
ON public.client_email_queue FOR ALL
USING (
  EXISTS (SELECT 1 FROM users WHERE user_uuid = auth.uid() AND unicorn_role = 'Super Admin')
);

-- Client Stage Documents policies
CREATE POLICY "SuperAdmin can manage all client stage documents"
ON public.client_stage_documents FOR ALL
USING (
  EXISTS (SELECT 1 FROM users WHERE user_uuid = auth.uid() AND unicorn_role = 'Super Admin')
);

CREATE POLICY "Tenants can view own client stage documents"
ON public.client_stage_documents FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM client_package_stages cps
    JOIN client_packages cp ON cp.id = cps.client_package_id
    JOIN tenant_members tm ON tm.tenant_id = cp.tenant_id
    WHERE cps.id = client_stage_documents.client_package_stage_id
    AND tm.user_id = auth.uid()
  )
);

-- =====================================================
-- RPC Function: start_client_package
-- =====================================================

CREATE OR REPLACE FUNCTION public.start_client_package(
  p_tenant_id BIGINT,
  p_package_id BIGINT,
  p_assigned_csc_user_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_package_id UUID;
  v_stage RECORD;
  v_stage_instance_id UUID;
  v_task RECORD;
  v_email RECORD;
  v_doc RECORD;
  v_user_id UUID;
BEGIN
  -- Get the current user
  v_user_id := auth.uid();

  -- Create the client package record
  INSERT INTO client_packages (tenant_id, package_id, status, start_date, assigned_csc_user_id, created_by)
  VALUES (p_tenant_id, p_package_id, 'active', CURRENT_DATE, p_assigned_csc_user_id, v_user_id)
  RETURNING id INTO v_client_package_id;

  -- Loop through package template stages
  FOR v_stage IN 
    SELECT ps.stage_id, ps.sort_order, ps.is_required
    FROM package_stages ps
    WHERE ps.package_id = p_package_id
    ORDER BY ps.sort_order
  LOOP
    -- Create stage instance
    INSERT INTO client_package_stages (client_package_id, stage_id, sort_order, status)
    VALUES (v_client_package_id, v_stage.stage_id, v_stage.sort_order, 'not_started')
    RETURNING id INTO v_stage_instance_id;

    -- Copy staff tasks
    FOR v_task IN
      SELECT id, name, description, owner_role, estimated_hours, is_mandatory, order_number
      FROM package_staff_tasks
      WHERE package_id = p_package_id AND stage_id = v_stage.stage_id
      ORDER BY order_number
    LOOP
      INSERT INTO client_team_tasks (
        client_package_stage_id, template_task_id, name, instructions, 
        owner_role, estimated_hours, is_mandatory, sort_order, status
      )
      VALUES (
        v_stage_instance_id, v_task.id, v_task.name, v_task.description,
        v_task.owner_role, v_task.estimated_hours, COALESCE(v_task.is_mandatory, true), 
        v_task.order_number, 'open'
      );
    END LOOP;

    -- Copy client tasks (calculate due_date if offset exists)
    FOR v_task IN
      SELECT id, name, description, instructions, due_date_offset, order_number
      FROM package_client_tasks
      WHERE package_id = p_package_id AND stage_id = v_stage.stage_id
      ORDER BY order_number
    LOOP
      INSERT INTO client_tasks (
        client_package_stage_id, template_task_id, name, instructions,
        due_date, sort_order, status
      )
      VALUES (
        v_stage_instance_id, v_task.id, v_task.name, 
        COALESCE(v_task.instructions, v_task.description),
        CASE WHEN v_task.due_date_offset IS NOT NULL 
             THEN CURRENT_DATE + v_task.due_date_offset 
             ELSE NULL END,
        v_task.order_number, 'open'
      );
    END LOOP;

    -- Copy stage emails to queue
    FOR v_email IN
      SELECT email_template_id, trigger_type, recipient_type
      FROM package_stage_emails
      WHERE package_id = p_package_id AND stage_id = v_stage.stage_id AND is_active = true
      ORDER BY sort_order
    LOOP
      INSERT INTO client_email_queue (
        client_package_stage_id, email_template_id, trigger_type, recipient_type, status
      )
      VALUES (
        v_stage_instance_id, v_email.email_template_id, v_email.trigger_type, 
        v_email.recipient_type, 'queued'
      );
    END LOOP;

    -- Copy stage documents
    FOR v_doc IN
      SELECT document_id, visibility, delivery_type, sort_order
      FROM package_stage_documents
      WHERE package_id = p_package_id AND stage_id = v_stage.stage_id
      ORDER BY sort_order
    LOOP
      INSERT INTO client_stage_documents (
        client_package_stage_id, document_id, visibility, delivery_type, sort_order
      )
      VALUES (
        v_stage_instance_id, v_doc.document_id, v_doc.visibility, v_doc.delivery_type, v_doc.sort_order
      );
    END LOOP;
  END LOOP;

  -- Log the action
  INSERT INTO client_audit_log (tenant_id, entity_type, entity_id, action, actor_user_id, details)
  VALUES (
    p_tenant_id, 
    'client_package', 
    v_client_package_id::text, 
    'client_package.started',
    v_user_id,
    jsonb_build_object(
      'package_id', p_package_id,
      'assigned_csc_user_id', p_assigned_csc_user_id
    )
  );

  RETURN v_client_package_id;
END;
$$;