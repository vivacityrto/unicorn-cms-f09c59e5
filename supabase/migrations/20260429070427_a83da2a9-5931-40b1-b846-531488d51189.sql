-- Per-response completion view.
-- A response is "complete" when:
--   * rating is set, AND
--   * if rating IN ('at_risk','non_compliant'): notes are non-empty
--     AND at least one finding exists for this response_id.
--   * if rating IN ('compliant','na'): rating presence is enough.
create or replace view public.v_client_audit_response_completion
with (security_invoker = true) as
select
  r.id                                  as response_id,
  r.audit_id,
  r.section_id,
  r.question_id,
  r.rating,
  (coalesce(r.notes, '') <> '')         as has_notes,
  exists (
    select 1 from public.client_audit_findings f
    where f.response_id = r.id
  )                                     as has_finding,
  case
    when r.rating is null then false
    when r.rating in ('at_risk','non_compliant') then
      coalesce(r.notes, '') <> ''
      and exists (
        select 1 from public.client_audit_findings f
        where f.response_id = r.id
      )
    else true
  end                                   as is_complete,
  case
    when r.rating is null then 'unanswered'
    when r.rating in ('at_risk','non_compliant')
      and not exists (
        select 1 from public.client_audit_findings f
        where f.response_id = r.id
      ) then 'finding_required'
    when r.rating in ('at_risk','non_compliant')
      and coalesce(r.notes, '') = '' then 'notes_required'
    else 'complete'
  end                                   as completion_state
from public.client_audit_responses r;

comment on view public.v_client_audit_response_completion is
  'Per-response completion. A response is complete when rating is set; for at_risk/non_compliant a non-empty note and at least one linked finding are also required. security_invoker=true preserves RLS.';

-- Per-section rollup
create or replace view public.v_client_audit_section_completion
with (security_invoker = true) as
select
  s.id                                  as section_id,
  s.audit_id,
  s.title,
  s.audit_phase,
  s.sort_order,
  count(c.response_id)                  as total_questions,
  count(*) filter (where c.is_complete) as complete_count,
  count(*) filter (where c.completion_state = 'finding_required') as findings_required,
  count(*) filter (where c.completion_state = 'notes_required')   as notes_required,
  count(*) filter (where c.rating is null)                        as unanswered,
  case
    when count(c.response_id) = 0 then 'empty'
    when count(*) filter (where c.is_complete) = count(c.response_id) then 'complete'
    when count(*) filter (where c.rating is not null) = count(c.response_id) then 'rated_incomplete'
    else 'in_progress'
  end                                   as section_state
from public.client_audit_sections s
left join public.v_client_audit_response_completion c
  on c.section_id = s.id
group by s.id, s.audit_id, s.title, s.audit_phase, s.sort_order;

comment on view public.v_client_audit_section_completion is
  'Per-section rollup of response completion. section_state: empty | complete | rated_incomplete | in_progress. security_invoker=true preserves RLS.';

-- Per-audit rollup
create or replace view public.v_client_audit_progress
with (security_invoker = true) as
select
  a.id                                  as audit_id,
  count(c.response_id)                  as total_questions,
  count(*) filter (where c.is_complete) as complete_count,
  count(*) filter (where c.completion_state = 'finding_required') as findings_required,
  count(*) filter (where c.completion_state = 'notes_required')   as notes_required,
  count(*) filter (where c.rating is null)                        as unanswered
from public.client_audits a
left join public.v_client_audit_response_completion c
  on c.audit_id = a.id
group by a.id;

comment on view public.v_client_audit_progress is
  'Per-audit rollup powering the workspace sidebar progress block. security_invoker=true preserves RLS.';