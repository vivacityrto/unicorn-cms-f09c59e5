-- DRAFT ONLY. Not applied. Requires QA, log/privacy review and release approval.
-- Never attach audit_eos_change(): it copies entire answers plus auth.uid().
create table public.eos_planning_campaigns (
  id uuid primary key default gen_random_uuid(),
  business text not null check (business in ('vivacity', 'complyhub')),
  year integer not null check (year between 2027 and 2100),
  questionnaire_version text not null check (length(questionnaire_version) between 1 and 100),
  state text not null default 'draft' check (state in ('draft', 'open', 'closed')),
  opens_at timestamptz not null,
  closes_at timestamptz not null,
  key_hash text not null check (key_hash ~ '^[0-9a-f]{64}$'),
  collection_approved boolean not null default false,
  minimum_responses integer check (minimum_responses between 2 and 1000),
  max_responses integer not null default 500 check (max_responses between 2 and 10000),
  check (opens_at < closes_at),
  check (minimum_responses is null or minimum_responses <= max_responses),
  unique (business, year, questionnaire_version)
);
create table public.eos_planning_responses (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.eos_planning_campaigns(id),
  idempotency_key uuid not null,
  questionnaire_version text not null,
  answers jsonb not null,
  unique (campaign_id, idempotency_key)
  -- Deliberately no user, email, role, IP, token or submission timestamp column.
);
alter table public.eos_planning_campaigns enable row level security;
alter table public.eos_planning_responses enable row level security;
revoke all on public.eos_planning_campaigns, public.eos_planning_responses from public, anon, authenticated, service_role;
grant select on public.eos_planning_campaigns to service_role;
grant select, insert on public.eos_planning_responses to service_role;
-- RPC takes a campaign-row lock; service_role needs UPDATE for SELECT FOR UPDATE.
grant update on public.eos_planning_campaigns to service_role;

-- Draft management boundary: no reviewers, grants or approved releases seeded.
alter table public.eos_planning_campaigns add column privacy_review_approved boolean not null default false;
alter table public.eos_planning_campaigns add column submissions_per_minute integer not null default 0 check (submissions_per_minute between 0 and 100);
create table public.eos_planning_reviewers (
  campaign_id uuid not null references public.eos_planning_campaigns(id),
  reviewer_user_id uuid not null,
  can_close boolean not null default false,
  can_review_raw boolean not null default false,
  primary key (campaign_id, reviewer_user_id)
);
create table public.eos_planning_admin_audit (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.eos_planning_campaigns(id),
  actor_user_id uuid not null,
  action text not null check (action in ('close','review')),
  occurred_at timestamptz not null default now()
  -- Admin events only: no answers, shared capabilities or ballot identifiers.
);
create table public.eos_planning_collection_budget (
  campaign_id uuid primary key references public.eos_planning_campaigns(id),
  minute_bucket timestamptz not null,
  accepted_count integer not null check (accepted_count >= 0)
  -- Aggregate current-minute counter; no IP, user, receipt or answer identifiers.
);
alter table public.eos_planning_reviewers enable row level security;
alter table public.eos_planning_admin_audit enable row level security;
alter table public.eos_planning_collection_budget enable row level security;
revoke all on public.eos_planning_reviewers, public.eos_planning_admin_audit, public.eos_planning_collection_budget from public, anon, authenticated, service_role;
grant select on public.eos_planning_reviewers to service_role;
grant insert on public.eos_planning_admin_audit to service_role;
grant select, insert, update on public.eos_planning_collection_budget to service_role;


