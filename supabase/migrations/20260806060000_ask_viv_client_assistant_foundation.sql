-- Ask Viv Client Assistant — foundation schema.
--
-- New sibling surface to the staff ask-viv-assistant (see
-- docs/audit-log/entries/2026-08-06-ask-viv-client-assistant.md for the
-- full decision record). Gives tenant-locked client-portal users their own
-- conversation history, distinct from the staff ask_viv_conversations/
-- ask_viv_turns tables, because those are written service-role-only (no
-- INSERT policy for authenticated users at all) and carry no tenant_id
-- enforcement on write — the wrong shape to hand a client's own JWT-scoped
-- client write access to. tenant_id is NOT NULL here (staff's is nullable,
-- since staff conversations aren't always about one client).
--
-- RLS here follows a user-owned variant of the three-step ritual in
-- docs/kb/pinned/conventions.md: instead of "every tenant member can see
-- every row for their tenant" (the ritual's usual shape, for shared
-- tenant data), a conversation is a private thread — visible/writable only
-- to the user who started it — plus the same is_vivacity_team_safe() staff
-- escape hatch used elsewhere for QA/audit. RLS is explicitly enabled on
-- both tables.

create table if not exists public.ask_viv_client_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ask_viv_client_conversations_user_id
  on public.ask_viv_client_conversations (user_id, updated_at desc);

create index if not exists idx_ask_viv_client_conversations_tenant_id
  on public.ask_viv_client_conversations (tenant_id);

alter table public.ask_viv_client_conversations enable row level security;

create policy "Client users can view their own conversations"
  on public.ask_viv_client_conversations for select
  using (user_id = auth.uid());

create policy "Client users can start conversations for their own tenant"
  on public.ask_viv_client_conversations for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.tenant_members tm
      where tm.user_id = auth.uid()
        and tm.tenant_id = ask_viv_client_conversations.tenant_id
        and tm.status = 'active'
    )
  );

create policy "Client users can update their own conversations"
  on public.ask_viv_client_conversations for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Client users can delete their own conversations"
  on public.ask_viv_client_conversations for delete
  using (user_id = auth.uid());

create policy "Vivacity staff can manage all client conversations"
  on public.ask_viv_client_conversations for all
  using (is_vivacity_team_safe(auth.uid()))
  with check (is_vivacity_team_safe(auth.uid()));

create table if not exists public.ask_viv_client_turns (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ask_viv_client_conversations(id) on delete cascade,
  role text not null,
  content text not null,
  tool_calls_summary jsonb,
  created_at timestamptz not null default now(),
  constraint ask_viv_client_turns_role_check check (role in ('user', 'assistant'))
);

create index if not exists idx_ask_viv_client_turns_conversation_id
  on public.ask_viv_client_turns (conversation_id, created_at asc);

alter table public.ask_viv_client_turns enable row level security;

create policy "Client users can view turns in their own conversations"
  on public.ask_viv_client_turns for select
  using (
    exists (
      select 1 from public.ask_viv_client_conversations c
      where c.id = ask_viv_client_turns.conversation_id
        and c.user_id = auth.uid()
    )
  );

create policy "Client users can add turns to their own conversations"
  on public.ask_viv_client_turns for insert
  with check (
    exists (
      select 1 from public.ask_viv_client_conversations c
      where c.id = ask_viv_client_turns.conversation_id
        and c.user_id = auth.uid()
    )
  );

create policy "Vivacity staff can manage all client turns"
  on public.ask_viv_client_turns for all
  using (is_vivacity_team_safe(auth.uid()))
  with check (is_vivacity_team_safe(auth.uid()));

comment on table public.ask_viv_client_conversations is
  'Ask Viv client-portal conversation history — tenant-locked, one thread per client-portal user. Distinct from the staff ask_viv_conversations table (nullable tenant_id, service-role-only writes) — this table is written directly by the RLS-scoped client, so tenant_id is mandatory and enforced on insert.';
comment on table public.ask_viv_client_turns is
  'Individual user/assistant turns within an ask_viv_client_conversations thread. Also the audit trail for what the client-portal Ask Viv assistant was asked and answered — Vivacity staff can read all rows via is_vivacity_team_safe(auth.uid()) for QA.';

-- Rollout flags for the client-portal assistant, mirroring the staff
-- ask_viv_assistant_* flags added in 20260803040606_ask_viv_assistant_foundation.sql
-- — a staged tenant rollout rather than a hard cutover for every client at
-- once, since this replaces the already-live compliance-assistant-client.
alter table public.app_settings
  add column if not exists ask_viv_client_assistant_enabled boolean not null default false,
  add column if not exists ask_viv_client_assistant_all_tenants boolean not null default false,
  add column if not exists ask_viv_client_assistant_beta_tenant_ids bigint[] not null default '{}'::bigint[];

comment on column public.app_settings.ask_viv_client_assistant_enabled is
  'Master kill switch for the client-portal Ask Viv assistant (ask-viv-assistant-client). False hides it entirely regardless of the other flags.';
comment on column public.app_settings.ask_viv_client_assistant_all_tenants is
  'When true, every client tenant sees the new assistant. When false, only tenants in ask_viv_client_assistant_beta_tenant_ids do.';
comment on column public.app_settings.ask_viv_client_assistant_beta_tenant_ids is
  'tenants.id values in the beta rollout ring for the client-portal Ask Viv assistant, used when ask_viv_client_assistant_all_tenants is false.';
