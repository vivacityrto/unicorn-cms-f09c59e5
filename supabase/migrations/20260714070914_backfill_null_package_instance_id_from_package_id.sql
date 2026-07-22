
-- Data-integrity backfill: carry-over adjustment entries (and any other legacy rows) were being
-- created with package_instance_id left NULL, even though package_id already held a valid
-- package_instances.id. This makes them invisible to every correct calculation.
-- Only touches rows where package_instance_id is currently NULL and package_id resolves to a
-- real, existing package_instances row for the SAME tenant (safety check to avoid mis-linking).
update public.time_entries te
set package_instance_id = te.package_id
from public.package_instances pi
where te.package_instance_id is null
  and te.package_id is not null
  and pi.id = te.package_id
  and pi.tenant_id = te.tenant_id;
