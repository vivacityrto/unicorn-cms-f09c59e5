-- =====================================================
-- Fix SECURITY DEFINER views - Set to SECURITY INVOKER
-- =====================================================
-- Views without security_invoker=true bypass RLS policies and use
-- the view creator's permissions. Setting security_invoker=true
-- ensures RLS policies are enforced for the querying user.

-- Fix document_stage_usage view
ALTER VIEW public.document_stage_usage SET (security_invoker = true);

-- Fix gwc_seat_trends view  
ALTER VIEW public.gwc_seat_trends SET (security_invoker = true);

-- Fix seat_linked_data view
ALTER VIEW public.seat_linked_data SET (security_invoker = true);

-- Fix seat_succession_status view
ALTER VIEW public.seat_succession_status SET (security_invoker = true);

-- Note: dashboard_client_snapshot has security_invoker=on which is equivalent to true