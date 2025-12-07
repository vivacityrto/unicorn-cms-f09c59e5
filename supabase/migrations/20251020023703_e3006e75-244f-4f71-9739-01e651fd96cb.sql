-- Create a view that aggregates client counts per package
CREATE OR REPLACE VIEW packages_with_client_counts AS
SELECT 
  p.id,
  p.name,
  COUNT(DISTINCT CASE WHEN t.status = 'active' THEN t.id END) as active_clients,
  COUNT(DISTINCT t.id) as all_clients
FROM packages p
LEFT JOIN tenants t ON t.package_id = p.id
GROUP BY p.id, p.name;

-- Grant access to authenticated users
GRANT SELECT ON packages_with_client_counts TO authenticated;