-- Delete test process records
-- No related process_versions exist, so safe to delete directly

DELETE FROM public.processes
WHERE id IN (
  '870d0dbf-7836-4ea5-9c6a-5d569b690f37',
  '0343f220-dd17-4022-937b-8460506a657a',
  'aa4be5cd-6b46-49c2-965e-50d11926fb2b',
  '95c90b0f-95ac-46d0-9eae-facbe5b2ca88'
);