-- ─────────────────────────────────────────────────────────────────────
-- AI Drafting Insights: view + summary RPCs
-- Strictly additive. No changes to existing tables, RLS, or functions.
-- ─────────────────────────────────────────────────────────────────────

create or replace view public.v_ai_finding_draft_outcomes
with (security_invoker = true) as
select
  d.id                                              as draft_log_id,
  d.created_at                                      as drafted_at,
  d.actor_user_id                                   as drafted_by,
  d.tenant_id,
  d.entity_id::uuid                                 as response_id,
  -- Audit + question context
  r.audit_id,
  r.question_id,
  q.clause,
  s.code_prefix                                     as quality_area,
  a.audit_type,
  a.snapshot_rto_name,
  a.title                                           as audit_title,
  -- Draft fields
  d.details ->> 'auditor_note'                      as auditor_note,
  d.details ->> 'model'                             as model,
  (d.details ->> 'prompt_tokens')::int              as prompt_tokens,
  (d.details ->> 'completion_tokens')::int          as completion_tokens,
  (d.details ->> 'duration_ms')::int                as duration_ms,
  d.details -> 'draft'                              as draft_json,
  d.details -> 'corpus_chunks_used'                 as corpus_chunks_used,
  coalesce((d.details ->> 'corpus_empty')::boolean, false) as corpus_empty,
  d.details ->> 'confidence'                        as confidence,
  -- Decision fields (null when no decision yet recorded)
  dec.created_at                                    as decided_at,
  dec.details ->> 'decision'                        as decision,
  (dec.details ->> 'edit_distance_pct')::numeric    as edit_distance_pct,
  dec.details ->> 'final_summary'                   as final_summary,
  dec.details ->> 'final_priority'                  as final_priority,
  -- Derived outcome bucket
  case
    when dec.id is null then 'pending'
    when (dec.details ->> 'decision') = 'rejected' then 'rejected'
    when (dec.details ->> 'decision') = 'accepted' then 'accepted_unchanged'
    when (dec.details ->> 'edit_distance_pct')::numeric <= 20 then 'accepted_light_edit'
    when (dec.details ->> 'edit_distance_pct')::numeric <= 50 then 'accepted_moderate_edit'
    else 'accepted_heavy_edit'
  end                                               as outcome_bucket
from public.client_audit_log d
-- Index-friendly join: cast the JSON text to uuid, compare against the
-- uuid PK on client_audit_log so postgres can use the PK index.
left join public.client_audit_log dec
  on dec.action = 'ai.finding_decision'
  and (dec.details ->> 'draft_log_id')::uuid = d.id
left join public.client_audit_responses r on r.id = d.entity_id::uuid
left join public.compliance_template_questions q on q.id = r.question_id
left join public.client_audit_sections s on s.id = r.section_id
left join public.client_audits a on a.id = r.audit_id
where d.action = 'ai.finding_drafted';

comment on view public.v_ai_finding_draft_outcomes is
  'AI finding drafts joined to their decisions. security_invoker preserves RLS on client_audit_log.';

-- ─── Summary RPC ────────────────────────────────────────────────────
create or replace function public.ai_drafting_summary(
  p_window_days integer default 30
)
returns table (
  total_drafts             integer,
  pending                  integer,
  accepted_unchanged       integer,
  accepted_light_edit      integer,
  accepted_moderate_edit   integer,
  accepted_heavy_edit      integer,
  rejected                 integer,
  acceptance_rate_pct      numeric,
  avg_edit_distance_pct    numeric,
  total_prompt_tokens      bigint,
  total_completion_tokens  bigint,
  unique_users             integer,
  cap_hit_users            integer
)
language sql
stable
security invoker
set search_path = public
as $$
  with windowed as (
    select * from public.v_ai_finding_draft_outcomes
    where drafted_at >= now() - make_interval(days => p_window_days)
  ),
  cap_hits as (
    select actor_user_id
    from public.client_audit_log
    where action = 'ai.finding_drafted'
      and created_at >= now() - interval '24 hours'
    group by actor_user_id
    having count(*) >= 40
  )
  select
    count(*)::int                                                                 as total_drafts,
    count(*) filter (where outcome_bucket = 'pending')::int                       as pending,
    count(*) filter (where outcome_bucket = 'accepted_unchanged')::int            as accepted_unchanged,
    count(*) filter (where outcome_bucket = 'accepted_light_edit')::int           as accepted_light_edit,
    count(*) filter (where outcome_bucket = 'accepted_moderate_edit')::int        as accepted_moderate_edit,
    count(*) filter (where outcome_bucket = 'accepted_heavy_edit')::int           as accepted_heavy_edit,
    count(*) filter (where outcome_bucket = 'rejected')::int                      as rejected,
    case when count(*) filter (where decision is not null) = 0 then null
         else round(100.0 * count(*) filter (where decision in ('accepted','edited'))
                          / count(*) filter (where decision is not null), 1)
    end                                                                           as acceptance_rate_pct,
    round(avg(edit_distance_pct) filter (where edit_distance_pct is not null), 1) as avg_edit_distance_pct,
    coalesce(sum(prompt_tokens), 0)::bigint                                       as total_prompt_tokens,
    coalesce(sum(completion_tokens), 0)::bigint                                   as total_completion_tokens,
    count(distinct drafted_by)::int                                               as unique_users,
    (select count(*) from cap_hits)::int                                          as cap_hit_users
  from windowed;
$$;

comment on function public.ai_drafting_summary is
  'Headline stats for the AI Drafting Insights dashboard. Window in days. security_invoker preserves RLS.';

-- ─── Per-clause breakdown RPC ───────────────────────────────────────
create or replace function public.ai_drafting_by_clause(
  p_window_days integer default 30,
  p_min_drafts  integer default 3
)
returns table (
  clause                text,
  quality_area          text,
  total_drafts          integer,
  acceptance_rate_pct   numeric,
  avg_edit_distance_pct numeric,
  rejection_rate_pct    numeric,
  low_confidence_pct    numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    v.clause,
    v.quality_area,
    count(*)::int                                                                 as total_drafts,
    case when count(*) filter (where v.decision is not null) = 0 then null
         else round(100.0 * count(*) filter (where v.decision in ('accepted','edited'))
                          / count(*) filter (where v.decision is not null), 1)
    end                                                                           as acceptance_rate_pct,
    round(avg(v.edit_distance_pct) filter (where v.edit_distance_pct is not null), 1) as avg_edit_distance_pct,
    case when count(*) filter (where v.decision is not null) = 0 then null
         else round(100.0 * count(*) filter (where v.decision = 'rejected')
                          / count(*) filter (where v.decision is not null), 1)
    end                                                                           as rejection_rate_pct,
    round(100.0 * count(*) filter (where v.confidence in ('medium','low')) / count(*), 1) as low_confidence_pct
  from public.v_ai_finding_draft_outcomes v
  where v.drafted_at >= now() - make_interval(days => p_window_days)
    and v.clause is not null
  group by v.clause, v.quality_area
  having count(*) >= p_min_drafts
  order by count(*) desc;
$$;

comment on function public.ai_drafting_by_clause is
  'Per-clause draft outcomes for the Patterns panel. Filters to clauses with at least p_min_drafts to avoid noise.';