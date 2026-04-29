create or replace function public.can_delete_incomplete_audit(p_audit_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.client_audits a
    where a.id = p_audit_id
      and (
        public.is_vivacity_team_safe(auth.uid())
        or exists (
          select 1
          from public.tenant_members tm
          where tm.tenant_id = a.subject_tenant_id
            and tm.user_id = auth.uid()
        )
      )
      and a.status in ('draft','in_progress')
      and a.closed_at is null
      and a.report_generated_at is null
  );
$$;

comment on function public.can_delete_incomplete_audit(uuid) is
  'Gate: caller must be Vivacity staff or a member of the audit tenant, and the audit must still be incomplete (not closed, no report generated).';

comment on column public.client_audit_log.action is
  'Examples: audit.created, audit.status_changed, audit.report_generated, audit.report_released, audit.deleted_incomplete';