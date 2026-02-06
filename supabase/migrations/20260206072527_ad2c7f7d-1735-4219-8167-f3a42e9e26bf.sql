-- Create user_microsoft_identities table for per-user MS identity storage
CREATE TABLE IF NOT EXISTS public.user_microsoft_identities (
  user_uuid uuid PRIMARY KEY REFERENCES public.users(user_uuid) ON DELETE CASCADE,
  ms_user_id text NOT NULL,
  email text NOT NULL,
  display_name text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_user_ms_identities_ms_user_id ON public.user_microsoft_identities(ms_user_id);
CREATE INDEX IF NOT EXISTS idx_user_ms_identities_email ON public.user_microsoft_identities(email);

-- Enable RLS
ALTER TABLE public.user_microsoft_identities ENABLE ROW LEVEL SECURITY;

-- Users can read/write their own row
CREATE POLICY "user_ms_identity_own_select" 
ON public.user_microsoft_identities 
FOR SELECT 
TO authenticated 
USING (auth.uid() = user_uuid);

CREATE POLICY "user_ms_identity_own_insert" 
ON public.user_microsoft_identities 
FOR INSERT 
TO authenticated 
WITH CHECK (auth.uid() = user_uuid);

CREATE POLICY "user_ms_identity_own_update" 
ON public.user_microsoft_identities 
FOR UPDATE 
TO authenticated 
USING (auth.uid() = user_uuid)
WITH CHECK (auth.uid() = user_uuid);

-- SuperAdmin can read all (but not write)
CREATE POLICY "user_ms_identity_superadmin_select" 
ON public.user_microsoft_identities 
FOR SELECT 
TO authenticated 
USING (public.is_super_admin());

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION public.update_user_ms_identity_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_user_ms_identity_updated_at
BEFORE UPDATE ON public.user_microsoft_identities
FOR EACH ROW
EXECUTE FUNCTION public.update_user_ms_identity_updated_at();

-- Add comments
COMMENT ON TABLE public.user_microsoft_identities IS 'Stores Microsoft identity per Unicorn user for add-in authentication';
COMMENT ON COLUMN public.user_microsoft_identities.ms_user_id IS 'Microsoft user object ID (from Graph API)';