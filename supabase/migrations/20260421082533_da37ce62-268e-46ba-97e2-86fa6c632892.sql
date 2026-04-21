CREATE OR REPLACE FUNCTION public.fn_academy_rule_dashboard_stats()
RETURNS TABLE (
  active_rules bigint,
  total_mappings bigint,
  auto_enrollments_to_date bigint,
  unmapped_packages bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_vivacity() THEN
    RAISE EXCEPTION 'Access denied: Vivacity staff only';
  END IF;

  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM public.academy_package_course_rules WHERE is_active = true)::bigint,
    (SELECT COUNT(*) FROM public.academy_package_course_rules)::bigint,
    (SELECT COUNT(*) FROM public.academy_enrollments WHERE source IN ('auto_package','auto_package_backfill'))::bigint,
    (SELECT COUNT(*) FROM public.packages p
       WHERE p.status = 'active'
         AND NOT EXISTS (
           SELECT 1 FROM public.academy_package_course_rules r
           WHERE r.package_id = p.id AND r.is_active = true
         ))::bigint;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_academy_rule_dashboard_stats() TO authenticated;