ALTER TABLE public.client_audits ADD COLUMN IF NOT EXISTS report_docx_path text;
NOTIFY pgrst, 'reload schema';