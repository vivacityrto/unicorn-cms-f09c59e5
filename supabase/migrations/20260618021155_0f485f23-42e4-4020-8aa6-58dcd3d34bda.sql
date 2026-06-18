ALTER TABLE public.audit_client_impersonation
  ADD COLUMN acting_user_id uuid NULL
    REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.audit_client_impersonation.acting_user_id IS
  'Initial tenant user the staff actor began viewing as. NULL for legacy rows or sessions where no acting user was resolved. Not updated mid-session.';