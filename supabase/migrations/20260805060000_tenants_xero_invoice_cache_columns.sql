ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS xero_invoice_paid boolean,
  ADD COLUMN IF NOT EXISTS xero_invoice_due_date date,
  ADD COLUMN IF NOT EXISTS xero_invoice_checked_at timestamptz;

COMMENT ON COLUMN public.tenants.xero_invoice_paid IS
  'Cached paid status of this tenant''s most recent Xero invoice (null = never checked or no Xero Contact linked). Refreshed by the xero-invoice-sync-all cron job and by manual "Check Xero" clicks (xero-invoice-status). Deliberately a cache, not a live value - Manage Tenants lists all tenants in one query and cannot do a live Xero API call per row.';

COMMENT ON COLUMN public.tenants.xero_invoice_due_date IS
  'Due date of the most recent Xero invoice, only populated when xero_invoice_paid = false.';

COMMENT ON COLUMN public.tenants.xero_invoice_checked_at IS
  'When the Xero invoice cache columns were last refreshed for this tenant.';
