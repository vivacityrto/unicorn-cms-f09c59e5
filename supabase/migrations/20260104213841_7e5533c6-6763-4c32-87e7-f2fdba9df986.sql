-- Drop existing functions if they exist with wrong signatures
DROP FUNCTION IF EXISTS public.record_resource_usage(uuid, boolean);
DROP FUNCTION IF EXISTS public.get_resources_by_category(text);
DROP FUNCTION IF EXISTS public.get_all_resources();
DROP FUNCTION IF EXISTS public.add_favourite(uuid);
DROP FUNCTION IF EXISTS public.remove_favourite(uuid);
DROP FUNCTION IF EXISTS public.get_user_favourites();
DROP FUNCTION IF EXISTS public.get_most_used_resources(integer);
DROP FUNCTION IF EXISTS public.get_recently_added_resources(integer);
DROP FUNCTION IF EXISTS public.search_resources(text, text, text[]);

-- Function to record resource usage (view or download)
CREATE OR REPLACE FUNCTION public.record_resource_usage(
    p_resource_id uuid,
    p_downloaded boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    INSERT INTO public.resource_usage (resource_id, user_id, downloaded)
    VALUES (p_resource_id, auth.uid(), p_downloaded);
END;
$$;

-- Function to get resources by category with usage count
CREATE OR REPLACE FUNCTION public.get_resources_by_category(
    p_category text
)
RETURNS TABLE (
    id uuid,
    title text,
    description text,
    category text,
    file_url text,
    video_url text,
    version text,
    tags text[],
    access_level text,
    created_at timestamptz,
    updated_at timestamptz,
    usage_count bigint,
    is_favourite boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        r.id,
        r.title,
        r.description,
        r.category,
        r.file_url,
        r.video_url,
        r.version,
        r.tags,
        r.access_level,
        r.created_at,
        r.updated_at,
        COALESCE(u.usage_count, 0)::bigint as usage_count,
        EXISTS (
            SELECT 1 FROM public.resource_favourites f 
            WHERE f.resource_id = r.id AND f.user_id = auth.uid()
        ) as is_favourite
    FROM public.resource_library r
    LEFT JOIN (
        SELECT resource_id, COUNT(*) as usage_count
        FROM public.resource_usage
        GROUP BY resource_id
    ) u ON r.id = u.resource_id
    WHERE r.category = p_category
    AND (r.access_level = 'member' OR r.access_level = 'public')
    ORDER BY r.created_at DESC;
END;
$$;

-- Function to get all resources with usage count
CREATE OR REPLACE FUNCTION public.get_all_resources()
RETURNS TABLE (
    id uuid,
    title text,
    description text,
    category text,
    file_url text,
    video_url text,
    version text,
    tags text[],
    access_level text,
    created_at timestamptz,
    updated_at timestamptz,
    usage_count bigint,
    is_favourite boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        r.id,
        r.title,
        r.description,
        r.category,
        r.file_url,
        r.video_url,
        r.version,
        r.tags,
        r.access_level,
        r.created_at,
        r.updated_at,
        COALESCE(u.usage_count, 0)::bigint as usage_count,
        EXISTS (
            SELECT 1 FROM public.resource_favourites f 
            WHERE f.resource_id = r.id AND f.user_id = auth.uid()
        ) as is_favourite
    FROM public.resource_library r
    LEFT JOIN (
        SELECT resource_id, COUNT(*) as usage_count
        FROM public.resource_usage
        GROUP BY resource_id
    ) u ON r.id = u.resource_id
    WHERE r.access_level = 'member' OR r.access_level = 'public'
    ORDER BY r.created_at DESC;
END;
$$;

-- Function to add a favourite
CREATE OR REPLACE FUNCTION public.add_favourite(
    p_resource_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    INSERT INTO public.resource_favourites (resource_id, user_id)
    VALUES (p_resource_id, auth.uid())
    ON CONFLICT (resource_id, user_id) DO NOTHING;
END;
$$;

-- Function to remove a favourite
CREATE OR REPLACE FUNCTION public.remove_favourite(
    p_resource_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    DELETE FROM public.resource_favourites
    WHERE resource_id = p_resource_id AND user_id = auth.uid();
END;
$$;

-- Function to get user's favourites
CREATE OR REPLACE FUNCTION public.get_user_favourites()
RETURNS TABLE (
    id uuid,
    title text,
    description text,
    category text,
    file_url text,
    video_url text,
    version text,
    tags text[],
    access_level text,
    created_at timestamptz,
    updated_at timestamptz,
    usage_count bigint,
    is_favourite boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        r.id,
        r.title,
        r.description,
        r.category,
        r.file_url,
        r.video_url,
        r.version,
        r.tags,
        r.access_level,
        r.created_at,
        r.updated_at,
        COALESCE(u.usage_count, 0)::bigint as usage_count,
        true as is_favourite
    FROM public.resource_library r
    INNER JOIN public.resource_favourites f ON r.id = f.resource_id AND f.user_id = auth.uid()
    LEFT JOIN (
        SELECT resource_id, COUNT(*) as usage_count
        FROM public.resource_usage
        GROUP BY resource_id
    ) u ON r.id = u.resource_id
    WHERE r.access_level = 'member' OR r.access_level = 'public'
    ORDER BY f.created_at DESC;
END;
$$;

-- Function to get most used resources
CREATE OR REPLACE FUNCTION public.get_most_used_resources(
    p_limit integer DEFAULT 10
)
RETURNS TABLE (
    id uuid,
    title text,
    description text,
    category text,
    file_url text,
    video_url text,
    version text,
    tags text[],
    access_level text,
    created_at timestamptz,
    updated_at timestamptz,
    usage_count bigint,
    is_favourite boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        r.id,
        r.title,
        r.description,
        r.category,
        r.file_url,
        r.video_url,
        r.version,
        r.tags,
        r.access_level,
        r.created_at,
        r.updated_at,
        COALESCE(u.usage_count, 0)::bigint as usage_count,
        EXISTS (
            SELECT 1 FROM public.resource_favourites f 
            WHERE f.resource_id = r.id AND f.user_id = auth.uid()
        ) as is_favourite
    FROM public.resource_library r
    LEFT JOIN (
        SELECT resource_id, COUNT(*) as usage_count
        FROM public.resource_usage
        GROUP BY resource_id
    ) u ON r.id = u.resource_id
    WHERE r.access_level = 'member' OR r.access_level = 'public'
    ORDER BY usage_count DESC
    LIMIT p_limit;
END;
$$;

-- Function to get recently added resources
CREATE OR REPLACE FUNCTION public.get_recently_added_resources(
    p_limit integer DEFAULT 10
)
RETURNS TABLE (
    id uuid,
    title text,
    description text,
    category text,
    file_url text,
    video_url text,
    version text,
    tags text[],
    access_level text,
    created_at timestamptz,
    updated_at timestamptz,
    usage_count bigint,
    is_favourite boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        r.id,
        r.title,
        r.description,
        r.category,
        r.file_url,
        r.video_url,
        r.version,
        r.tags,
        r.access_level,
        r.created_at,
        r.updated_at,
        COALESCE(u.usage_count, 0)::bigint as usage_count,
        EXISTS (
            SELECT 1 FROM public.resource_favourites f 
            WHERE f.resource_id = r.id AND f.user_id = auth.uid()
        ) as is_favourite
    FROM public.resource_library r
    LEFT JOIN (
        SELECT resource_id, COUNT(*) as usage_count
        FROM public.resource_usage
        GROUP BY resource_id
    ) u ON r.id = u.resource_id
    WHERE r.access_level = 'member' OR r.access_level = 'public'
    ORDER BY r.created_at DESC
    LIMIT p_limit;
END;
$$;

-- Function to search resources
CREATE OR REPLACE FUNCTION public.search_resources(
    p_search_term text,
    p_category text DEFAULT NULL,
    p_tags text[] DEFAULT NULL
)
RETURNS TABLE (
    id uuid,
    title text,
    description text,
    category text,
    file_url text,
    video_url text,
    version text,
    tags text[],
    access_level text,
    created_at timestamptz,
    updated_at timestamptz,
    usage_count bigint,
    is_favourite boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        r.id,
        r.title,
        r.description,
        r.category,
        r.file_url,
        r.video_url,
        r.version,
        r.tags,
        r.access_level,
        r.created_at,
        r.updated_at,
        COALESCE(u.usage_count, 0)::bigint as usage_count,
        EXISTS (
            SELECT 1 FROM public.resource_favourites f 
            WHERE f.resource_id = r.id AND f.user_id = auth.uid()
        ) as is_favourite
    FROM public.resource_library r
    LEFT JOIN (
        SELECT resource_id, COUNT(*) as usage_count
        FROM public.resource_usage
        GROUP BY resource_id
    ) u ON r.id = u.resource_id
    WHERE (r.access_level = 'member' OR r.access_level = 'public')
    AND (
        p_search_term IS NULL 
        OR r.title ILIKE '%' || p_search_term || '%'
        OR r.description ILIKE '%' || p_search_term || '%'
    )
    AND (p_category IS NULL OR r.category = p_category)
    AND (p_tags IS NULL OR r.tags && p_tags)
    ORDER BY r.created_at DESC;
END;
$$;