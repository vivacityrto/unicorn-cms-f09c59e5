UPDATE public.user_notifications
SET source_id = substring(link FROM 'conversation=([a-f0-9\-]+)')
WHERE source_id IS NULL
  AND type = 'message'
  AND link LIKE '%conversation=%';