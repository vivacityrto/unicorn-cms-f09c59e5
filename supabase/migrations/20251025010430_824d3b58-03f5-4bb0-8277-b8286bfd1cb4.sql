-- Create a function to get package stats with proper RLS handling
CREATE OR REPLACE FUNCTION get_package_stats(p_package_id bigint)
RETURNS TABLE (
  all_clients bigint,
  active_clients bigint
) 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*) FILTER (WHERE status IS NOT NULL) as all_clients,
    COUNT(*) FILTER (WHERE status = 'active') as active_clients
  FROM tenants
  WHERE package_id = p_package_id;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_package_stats(bigint) TO authenticated;