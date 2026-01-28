-- Update stage_instances.status based on status_id matching dd_status.code
UPDATE public.stage_instances si
SET status = ds.value
FROM public.dd_status ds
WHERE si.status_id = ds.code
  AND (si.status IS NULL OR si.status != ds.value);