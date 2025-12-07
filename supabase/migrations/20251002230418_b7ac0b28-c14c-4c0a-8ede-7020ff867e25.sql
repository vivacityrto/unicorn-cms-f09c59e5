-- Create calendar_entries table for meetings and notes
CREATE TABLE IF NOT EXISTS public.calendar_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  entry_date DATE NOT NULL,
  entry_time TIME,
  email_recipients TEXT[], -- Array of email addresses
  tenant_id BIGINT REFERENCES public.tenants(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.calendar_entries ENABLE ROW LEVEL SECURITY;

-- Super Admins can do everything
CREATE POLICY "Super Admins can manage all calendar entries"
ON public.calendar_entries
FOR ALL
USING (is_super_admin())
WITH CHECK (is_super_admin());

-- Admins can view entries for their tenant
CREATE POLICY "Admins can view their tenant calendar entries"
ON public.calendar_entries
FOR SELECT
USING (
  (get_current_user_role() = 'Admin' AND tenant_id = get_current_user_tenant())
);

-- Users can view entries where they are recipients
CREATE POLICY "Users can view calendar entries where they are recipients"
ON public.calendar_entries
FOR SELECT
USING (
  auth.email() = ANY(email_recipients)
);

-- Create updated_at trigger
CREATE TRIGGER update_calendar_entries_updated_at
BEFORE UPDATE ON public.calendar_entries
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add index for faster queries
CREATE INDEX idx_calendar_entries_date ON public.calendar_entries(entry_date);
CREATE INDEX idx_calendar_entries_tenant ON public.calendar_entries(tenant_id);
CREATE INDEX idx_calendar_entries_recipients ON public.calendar_entries USING GIN(email_recipients);