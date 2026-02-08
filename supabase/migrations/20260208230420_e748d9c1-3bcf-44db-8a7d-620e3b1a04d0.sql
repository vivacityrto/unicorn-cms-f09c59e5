-- Create AI Interaction Logs table for Ask Viv audit logging
CREATE TABLE IF NOT EXISTS public.ai_interaction_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tenant_id bigint NULL,
  mode text NOT NULL CHECK (mode IN ('knowledge', 'compliance')),
  prompt_text text NOT NULL,
  response_text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Add foreign key constraint to users table
ALTER TABLE public.ai_interaction_logs 
ADD CONSTRAINT ai_interaction_logs_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES public.users(user_uuid);

-- Add optional foreign key to tenants table
ALTER TABLE public.ai_interaction_logs 
ADD CONSTRAINT ai_interaction_logs_tenant_id_fkey 
FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);

-- Enable Row Level Security
ALTER TABLE public.ai_interaction_logs ENABLE ROW LEVEL SECURITY;

-- Create policy: users can insert their own logs
CREATE POLICY "ai_logs_insert_own"
ON public.ai_interaction_logs
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Create policy: users can read their own logs
CREATE POLICY "ai_logs_select_own"
ON public.ai_interaction_logs
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Create index for user lookups
CREATE INDEX idx_ai_interaction_logs_user_id ON public.ai_interaction_logs(user_id);
CREATE INDEX idx_ai_interaction_logs_created_at ON public.ai_interaction_logs(created_at DESC);

-- Add ask_viv_floating_launcher_enabled column to app_settings for feature flag
ALTER TABLE public.app_settings 
ADD COLUMN IF NOT EXISTS ask_viv_floating_launcher_enabled boolean NOT NULL DEFAULT false;

COMMENT ON TABLE public.ai_interaction_logs IS 'Audit log for Ask Viv AI assistant interactions';