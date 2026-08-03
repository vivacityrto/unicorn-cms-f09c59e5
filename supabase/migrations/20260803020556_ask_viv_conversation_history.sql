-- Phase 5 of the Ask Viv redesign: conversation history, kept deliberately
-- separate from assistant_threads/assistant_messages (whose RLS requires
-- is_super_admin and whose shape is a poor fit for compliance turns, which
-- carry scope_lock/confidence/records_accessed that knowledge turns don't).
--
-- The audit trail (ai_interaction_logs) is append-only and permanent; a
-- conversation is a working note the CSC can delete. Deleting a conversation
-- nullifies ai_interaction_logs.conversation_id rather than touching the
-- audit row itself.
create table if not exists public.ask_viv_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  tenant_id bigint,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ask_viv_conversations_user_id
  on public.ask_viv_conversations (user_id, updated_at desc);

alter table public.ask_viv_conversations enable row level security;

create policy "Users can view their own Ask Viv conversations"
  on public.ask_viv_conversations for select
  using (user_id = auth.uid());

create policy "Users can delete their own Ask Viv conversations"
  on public.ask_viv_conversations for delete
  using (user_id = auth.uid());

-- No insert/update policies for authenticated users — conversations and
-- turns are written service-role-only from the edge function, consistent
-- with compliance mode never trusting the browser to author scope.

create table if not exists public.ask_viv_turns (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ask_viv_conversations(id) on delete cascade,
  role text not null,
  content text not null,
  mode text,
  created_at timestamptz not null default now(),
  constraint ask_viv_turns_role_check check (role in ('user', 'assistant'))
);

create index if not exists idx_ask_viv_turns_conversation_id
  on public.ask_viv_turns (conversation_id, created_at asc);

alter table public.ask_viv_turns enable row level security;

create policy "Users can view turns in their own Ask Viv conversations"
  on public.ask_viv_turns for select
  using (
    exists (
      select 1 from public.ask_viv_conversations c
      where c.id = ask_viv_turns.conversation_id
        and c.user_id = auth.uid()
    )
  );

alter table public.ai_interaction_logs
  add column if not exists conversation_id uuid references public.ask_viv_conversations(id) on delete set null;

comment on table public.ask_viv_conversations is
  'Ask Viv conversation history — a working note the user can delete. Distinct from ai_interaction_logs, which is the permanent, append-only audit trail.';
comment on table public.ask_viv_turns is
  'Individual user/assistant turns within an ask_viv_conversations thread.';
comment on column public.ai_interaction_logs.conversation_id is
  'Links this audit row to the conversation it was part of, if any. Nullified (not blocked) if the conversation is later deleted.';
