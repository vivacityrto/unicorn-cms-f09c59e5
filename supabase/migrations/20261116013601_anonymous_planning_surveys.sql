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
revoke all on public.eos_planning_campaigns, public.eos_planning_responses from public, anon, authenticated;
grant select on public.eos_planning_campaigns to service_role;
grant select, insert on public.eos_planning_responses to service_role;
-- RPC takes a campaign-row lock; service_role needs UPDATE for SELECT FOR UPDATE.
grant update on public.eos_planning_campaigns to service_role;

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
  insert into public.eos_planning_responses (campaign_id, idempotency_key, questionnaire_version, answers)
    values (p_campaign_id, p_idempotency_key, p_questionnaire_version, p_answers);
  return true;
end;
$$;
revoke all on function public.accept_anonymous_planning_response(uuid,text,text,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.accept_anonymous_planning_response(uuid,text,text,uuid,jsonb) to service_role;
-- No campaigns, keys, staff grants, notifications, or actual responses are seeded.
