ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS xero_contact_url text,
  ADD COLUMN IF NOT EXISTS xero_repeating_invoice_url text;