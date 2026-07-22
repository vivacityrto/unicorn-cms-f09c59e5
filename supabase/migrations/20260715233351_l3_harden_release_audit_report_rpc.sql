
-- L3 (16 Jul 2026 Unicorn security audit addendum): harden the release_audit_report
-- RPC. This RPC is dead code from the UI's perspective -- the real "Release Report
-- to Client" path is the release-audit-report edge function, already gated with
-- check_permission(caller, 'audits.report', 'full') on 16 Jul 2026 -- but the RPC
-- was previously ungated (any authenticated user could call it directly via
-- PostgREST) and trusted a caller-supplied p_released_by with no validation.
--
-- Also corrects the same constraint-value bug already fixed in the edge function:
-- this RPC's original direction='outbound'/status='active'/source='audit_report'
-- values violate check constraints added later, so every real call has thrown
-- 23514 -- this migration brings it in line with the edge function's corrected
-- values (vivacity_to_client / shared / generated) so the function is no longer
-- silently broken dead code, on top of being properly gated.

create or replace function public.release_audit_report(
  p_audit_id uuid,
  p_released_by uuid default null,
  p_release_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_tenant_id     bigint;
  v_report_path   text;
  v_file_name     text;
  v_portal_doc_id uuid;
  v_audit_title   text;
  v_caller        uuid := auth.uid();
begin
  if v_caller is null then
    return jsonb_build_object('success', false, 'error', 'Not authenticated');
  end if;

  if not public.check_permission(v_caller, 'audits.report', 'full') then
    return jsonb_build_object('success', false, 'error', 'Forbidden');
  end if;

  if p_released_by is not null and p_released_by <> v_caller then
    return jsonb_build_object('success', false, 'error', 'released_by must match the authenticated caller');
  end if;

  select subject_tenant_id, report_pdf_path,
         coalesce(title, 'Audit Report'), doc_number
  into v_tenant_id, v_report_path, v_audit_title, v_file_name
  from public.client_audits
  where id = p_audit_id;

  if v_tenant_id is null then
    return jsonb_build_object('success', false, 'error', 'Audit not found');
  end if;

  if v_report_path is null then
    return jsonb_build_object('success', false, 'error', 'No report PDF has been generated yet');
  end if;

  insert into public.portal_documents (
    tenant_id, storage_path, file_name, file_type, direction,
    is_client_visible, status, source, linked_audit_id, description,
    uploaded_by, uploaded_at, shared_at, shared_by
  ) values (
    v_tenant_id, v_report_path,
    coalesce(v_file_name, 'Compliance Health Check Report') || '.pdf',
    'application/pdf',
    'vivacity_to_client',
    true,
    'shared',
    'generated',
    p_audit_id,
    coalesce(p_release_notes, 'Compliance audit report'),
    v_caller, now(), now(), v_caller
  )
  returning id into v_portal_doc_id;

  update public.client_audits set
    report_client_visible = true,
    report_released_at    = now(),
    report_released_by    = v_caller,
    report_release_notes  = p_release_notes
  where id = p_audit_id;

  return jsonb_build_object(
    'success', true,
    'portal_document_id', v_portal_doc_id,
    'released_at', now()
  );
end;
$function$;

NOTIFY pgrst, 'reload schema';
