
-- Drop old overload without p_visibility parameter
DROP FUNCTION IF EXISTS public.rpc_search_timeline_events(bigint, bigint, text, text[], integer, integer, timestamptz, timestamptz, text, bigint);

-- Set search_path on the new function
ALTER FUNCTION public.rpc_search_timeline_events(bigint, bigint, text, text[], integer, integer, timestamptz, timestamptz, text, bigint, text) SET search_path = public;
