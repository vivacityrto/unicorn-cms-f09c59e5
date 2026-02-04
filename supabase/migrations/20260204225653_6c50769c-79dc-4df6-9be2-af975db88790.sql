-- Enable RLS on tables missing it
-- These are code/lookup tables that should be readable by authenticated users
-- and writable only by Super Admins

-- =====================================================
-- dd_document_categories - Document category reference data
-- =====================================================
ALTER TABLE public.dd_document_categories ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read categories
CREATE POLICY "Authenticated users can read document categories"
ON public.dd_document_categories
FOR SELECT
TO authenticated
USING (true);

-- Only Super Admins can manage categories
CREATE POLICY "Super Admins can manage document categories"
ON public.dd_document_categories
FOR ALL
TO authenticated
USING (public.is_superadmin())
WITH CHECK (public.is_superadmin());

-- =====================================================
-- dd_fields - Field reference data
-- =====================================================
ALTER TABLE public.dd_fields ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read fields
CREATE POLICY "Authenticated users can read fields"
ON public.dd_fields
FOR SELECT
TO authenticated
USING (true);

-- Only Super Admins can manage fields
CREATE POLICY "Super Admins can manage fields"
ON public.dd_fields
FOR ALL
TO authenticated
USING (public.is_superadmin())
WITH CHECK (public.is_superadmin());

-- =====================================================
-- document_fields - Document field definitions
-- =====================================================
ALTER TABLE public.document_fields ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read document fields
CREATE POLICY "Authenticated users can read document fields"
ON public.document_fields
FOR SELECT
TO authenticated
USING (true);

-- Only Super Admins can manage document fields
CREATE POLICY "Super Admins can manage document fields"
ON public.document_fields
FOR ALL
TO authenticated
USING (public.is_superadmin())
WITH CHECK (public.is_superadmin());