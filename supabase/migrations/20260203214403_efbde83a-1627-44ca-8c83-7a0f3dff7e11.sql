-- Create the EOS Accountability Chart seeding function
-- This function creates a standard EOS template with Functions, Seats, and Accountabilities

CREATE OR REPLACE FUNCTION public.seed_eos_accountability_chart(
  p_tenant_id integer,
  p_created_by uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_chart_id uuid;
  v_leadership_func_id uuid;
  v_operations_func_id uuid;
  v_client_success_func_id uuid;
  v_sales_func_id uuid;
  v_finance_func_id uuid;
  v_marketing_func_id uuid;
  v_visionary_seat_id uuid;
  v_integrator_seat_id uuid;
  v_lt_member_seat_id uuid;
  v_ops_lead_seat_id uuid;
  v_cs_lead_seat_id uuid;
  v_sales_lead_seat_id uuid;
  v_finance_lead_seat_id uuid;
  v_marketing_lead_seat_id uuid;
BEGIN
  -- Create the chart
  INSERT INTO public.accountability_charts (tenant_id, status, created_by)
  VALUES (p_tenant_id, 'Draft', p_created_by)
  RETURNING id INTO v_chart_id;

  -- ======== FUNCTIONS ========
  
  -- Leadership Team
  INSERT INTO public.accountability_functions (chart_id, tenant_id, name, function_type, sort_order)
  VALUES (v_chart_id, p_tenant_id, 'Leadership Team', 'leadership', 0)
  RETURNING id INTO v_leadership_func_id;
  
  -- Operations
  INSERT INTO public.accountability_functions (chart_id, tenant_id, name, function_type, sort_order)
  VALUES (v_chart_id, p_tenant_id, 'Operations', 'operations', 1)
  RETURNING id INTO v_operations_func_id;
  
  -- Client Success
  INSERT INTO public.accountability_functions (chart_id, tenant_id, name, function_type, sort_order)
  VALUES (v_chart_id, p_tenant_id, 'Client Success', 'delivery', 2)
  RETURNING id INTO v_client_success_func_id;
  
  -- Sales and Growth
  INSERT INTO public.accountability_functions (chart_id, tenant_id, name, function_type, sort_order)
  VALUES (v_chart_id, p_tenant_id, 'Sales & Growth', 'sales_marketing', 3)
  RETURNING id INTO v_sales_func_id;
  
  -- Finance and Admin
  INSERT INTO public.accountability_functions (chart_id, tenant_id, name, function_type, sort_order)
  VALUES (v_chart_id, p_tenant_id, 'Finance & Admin', 'finance', 4)
  RETURNING id INTO v_finance_func_id;
  
  -- Marketing
  INSERT INTO public.accountability_functions (chart_id, tenant_id, name, function_type, sort_order)
  VALUES (v_chart_id, p_tenant_id, 'Marketing', 'sales_marketing', 5)
  RETURNING id INTO v_marketing_func_id;

  -- ======== SEATS ========
  
  -- Visionary (Leadership)
  INSERT INTO public.accountability_seats (
    function_id, chart_id, tenant_id, seat_name, eos_role_type, 
    is_required_for_quorum, critical_seat, sort_order
  )
  VALUES (
    v_leadership_func_id, v_chart_id, p_tenant_id, 'Visionary', 'visionary',
    true, true, 0
  )
  RETURNING id INTO v_visionary_seat_id;
  
  -- Integrator (Leadership)
  INSERT INTO public.accountability_seats (
    function_id, chart_id, tenant_id, seat_name, eos_role_type,
    is_required_for_quorum, critical_seat, sort_order
  )
  VALUES (
    v_leadership_func_id, v_chart_id, p_tenant_id, 'Integrator', 'integrator',
    true, true, 1
  )
  RETURNING id INTO v_integrator_seat_id;
  
  -- Leadership Team Member (Leadership)
  INSERT INTO public.accountability_seats (
    function_id, chart_id, tenant_id, seat_name, eos_role_type,
    is_required_for_quorum, sort_order
  )
  VALUES (
    v_leadership_func_id, v_chart_id, p_tenant_id, 'Leadership Team Member', 'leadership_team',
    true, 2
  )
  RETURNING id INTO v_lt_member_seat_id;
  
  -- Operations Lead
  INSERT INTO public.accountability_seats (
    function_id, chart_id, tenant_id, seat_name, eos_role_type, sort_order
  )
  VALUES (
    v_operations_func_id, v_chart_id, p_tenant_id, 'Operations Lead', 'functional_lead', 0
  )
  RETURNING id INTO v_ops_lead_seat_id;
  
  -- Client Success Lead
  INSERT INTO public.accountability_seats (
    function_id, chart_id, tenant_id, seat_name, eos_role_type, sort_order
  )
  VALUES (
    v_client_success_func_id, v_chart_id, p_tenant_id, 'Client Success Lead', 'functional_lead', 0
  )
  RETURNING id INTO v_cs_lead_seat_id;
  
  -- Sales Lead
  INSERT INTO public.accountability_seats (
    function_id, chart_id, tenant_id, seat_name, eos_role_type, sort_order
  )
  VALUES (
    v_sales_func_id, v_chart_id, p_tenant_id, 'Sales Lead', 'functional_lead', 0
  )
  RETURNING id INTO v_sales_lead_seat_id;
  
  -- Finance Lead
  INSERT INTO public.accountability_seats (
    function_id, chart_id, tenant_id, seat_name, eos_role_type, sort_order
  )
  VALUES (
    v_finance_func_id, v_chart_id, p_tenant_id, 'Finance Lead', 'functional_lead', 0
  )
  RETURNING id INTO v_finance_lead_seat_id;
  
  -- Marketing Lead
  INSERT INTO public.accountability_seats (
    function_id, chart_id, tenant_id, seat_name, eos_role_type, sort_order
  )
  VALUES (
    v_marketing_func_id, v_chart_id, p_tenant_id, 'Marketing Lead', 'functional_lead', 0
  )
  RETURNING id INTO v_marketing_lead_seat_id;

  -- ======== ACCOUNTABILITIES ========
  
  -- Visionary Accountabilities
  INSERT INTO public.accountability_seat_roles (seat_id, tenant_id, role_text, sort_order) VALUES
    (v_visionary_seat_id, p_tenant_id, 'Sets vision and long-term direction', 0),
    (v_visionary_seat_id, p_tenant_id, 'Maintains culture and core values', 1),
    (v_visionary_seat_id, p_tenant_id, 'Drives key relationships and partnerships', 2),
    (v_visionary_seat_id, p_tenant_id, 'Defines priorities and communicates focus', 3);
  
  -- Integrator Accountabilities
  INSERT INTO public.accountability_seat_roles (seat_id, tenant_id, role_text, sort_order) VALUES
    (v_integrator_seat_id, p_tenant_id, 'Runs day-to-day operations', 0),
    (v_integrator_seat_id, p_tenant_id, 'Aligns leadership team execution', 1),
    (v_integrator_seat_id, p_tenant_id, 'Owns accountability for results', 2),
    (v_integrator_seat_id, p_tenant_id, 'Resolves cross-functional issues', 3);
  
  -- Leadership Team Member Accountabilities
  INSERT INTO public.accountability_seat_roles (seat_id, tenant_id, role_text, sort_order) VALUES
    (v_lt_member_seat_id, p_tenant_id, 'Owns function outcomes', 0),
    (v_lt_member_seat_id, p_tenant_id, 'Brings and solves issues', 1),
    (v_lt_member_seat_id, p_tenant_id, 'Leads people and execution', 2);
  
  -- Operations Lead Accountabilities
  INSERT INTO public.accountability_seat_roles (seat_id, tenant_id, role_text, sort_order) VALUES
    (v_ops_lead_seat_id, p_tenant_id, 'Service delivery consistency', 0),
    (v_ops_lead_seat_id, p_tenant_id, 'Capacity and resourcing health', 1),
    (v_ops_lead_seat_id, p_tenant_id, 'Process adherence and improvement', 2);
  
  -- Client Success Lead Accountabilities
  INSERT INTO public.accountability_seat_roles (seat_id, tenant_id, role_text, sort_order) VALUES
    (v_cs_lead_seat_id, p_tenant_id, 'Client delivery outcomes', 0),
    (v_cs_lead_seat_id, p_tenant_id, 'Renewal risk and escalation control', 1),
    (v_cs_lead_seat_id, p_tenant_id, 'Client communication cadence', 2);
  
  -- Sales Lead Accountabilities
  INSERT INTO public.accountability_seat_roles (seat_id, tenant_id, role_text, sort_order) VALUES
    (v_sales_lead_seat_id, p_tenant_id, 'Pipeline health', 0),
    (v_sales_lead_seat_id, p_tenant_id, 'Close performance', 1),
    (v_sales_lead_seat_id, p_tenant_id, 'Handover quality into delivery', 2);
  
  -- Finance Lead Accountabilities
  INSERT INTO public.accountability_seat_roles (seat_id, tenant_id, role_text, sort_order) VALUES
    (v_finance_lead_seat_id, p_tenant_id, 'Cashflow and forecasting', 0),
    (v_finance_lead_seat_id, p_tenant_id, 'Billing and collections hygiene', 1),
    (v_finance_lead_seat_id, p_tenant_id, 'Reporting accuracy', 2);
  
  -- Marketing Lead Accountabilities
  INSERT INTO public.accountability_seat_roles (seat_id, tenant_id, role_text, sort_order) VALUES
    (v_marketing_lead_seat_id, p_tenant_id, 'Lead generation programs', 0),
    (v_marketing_lead_seat_id, p_tenant_id, 'Brand presence and messaging', 1),
    (v_marketing_lead_seat_id, p_tenant_id, 'Campaign tracking and reporting', 2);

  RETURN v_chart_id;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.seed_eos_accountability_chart(integer, uuid) TO authenticated;

-- Add comment for documentation
COMMENT ON FUNCTION public.seed_eos_accountability_chart IS 'Seeds a new EOS Accountability Chart with standard Functions, Seats, and Accountabilities. Returns the new chart ID.';