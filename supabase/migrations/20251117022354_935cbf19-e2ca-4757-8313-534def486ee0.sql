-- Insert sample tasks into tasks_tenants table
INSERT INTO public.tasks_tenants (
  client_id, 
  package_id, 
  task_name, 
  due_date, 
  status, 
  completed, 
  created_by, 
  tenant_id,
  description
) VALUES
-- Task 1: EMAIL: Eligible Business Structures with KS-RTO package
(
  '6f2717b0-fef5-4ddf-b034-545a436ca792'::uuid,
  1,
  'EMAIL: Eligible Business Structures',
  '2025-11-20'::date,
  'pending',
  false,
  '384cf51f-87f5-479b-a9c4-a2293be84e3a'::uuid,
  114,
  'Sample task for Brisbane Safe Work Training'
),
-- Task 2: Australian National Education College (no package)
(
  '6f2717b0-fef5-4ddf-b034-545a436ca792'::uuid,
  NULL,
  'Australian National Education College',
  '2025-11-21'::date,
  'pending',
  false,
  '384cf51f-87f5-479b-a9c4-a2293be84e3a'::uuid,
  114,
  'Sample task for ANEC'
),
-- Task 3: Evolve Learning Institute (no package)
(
  '6f2717b0-fef5-4ddf-b034-545a436ca792'::uuid,
  NULL,
  'Evolve Learning Institute',
  '2025-11-21'::date,
  'pending',
  false,
  '384cf51f-87f5-479b-a9c4-a2293be84e3a'::uuid,
  114,
  'Sample task for Evolve Learning'
);