create function public.accept_anonymous_planning_response(
  p_campaign_id uuid, p_key_hash text, p_questionnaire_version text,
  p_idempotency_key uuid, p_answers jsonb
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  campaign public.eos_planning_campaigns%rowtype;
  existing public.eos_planning_responses%rowtype;
  key text;
  expected text[] := array['strengths','weaknesses','opportunities','threats','start','stop','keep','priority'];
  nonempty boolean := false;
  bucket timestamptz := date_trunc('minute',clock_timestamp());
  used integer;
begin
  -- Capability is validated by the edge function; repeat its hash check here.
  -- Row lock serialises replay and maximum-count checks, not an atomicity claim
  -- based on application-side SELECT then INSERT.
  select * into campaign from public.eos_planning_campaigns where id = p_campaign_id for update;
  if not found or not campaign.collection_approved or campaign.key_hash is distinct from p_key_hash
    or campaign.questionnaire_version is distinct from p_questionnaire_version then return false; end if;
  if p_idempotency_key is null or p_idempotency_key::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or p_answers is null or jsonb_typeof(p_answers) <> 'object' then return false; end if;
  if (select count(*) from jsonb_object_keys(p_answers)) <> 8 then return false; end if;
  foreach key in array expected loop
    if not (p_answers ? key) or jsonb_typeof(p_answers->key) <> 'string'
      or length(p_answers->>key) > 3000 then return false; end if;
    if length(btrim(p_answers->>key)) > 0 then nonempty := true; end if;
  end loop;
  if not nonempty then return false; end if;
  select * into existing from public.eos_planning_responses
    where campaign_id = p_campaign_id and idempotency_key = p_idempotency_key;
  if found then
    return existing.questionnaire_version = p_questionnaire_version and existing.answers = p_answers;
  end if;
  -- Exact accepted replay remains confirmable after close; no new late ballots.
  if campaign.state <> 'open' or clock_timestamp() < campaign.opens_at or clock_timestamp() >= campaign.closes_at then return false; end if;
  if (select count(*) from public.eos_planning_responses where campaign_id = p_campaign_id) >= campaign.max_responses then return false; end if;
  if campaign.submissions_per_minute <= 0 then return false; end if;
  insert into public.eos_planning_collection_budget(campaign_id,minute_bucket,accepted_count)
    values(p_campaign_id,bucket,0) on conflict (campaign_id) do nothing;
  update public.eos_planning_collection_budget set minute_bucket=bucket,accepted_count=0
    where campaign_id=p_campaign_id and minute_bucket <> bucket;
  select accepted_count into used from public.eos_planning_collection_budget where campaign_id=p_campaign_id;
  if used >= campaign.submissions_per_minute then return false; end if;
  update public.eos_planning_collection_budget set accepted_count=accepted_count+1 where campaign_id=p_campaign_id;
  insert into public.eos_planning_responses (campaign_id, idempotency_key, questionnaire_version, answers)
    values (p_campaign_id, p_idempotency_key, p_questionnaire_version, p_answers);
  return true;
end;
$$;
revoke all on function public.accept_anonymous_planning_response(uuid,text,text,uuid,jsonb) from public, anon, authenticated, service_role;
grant execute on function public.accept_anonymous_planning_response(uuid,text,text,uuid,jsonb) to service_role;
-- No campaigns, keys, staff grants, notifications, or actual responses are seeded.

-- Edge must first verify eos.configurations.manage/full through requireCaller.
-- Membership/state/count/approval are then rechecked atomically in this RPC.
create function public.review_anonymous_planning_campaign(p_campaign_id uuid, p_actor_user_id uuid, p_action text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  c public.eos_planning_campaigns%rowtype;
  r public.eos_planning_reviewers%rowtype;
  n integer;
  k text;
  results jsonb := '{}'::jsonb;
begin
  if p_actor_user_id is null or p_action not in ('close','review') then return null; end if;
  select * into c from public.eos_planning_campaigns where id=p_campaign_id for update;
  if not found then return null; end if;
  select * into r from public.eos_planning_reviewers where campaign_id=p_campaign_id and reviewer_user_id=p_actor_user_id;
  if not found then return null; end if;
  if p_action='close' then
    if not r.can_close or c.state not in ('open','closed') then return null; end if;
    if c.state='open' then
      update public.eos_planning_campaigns set state='closed' where id=p_campaign_id;
      insert into public.eos_planning_admin_audit(campaign_id,actor_user_id,action) values(p_campaign_id,p_actor_user_id,'close');
    end if;
    return jsonb_build_object('closed',true);
  end if;
  if not r.can_review_raw or c.state <> 'closed' or not c.privacy_review_approved or c.minimum_responses is null then return null; end if;
  select count(*) into n from public.eos_planning_responses where campaign_id=p_campaign_id;
  if n < c.minimum_responses then return null; end if;
  foreach k in array array['strengths','weaknesses','opportunities','threats','start','stop','keep','priority'] loop
    -- Independently shuffled per question: no cross-question respondent grouping.
    -- Suppress sparse questions too. This is still ballots, never verified people.
    if (select count(*) from public.eos_planning_responses where campaign_id=p_campaign_id and length(btrim(answers->>k))>0) < c.minimum_responses then
      results := results || jsonb_build_object(k, '[]'::jsonb);
    else
      results := results || jsonb_build_object(k, coalesce((select jsonb_agg(answers->>k order by random()) from public.eos_planning_responses where campaign_id=p_campaign_id and length(btrim(answers->>k))>0), '[]'::jsonb));
    end if;
  end loop;
  insert into public.eos_planning_admin_audit(campaign_id,actor_user_id,action) values(p_campaign_id,p_actor_user_id,'review');
  return jsonb_build_object('campaignId',c.id,'business',c.business,'year',c.year,'responseCount',n,'answersByQuestion',results);
end;
$$;
revoke all on function public.review_anonymous_planning_campaign(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.review_anonymous_planning_campaign(uuid,uuid,text) to service_role;
