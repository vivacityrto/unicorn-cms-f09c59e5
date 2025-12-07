UPDATE tenants 
SET package_added_at = '2024-10-28'::date 
WHERE status = 'inactive' AND package_added_at IS NULL;