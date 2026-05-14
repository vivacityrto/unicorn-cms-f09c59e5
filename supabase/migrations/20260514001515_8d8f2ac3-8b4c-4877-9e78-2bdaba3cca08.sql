REVOKE SELECT ON public.v_workspace_audit_log FROM authenticated;
GRANT SELECT ON public.v_workspace_audit_log TO service_role;