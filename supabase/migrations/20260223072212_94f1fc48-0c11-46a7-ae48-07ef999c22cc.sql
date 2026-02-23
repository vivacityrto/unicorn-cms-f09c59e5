-- Clean up the bad "undefined" interval row
DELETE FROM public.clickup_time_entries WHERE clickup_interval_id = 'undefined';