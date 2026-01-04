-- Resource Hub Storage Buckets
-- Creates storage buckets for PDFs, videos, and templates

-- Create storage buckets for resources
INSERT INTO storage.buckets (id, name, public)
VALUES 
    ('resource-pdfs', 'resource-pdfs', true),
    ('resource-videos', 'resource-videos', true),
    ('resource-templates', 'resource-templates', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for resource buckets
CREATE POLICY "Anyone can view resource pdfs"
    ON storage.objects
    FOR SELECT
    TO authenticated
    USING (bucket_id = 'resource-pdfs');

CREATE POLICY "Staff can upload resource pdfs"
    ON storage.objects
    FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'resource-pdfs' AND
        EXISTS (
            SELECT 1 FROM public.users
            WHERE user_uuid = auth.uid()
            AND role IN ('Super Admin', 'Team Leader', 'Team Member')
        )
    );

CREATE POLICY "Anyone can view resource videos"
    ON storage.objects
    FOR SELECT
    TO authenticated
    USING (bucket_id = 'resource-videos');

CREATE POLICY "Staff can upload resource videos"
    ON storage.objects
    FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'resource-videos' AND
        EXISTS (
            SELECT 1 FROM public.users
            WHERE user_uuid = auth.uid()
            AND role IN ('Super Admin', 'Team Leader', 'Team Member')
        )
    );

CREATE POLICY "Anyone can view resource templates"
    ON storage.objects
    FOR SELECT
    TO authenticated
    USING (bucket_id = 'resource-templates');

CREATE POLICY "Staff can upload resource templates"
    ON storage.objects
    FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'resource-templates' AND
        EXISTS (
            SELECT 1 FROM public.users
            WHERE user_uuid = auth.uid()
            AND role IN ('Super Admin', 'Team Leader', 'Team Member')
        )
    );