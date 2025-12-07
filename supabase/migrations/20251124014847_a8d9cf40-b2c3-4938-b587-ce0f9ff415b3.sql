-- Create package_stages table
CREATE TABLE IF NOT EXISTS public.package_stages (
  id BIGSERIAL PRIMARY KEY,
  package_id BIGINT NOT NULL REFERENCES public.packages(id) ON DELETE CASCADE,
  stage_name TEXT NOT NULL,
  stage_description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.package_stages ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Super Admins and Team Leaders can view package stages"
  ON public.package_stages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE user_uuid = auth.uid()
      AND unicorn_role IN ('Super Admin', 'Team Leader')
    )
  );

CREATE POLICY "Super Admins and Team Leaders can insert package stages"
  ON public.package_stages
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE user_uuid = auth.uid()
      AND unicorn_role IN ('Super Admin', 'Team Leader')
    )
  );

CREATE POLICY "Super Admins and Team Leaders can update package stages"
  ON public.package_stages
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE user_uuid = auth.uid()
      AND unicorn_role IN ('Super Admin', 'Team Leader')
    )
  );

CREATE POLICY "Super Admins and Team Leaders can delete package stages"
  ON public.package_stages
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE user_uuid = auth.uid()
      AND unicorn_role IN ('Super Admin', 'Team Leader')
    )
  );

-- Create trigger for updated_at
CREATE TRIGGER update_package_stages_updated_at
  BEFORE UPDATE ON public.package_stages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();