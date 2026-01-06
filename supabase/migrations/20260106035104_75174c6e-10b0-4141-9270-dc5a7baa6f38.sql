-- =====================================================
-- CONVERSATIONS TENANT LINKAGE
-- Add tenant_id and update RLS for tenant-scoped messaging
-- =====================================================

-- -----------------------------------------------------
-- 1. Add tenant_id column to conversations
-- -----------------------------------------------------
alter table public.conversations 
add column if not exists tenant_id bigint references public.tenants(id);

-- Create index for performance
create index if not exists idx_conversations_tenant_id on public.conversations(tenant_id);

-- -----------------------------------------------------
-- 2. Update conversations RLS policies
-- -----------------------------------------------------
alter table public.conversations enable row level security;
alter table public.conversations force row level security;

-- Drop existing policies
drop policy if exists "conversations_select_participant" on public.conversations;
drop policy if exists "conversations_insert_participant" on public.conversations;
drop policy if exists "conversations_update_participant" on public.conversations;
drop policy if exists "conversations_delete_participant" on public.conversations;
drop policy if exists "sa_all_conversations" on public.conversations;

-- SELECT: SuperAdmin sees all, tenant members see tenant conversations, participants see their DMs
create policy "conversations_select_access"
on public.conversations for select to authenticated
using (
  public.is_super_admin()
  or (tenant_id is not null and public.is_tenant_member(tenant_id))
  or exists (
    select 1 from public.conversation_participants cp
    where cp.conversation_id = conversations.id
    and cp.user_id = auth.uid()
  )
);

-- INSERT: SuperAdmin, tenant admins for tenant conversations, or users for DMs
create policy "conversations_insert_access"
on public.conversations for insert to authenticated
with check (
  public.is_super_admin()
  or (tenant_id is not null and public.is_tenant_admin(tenant_id))
  or tenant_id is null -- DMs don't require tenant admin
);

-- UPDATE: SuperAdmin, tenant admins, or participants
create policy "conversations_update_access"
on public.conversations for update to authenticated
using (
  public.is_super_admin()
  or (tenant_id is not null and public.is_tenant_admin(tenant_id))
  or exists (
    select 1 from public.conversation_participants cp
    where cp.conversation_id = conversations.id
    and cp.user_id = auth.uid()
  )
)
with check (
  public.is_super_admin()
  or (tenant_id is not null and public.is_tenant_admin(tenant_id))
  or exists (
    select 1 from public.conversation_participants cp
    where cp.conversation_id = conversations.id
    and cp.user_id = auth.uid()
  )
);

-- DELETE: SuperAdmin or tenant admins only
create policy "conversations_delete_access"
on public.conversations for delete to authenticated
using (
  public.is_super_admin()
  or (tenant_id is not null and public.is_tenant_admin(tenant_id))
);

-- -----------------------------------------------------
-- 3. Update messages RLS policies (inherit from conversation access)
-- -----------------------------------------------------
alter table public.messages enable row level security;
alter table public.messages force row level security;

-- Drop existing policies
drop policy if exists "messages_select_participant" on public.messages;
drop policy if exists "messages_insert_participant" on public.messages;
drop policy if exists "messages_update_own" on public.messages;
drop policy if exists "messages_delete_own" on public.messages;
drop policy if exists "sa_all_messages" on public.messages;

-- SELECT: Can see messages if can see the conversation
create policy "messages_select_access"
on public.messages for select to authenticated
using (
  public.is_super_admin()
  or exists (
    select 1 from public.conversations c
    where c.id = messages.conversation_id
    and (
      (c.tenant_id is not null and public.is_tenant_member(c.tenant_id))
      or exists (
        select 1 from public.conversation_participants cp
        where cp.conversation_id = c.id
        and cp.user_id = auth.uid()
      )
    )
  )
);

-- INSERT: Can send messages if participant or tenant member
create policy "messages_insert_access"
on public.messages for insert to authenticated
with check (
  public.is_super_admin()
  or exists (
    select 1 from public.conversations c
    where c.id = messages.conversation_id
    and (
      (c.tenant_id is not null and public.is_tenant_member(c.tenant_id))
      or exists (
        select 1 from public.conversation_participants cp
        where cp.conversation_id = c.id
        and cp.user_id = auth.uid()
      )
    )
  )
);

-- UPDATE: Own messages only
create policy "messages_update_own"
on public.messages for update to authenticated
using (sender_id = auth.uid())
with check (sender_id = auth.uid());

-- DELETE: SuperAdmin or own messages
create policy "messages_delete_access"
on public.messages for delete to authenticated
using (
  public.is_super_admin()
  or sender_id = auth.uid()
);

-- -----------------------------------------------------
-- 4. Update conversation_participants RLS
-- -----------------------------------------------------
alter table public.conversation_participants enable row level security;
alter table public.conversation_participants force row level security;

drop policy if exists "cp_select_participant" on public.conversation_participants;
drop policy if exists "cp_insert_participant" on public.conversation_participants;
drop policy if exists "cp_delete_participant" on public.conversation_participants;
drop policy if exists "sa_all_conversation_participants" on public.conversation_participants;

-- SELECT: Can see participants if can see the conversation
create policy "cp_select_access"
on public.conversation_participants for select to authenticated
using (
  public.is_super_admin()
  or exists (
    select 1 from public.conversations c
    where c.id = conversation_participants.conversation_id
    and (
      (c.tenant_id is not null and public.is_tenant_member(c.tenant_id))
      or exists (
        select 1 from public.conversation_participants cp2
        where cp2.conversation_id = c.id
        and cp2.user_id = auth.uid()
      )
    )
  )
);

-- INSERT: SuperAdmin, tenant admins, or existing participants
create policy "cp_insert_access"
on public.conversation_participants for insert to authenticated
with check (
  public.is_super_admin()
  or exists (
    select 1 from public.conversations c
    where c.id = conversation_participants.conversation_id
    and (
      (c.tenant_id is not null and public.is_tenant_admin(c.tenant_id))
      or exists (
        select 1 from public.conversation_participants cp2
        where cp2.conversation_id = c.id
        and cp2.user_id = auth.uid()
      )
    )
  )
);

-- DELETE: SuperAdmin, tenant admins, or self-remove
create policy "cp_delete_access"
on public.conversation_participants for delete to authenticated
using (
  public.is_super_admin()
  or user_id = auth.uid()
  or exists (
    select 1 from public.conversations c
    where c.id = conversation_participants.conversation_id
    and c.tenant_id is not null
    and public.is_tenant_admin(c.tenant_id)
  )
);