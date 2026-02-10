
-- Create table for TGA review tracking
CREATE TABLE public.client_tga_reviews (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  reviewed_by_user_id UUID NOT NULL,
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT NULL,
  source TEXT NOT NULL DEFAULT 'client' CHECK (source IN ('client', 'vivacity'))
);

-- Enable RLS
ALTER TABLE public.client_tga_reviews ENABLE ROW LEVEL SECURITY;

-- Client users can view reviews for their own tenant
CREATE POLICY "client_tga_reviews_select_tenant"
  ON public.client_tga_reviews
  FOR SELECT
  USING (
    has_tenant_access_safe(tenant_id, auth.uid())
  );

-- Client users can insert reviews for their own tenant
CREATE POLICY "client_tga_reviews_insert_tenant"
  ON public.client_tga_reviews
  FOR INSERT
  WITH CHECK (
    has_tenant_access_safe(tenant_id, auth.uid())
    AND reviewed_by_user_id = auth.uid()
  );

-- Index for fast tenant lookups
CREATE INDEX idx_client_tga_reviews_tenant ON public.client_tga_reviews(tenant_id);
CREATE INDEX idx_client_tga_reviews_reviewed_at ON public.client_tga_reviews(tenant_id, reviewed_at DESC);
