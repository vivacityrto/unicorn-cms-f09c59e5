-- Create package_staff_tasks table
CREATE TABLE public.package_staff_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id bigint NOT NULL,
  stage_id bigint NOT NULL,
  name text NOT NULL,
  description text,
  due_date_offset integer,
  order_number integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT fk_package_staff_tasks_package FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE CASCADE,
  CONSTRAINT fk_package_staff_tasks_stage FOREIGN KEY (stage_id) REFERENCES documents_stages(id) ON DELETE CASCADE
);

-- Create package_client_tasks table
CREATE TABLE public.package_client_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id bigint NOT NULL,
  stage_id bigint NOT NULL,
  name text NOT NULL,
  description text,
  due_date_offset integer,
  order_number integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT fk_package_client_tasks_package FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE CASCADE,
  CONSTRAINT fk_package_client_tasks_stage FOREIGN KEY (stage_id) REFERENCES documents_stages(id) ON DELETE CASCADE
);

-- Create indexes for better query performance
CREATE INDEX idx_package_staff_tasks_package_stage ON public.package_staff_tasks(package_id, stage_id);
CREATE INDEX idx_package_client_tasks_package_stage ON public.package_client_tasks(package_id, stage_id);

-- Enable RLS
ALTER TABLE public.package_staff_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.package_client_tasks ENABLE ROW LEVEL SECURITY;

-- RLS Policies for package_staff_tasks
CREATE POLICY "Super Admins can manage all package staff tasks"
  ON public.package_staff_tasks
  FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

CREATE POLICY "Users can view package staff tasks"
  ON public.package_staff_tasks
  FOR SELECT
  USING (true);

-- RLS Policies for package_client_tasks
CREATE POLICY "Super Admins can manage all package client tasks"
  ON public.package_client_tasks
  FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

CREATE POLICY "Users can view package client tasks"
  ON public.package_client_tasks
  FOR SELECT
  USING (true);

-- Add trigger for updated_at on package_staff_tasks
CREATE TRIGGER update_package_staff_tasks_updated_at
  BEFORE UPDATE ON public.package_staff_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add trigger for updated_at on package_client_tasks
CREATE TRIGGER update_package_client_tasks_updated_at
  BEFORE UPDATE ON public.package_client_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();