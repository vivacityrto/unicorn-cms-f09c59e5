
-- Add legacy_code column for backward compatibility with users.state numeric codes
ALTER TABLE public.dd_states ADD COLUMN legacy_code integer UNIQUE;

-- Update legacy codes to match ctstates.Code values
UPDATE public.dd_states SET legacy_code = 0, sort_order = 1 WHERE code = 'act';
UPDATE public.dd_states SET legacy_code = 1, sort_order = 2 WHERE code = 'nsw';
UPDATE public.dd_states SET legacy_code = 2, sort_order = 3 WHERE code = 'nt';
UPDATE public.dd_states SET legacy_code = 3, sort_order = 4 WHERE code = 'qld';
UPDATE public.dd_states SET legacy_code = 4, sort_order = 5 WHERE code = 'sa';
UPDATE public.dd_states SET legacy_code = 5, sort_order = 6 WHERE code = 'tas';
UPDATE public.dd_states SET legacy_code = 6, sort_order = 7 WHERE code = 'vic';
UPDATE public.dd_states SET legacy_code = 7, sort_order = 8 WHERE code = 'wa';
UPDATE public.dd_states SET sort_order = 999 WHERE code = 'national';
