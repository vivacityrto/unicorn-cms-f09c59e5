-- Ask Viv Client Assistant — token-based daily usage cap.
--
-- The existing ai_client_query_usage cap (20 requests/day, ported from
-- compliance-assistant-client) bounds request COUNT, not cost. That was
-- fine for the deterministic function it came from (one cheap Gemini call
-- + optional embed per request, ~constant cost), but ask-viv-assistant-client
-- is agentic — each request can loop up to 6 tool-use round trips against
-- Claude Sonnet, so cost per request varies a lot more. Mirrors the staff
-- ask-viv-assistant's ask_viv_assistant_usage/ask_viv_assistant_daily_token_cap
-- pattern (20260803040606_ask_viv_assistant_foundation.sql) so both surfaces
-- are protected against a runaway tool-use loop the same way, on top of
-- (not instead of) the existing request-count cap.

create table public.ask_viv_client_assistant_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  usage_date date not null default current_date,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  request_count int not null default 0,
  updated_at timestamptz not null default now(),
  unique (user_id, usage_date)
);

alter table public.ask_viv_client_assistant_usage enable row level security;

create policy ask_viv_client_assistant_usage_select_own on public.ask_viv_client_assistant_usage
  for select to authenticated using (user_id = auth.uid());
-- No insert/update/delete policies for authenticated users — written
-- service-role only, from the edge function after each real Anthropic call,
-- matching the staff table's precedent exactly.

comment on table public.ask_viv_client_assistant_usage is
  'Per-user daily token usage for the client-portal Ask Viv assistant — the cost-based cap, distinct from ai_client_query_usage''s request-count cap. Mirrors the staff ask_viv_assistant_usage table.';

alter table public.app_settings
  add column if not exists ask_viv_client_assistant_daily_token_cap bigint not null default 50000;

comment on column public.app_settings.ask_viv_client_assistant_daily_token_cap is
  'Per-user daily total (input+output) token cap for the client-portal Ask Viv assistant, adjustable without a deploy. Lower than the staff assistant''s 500000 default — client questions are narrower in scope. Exceeding it returns a graceful limit-reached message instead of calling Anthropic.';
