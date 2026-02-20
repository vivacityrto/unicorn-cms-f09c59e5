-- Grant SELECT on v_clickup_tasks to authenticated and anon roles
GRANT SELECT ON public.v_clickup_tasks TO authenticated;
GRANT SELECT ON public.v_clickup_tasks TO anon;

-- Reload PostgREST schema cache so the view is accessible via the REST API
NOTIFY pgrst, 'reload schema';