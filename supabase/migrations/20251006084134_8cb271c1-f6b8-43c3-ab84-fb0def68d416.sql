-- Create notification_tenants table
CREATE TABLE public.notification_tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  document_id BIGINT REFERENCES public.documents_tenants(id) ON DELETE CASCADE,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.notification_tenants ENABLE ROW LEVEL SECURITY;

-- Create policies for notification_tenants
-- Super Admins can view all notifications
CREATE POLICY "Super Admins can view all notifications"
ON public.notification_tenants
FOR SELECT
USING (public.is_super_admin());

-- Users can view notifications for their tenant
CREATE POLICY "Users can view their tenant notifications"
ON public.notification_tenants
FOR SELECT
USING (tenant_id = public.get_current_user_tenant());

-- Users can update their tenant notifications (mark as read)
CREATE POLICY "Users can update their tenant notifications"
ON public.notification_tenants
FOR UPDATE
USING (tenant_id = public.get_current_user_tenant())
WITH CHECK (tenant_id = public.get_current_user_tenant());

-- Super Admins can manage all notifications
CREATE POLICY "Super Admins can manage all notifications"
ON public.notification_tenants
FOR ALL
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_notification_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Create trigger for updated_at
CREATE TRIGGER update_notification_tenants_updated_at
BEFORE UPDATE ON public.notification_tenants
FOR EACH ROW
EXECUTE FUNCTION public.update_notification_updated_at();

-- Create index for faster queries
CREATE INDEX idx_notification_tenants_tenant_id ON public.notification_tenants(tenant_id);
CREATE INDEX idx_notification_tenants_is_read ON public.notification_tenants(is_read);
CREATE INDEX idx_notification_tenants_created_at ON public.notification_tenants(created_at DESC);