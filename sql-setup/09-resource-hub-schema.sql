-- Resource Hub Schema Migration
-- Creates tables for resource library, usage tracking, and favourites

-- Create resource_library table
CREATE TABLE IF NOT EXISTS public.resource_library (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title text NOT NULL,
    description text,
    category text NOT NULL,
    file_url text,
    video_url text,
    version text DEFAULT 'v1.0',
    tags text[] DEFAULT '{}',
    access_level text DEFAULT 'member',
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Create resource_usage table for tracking views and downloads
CREATE TABLE IF NOT EXISTS public.resource_usage (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_id uuid REFERENCES public.resource_library(id) ON DELETE CASCADE NOT NULL,
    user_id uuid NOT NULL,
    viewed_at timestamptz DEFAULT now(),
    downloaded boolean DEFAULT false
);

-- Create resource_favourites table
CREATE TABLE IF NOT EXISTS public.resource_favourites (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_id uuid REFERENCES public.resource_library(id) ON DELETE CASCADE NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamptz DEFAULT now(),
    UNIQUE (resource_id, user_id)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_resource_library_category ON public.resource_library(category);
CREATE INDEX IF NOT EXISTS idx_resource_library_access_level ON public.resource_library(access_level);
CREATE INDEX IF NOT EXISTS idx_resource_library_created_at ON public.resource_library(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_resource_usage_resource_id ON public.resource_usage(resource_id);
CREATE INDEX IF NOT EXISTS idx_resource_usage_user_id ON public.resource_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_resource_favourites_user_id ON public.resource_favourites(user_id);

-- Enable Row Level Security
ALTER TABLE public.resource_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resource_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resource_favourites ENABLE ROW LEVEL SECURITY;

-- RLS Policies for resource_library
-- Members can view resources with access_level = 'member'
CREATE POLICY "Members can view member resources"
    ON public.resource_library
    FOR SELECT
    TO authenticated
    USING (access_level = 'member' OR access_level = 'public');

-- Staff/Admin can insert resources
CREATE POLICY "Staff can insert resources"
    ON public.resource_library
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member')
        )
    );

-- Staff/Admin can update resources
CREATE POLICY "Staff can update resources"
    ON public.resource_library
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member')
        )
    );

-- Staff/Admin can delete resources
CREATE POLICY "Staff can delete resources"
    ON public.resource_library
    FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member')
        )
    );

-- RLS Policies for resource_usage
-- Users can view their own usage
CREATE POLICY "Users can view own usage"
    ON public.resource_usage
    FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

-- Users can insert their own usage
CREATE POLICY "Users can insert own usage"
    ON public.resource_usage
    FOR INSERT
    TO authenticated
    WITH CHECK (user_id = auth.uid());

-- Staff can view all usage for analytics
CREATE POLICY "Staff can view all usage"
    ON public.resource_usage
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member')
        )
    );

-- RLS Policies for resource_favourites
-- Users can view their own favourites
CREATE POLICY "Users can view own favourites"
    ON public.resource_favourites
    FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

-- Users can insert their own favourites
CREATE POLICY "Users can insert own favourites"
    ON public.resource_favourites
    FOR INSERT
    TO authenticated
    WITH CHECK (user_id = auth.uid());

-- Users can delete their own favourites
CREATE POLICY "Users can delete own favourites"
    ON public.resource_favourites
    FOR DELETE
    TO authenticated
    USING (user_id = auth.uid());
