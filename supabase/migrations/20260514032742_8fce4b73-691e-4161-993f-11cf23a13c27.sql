ALTER TABLE public.client_audit_log
  ALTER COLUMN tenant_id DROP NOT NULL,
  ADD CONSTRAINT client_audit_log_tenant_id_fkey
    FOREIGN KEY (tenant_id) REFERENCES public.tenants(id)
    ON UPDATE CASCADE
    ON DELETE SET NULL
    NOT VALID;