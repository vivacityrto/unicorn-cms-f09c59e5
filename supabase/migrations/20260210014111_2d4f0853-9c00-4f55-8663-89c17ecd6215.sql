
create extension if not exists pgcrypto;

-- =========================================================
-- 1) Client portal sessions
-- =========================================================
create table if not exists public.client_portal_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id bigint not null,
  mode text not null check (mode in ('real','impersonation')),
  viewer_user_uuid uuid null,
  acting_user_uuid uuid not null,
  created_at timestamptz not null default now()
);

alter table public.client_portal_sessions
  drop constraint if exists client_portal_sessions_tenant_fk;
alter table public.client_portal_sessions
  add constraint client_portal_sessions_tenant_fk
  foreign key (tenant_id) references public.tenants(id) on delete cascade;

alter table public.client_portal_sessions
  drop constraint if exists client_portal_sessions_viewer_user_fk;
alter table public.client_portal_sessions
  add constraint client_portal_sessions_viewer_user_fk
  foreign key (viewer_user_uuid) references public.users(user_uuid) on delete set null;

alter table public.client_portal_sessions
  drop constraint if exists client_portal_sessions_acting_user_fk;
alter table public.client_portal_sessions
  add constraint client_portal_sessions_acting_user_fk
  foreign key (acting_user_uuid) references public.users(user_uuid) on delete restrict;

create index if not exists idx_client_portal_sessions_tenant_id on public.client_portal_sessions (tenant_id);
create index if not exists idx_client_portal_sessions_acting_user_uuid on public.client_portal_sessions (acting_user_uuid);
create index if not exists idx_client_portal_sessions_viewer_user_uuid on public.client_portal_sessions (viewer_user_uuid);
create index if not exists idx_client_portal_sessions_created_at on public.client_portal_sessions (created_at desc);

-- =========================================================
-- 2) Client documents
-- =========================================================
create table if not exists public.client_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id bigint not null,
  title text not null,
  description text null,
  storage_path text not null,
  filename text null,
  mime_type text null,
  file_size bigint null,
  direction text not null check (direction in ('to_client','from_client')),
  visibility text not null default 'tenant' check (visibility in ('tenant','internal')),
  uploaded_by_user_uuid uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.client_documents
  drop constraint if exists client_documents_tenant_fk;
alter table public.client_documents
  add constraint client_documents_tenant_fk
  foreign key (tenant_id) references public.tenants(id) on delete cascade;

alter table public.client_documents
  drop constraint if exists client_documents_uploaded_by_user_fk;
alter table public.client_documents
  add constraint client_documents_uploaded_by_user_fk
  foreign key (uploaded_by_user_uuid) references public.users(user_uuid) on delete restrict;

create index if not exists idx_client_documents_tenant_id_created_at on public.client_documents (tenant_id, created_at desc);
create index if not exists idx_client_documents_uploaded_by_user_uuid on public.client_documents (uploaded_by_user_uuid);
create index if not exists idx_client_documents_direction on public.client_documents (direction);
create index if not exists idx_client_documents_visibility on public.client_documents (visibility);

create table if not exists public.client_document_shares (
  id uuid primary key default gen_random_uuid(),
  client_document_id uuid not null,
  shared_with_user_uuid uuid not null,
  shared_by_user_uuid uuid not null,
  created_at timestamptz not null default now()
);

alter table public.client_document_shares
  drop constraint if exists client_document_shares_doc_fk;
alter table public.client_document_shares
  add constraint client_document_shares_doc_fk
  foreign key (client_document_id) references public.client_documents(id) on delete cascade;

alter table public.client_document_shares
  drop constraint if exists client_document_shares_shared_with_user_fk;
alter table public.client_document_shares
  add constraint client_document_shares_shared_with_user_fk
  foreign key (shared_with_user_uuid) references public.users(user_uuid) on delete cascade;

alter table public.client_document_shares
  drop constraint if exists client_document_shares_shared_by_user_fk;
alter table public.client_document_shares
  add constraint client_document_shares_shared_by_user_fk
  foreign key (shared_by_user_uuid) references public.users(user_uuid) on delete restrict;

create unique index if not exists uq_client_document_shares_doc_user on public.client_document_shares (client_document_id, shared_with_user_uuid);
create index if not exists idx_client_document_shares_shared_with_user_uuid on public.client_document_shares (shared_with_user_uuid);
create index if not exists idx_client_document_shares_doc_id on public.client_document_shares (client_document_id);

create table if not exists public.client_document_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id bigint not null,
  requested_by_user_uuid uuid not null,
  assigned_to_user_uuid uuid null,
  title text not null,
  details text null,
  status text not null default 'open' check (status in ('open','in_progress','fulfilled','closed','cancelled')),
  fulfilled_document_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.client_document_requests
  drop constraint if exists client_document_requests_tenant_fk;
alter table public.client_document_requests
  add constraint client_document_requests_tenant_fk
  foreign key (tenant_id) references public.tenants(id) on delete cascade;

alter table public.client_document_requests
  drop constraint if exists client_document_requests_requested_by_user_fk;
alter table public.client_document_requests
  add constraint client_document_requests_requested_by_user_fk
  foreign key (requested_by_user_uuid) references public.users(user_uuid) on delete restrict;

alter table public.client_document_requests
  drop constraint if exists client_document_requests_assigned_to_user_fk;
alter table public.client_document_requests
  add constraint client_document_requests_assigned_to_user_fk
  foreign key (assigned_to_user_uuid) references public.users(user_uuid) on delete set null;

alter table public.client_document_requests
  drop constraint if exists client_document_requests_fulfilled_doc_fk;
alter table public.client_document_requests
  add constraint client_document_requests_fulfilled_doc_fk
  foreign key (fulfilled_document_id) references public.client_documents(id) on delete set null;

create index if not exists idx_client_document_requests_tenant_id_status on public.client_document_requests (tenant_id, status);
create index if not exists idx_client_document_requests_assigned_to_user_uuid on public.client_document_requests (assigned_to_user_uuid);
create index if not exists idx_client_document_requests_created_at on public.client_document_requests (created_at desc);

-- =========================================================
-- 3) Tenant conversations + messages
-- =========================================================
create table if not exists public.tenant_conversations (
  id uuid primary key default gen_random_uuid(),
  tenant_id bigint not null,
  topic text not null check (topic in ('support','csc','document_request','general','bot_escalation')),
  created_by_user_uuid uuid not null,
  assigned_to_user_uuid uuid null,
  status text not null default 'open' check (status in ('open','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tenant_conversations
  drop constraint if exists tenant_conversations_tenant_fk;
alter table public.tenant_conversations
  add constraint tenant_conversations_tenant_fk
  foreign key (tenant_id) references public.tenants(id) on delete cascade;

alter table public.tenant_conversations
  drop constraint if exists tenant_conversations_created_by_user_fk;
alter table public.tenant_conversations
  add constraint tenant_conversations_created_by_user_fk
  foreign key (created_by_user_uuid) references public.users(user_uuid) on delete restrict;

alter table public.tenant_conversations
  drop constraint if exists tenant_conversations_assigned_to_user_fk;
alter table public.tenant_conversations
  add constraint tenant_conversations_assigned_to_user_fk
  foreign key (assigned_to_user_uuid) references public.users(user_uuid) on delete set null;

create index if not exists idx_tenant_conversations_tenant_id_status on public.tenant_conversations (tenant_id, status);
create index if not exists idx_tenant_conversations_assigned_to_user_uuid on public.tenant_conversations (assigned_to_user_uuid);
create index if not exists idx_tenant_conversations_updated_at on public.tenant_conversations (updated_at desc);

create table if not exists public.tenant_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  tenant_id bigint not null,
  sender_user_uuid uuid not null,
  sender_type text not null check (sender_type in ('client','staff','system','bot')),
  body text not null,
  meta jsonb null,
  created_at timestamptz not null default now()
);

alter table public.tenant_messages
  drop constraint if exists tenant_messages_conversation_fk;
alter table public.tenant_messages
  add constraint tenant_messages_conversation_fk
  foreign key (conversation_id) references public.tenant_conversations(id) on delete cascade;

alter table public.tenant_messages
  drop constraint if exists tenant_messages_tenant_fk;
alter table public.tenant_messages
  add constraint tenant_messages_tenant_fk
  foreign key (tenant_id) references public.tenants(id) on delete cascade;

alter table public.tenant_messages
  drop constraint if exists tenant_messages_sender_user_fk;
alter table public.tenant_messages
  add constraint tenant_messages_sender_user_fk
  foreign key (sender_user_uuid) references public.users(user_uuid) on delete restrict;

create index if not exists idx_tenant_messages_tenant_id_created_at on public.tenant_messages (tenant_id, created_at desc);
create index if not exists idx_tenant_messages_conversation_id_created_at on public.tenant_messages (conversation_id, created_at asc);
create index if not exists idx_tenant_messages_sender_user_uuid on public.tenant_messages (sender_user_uuid);

create table if not exists public.tenant_message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null,
  storage_path text not null,
  filename text null,
  mime_type text null,
  file_size bigint null,
  created_at timestamptz not null default now()
);

alter table public.tenant_message_attachments
  drop constraint if exists tenant_message_attachments_message_fk;
alter table public.tenant_message_attachments
  add constraint tenant_message_attachments_message_fk
  foreign key (message_id) references public.tenant_messages(id) on delete cascade;

create index if not exists idx_tenant_message_attachments_message_id on public.tenant_message_attachments (message_id);

-- =========================================================
-- 4) Chatbot audit trail + escalation
-- =========================================================
create table if not exists public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id bigint not null,
  user_uuid uuid not null,
  context text not null check (context in ('client_portal','package','document','tga')),
  created_at timestamptz not null default now()
);

alter table public.chat_sessions
  drop constraint if exists chat_sessions_tenant_fk;
alter table public.chat_sessions
  add constraint chat_sessions_tenant_fk
  foreign key (tenant_id) references public.tenants(id) on delete cascade;

alter table public.chat_sessions
  drop constraint if exists chat_sessions_user_fk;
alter table public.chat_sessions
  add constraint chat_sessions_user_fk
  foreign key (user_uuid) references public.users(user_uuid) on delete cascade;

create index if not exists idx_chat_sessions_tenant_id_created_at on public.chat_sessions (tenant_id, created_at desc);
create index if not exists idx_chat_sessions_user_uuid_created_at on public.chat_sessions (user_uuid, created_at desc);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  tenant_id bigint not null,
  role text not null check (role in ('user','assistant','system')),
  content text not null,
  sources jsonb null,
  created_at timestamptz not null default now()
);

alter table public.chat_messages
  drop constraint if exists chat_messages_session_fk;
alter table public.chat_messages
  add constraint chat_messages_session_fk
  foreign key (session_id) references public.chat_sessions(id) on delete cascade;

alter table public.chat_messages
  drop constraint if exists chat_messages_tenant_fk;
alter table public.chat_messages
  add constraint chat_messages_tenant_fk
  foreign key (tenant_id) references public.tenants(id) on delete cascade;

create index if not exists idx_chat_messages_session_id_created_at on public.chat_messages (session_id, created_at asc);
create index if not exists idx_chat_messages_tenant_id_created_at on public.chat_messages (tenant_id, created_at desc);

create table if not exists public.chat_escalations (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  tenant_id bigint not null,
  conversation_id uuid null,
  reason text null,
  created_at timestamptz not null default now()
);

alter table public.chat_escalations
  drop constraint if exists chat_escalations_session_fk;
alter table public.chat_escalations
  add constraint chat_escalations_session_fk
  foreign key (session_id) references public.chat_sessions(id) on delete cascade;

alter table public.chat_escalations
  drop constraint if exists chat_escalations_tenant_fk;
alter table public.chat_escalations
  add constraint chat_escalations_tenant_fk
  foreign key (tenant_id) references public.tenants(id) on delete cascade;

alter table public.chat_escalations
  drop constraint if exists chat_escalations_conversation_fk;
alter table public.chat_escalations
  add constraint chat_escalations_conversation_fk
  foreign key (conversation_id) references public.tenant_conversations(id) on delete set null;

create index if not exists idx_chat_escalations_session_id on public.chat_escalations (session_id);
create index if not exists idx_chat_escalations_tenant_id_created_at on public.chat_escalations (tenant_id, created_at desc);

-- =========================================================
-- 5) TGA monitoring add-ons (flags + acknowledgements)
-- =========================================================
create table if not exists public.tga_rto_flags (
  id uuid primary key default gen_random_uuid(),
  tenant_id bigint not null,
  flag_type text not null check (flag_type in ('contact_mismatch','scope_change','address_change','high_risk','other')),
  severity text not null default 'low' check (severity in ('low','medium','high')),
  details text null,
  status text not null default 'open' check (status in ('open','acknowledged','resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tga_rto_flags
  drop constraint if exists tga_rto_flags_tenant_fk;
alter table public.tga_rto_flags
  add constraint tga_rto_flags_tenant_fk
  foreign key (tenant_id) references public.tenants(id) on delete cascade;

create index if not exists idx_tga_rto_flags_tenant_id_status on public.tga_rto_flags (tenant_id, status);
create index if not exists idx_tga_rto_flags_tenant_id_severity on public.tga_rto_flags (tenant_id, severity);
create index if not exists idx_tga_rto_flags_updated_at on public.tga_rto_flags (updated_at desc);

create table if not exists public.tga_rto_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  tenant_id bigint not null,
  snapshot_id uuid not null,
  ack_by_user_uuid uuid not null,
  ack_note text null,
  created_at timestamptz not null default now()
);

alter table public.tga_rto_acknowledgements
  drop constraint if exists tga_rto_acknowledgements_tenant_fk;
alter table public.tga_rto_acknowledgements
  add constraint tga_rto_acknowledgements_tenant_fk
  foreign key (tenant_id) references public.tenants(id) on delete cascade;

alter table public.tga_rto_acknowledgements
  drop constraint if exists tga_rto_acknowledgements_snapshot_fk;
alter table public.tga_rto_acknowledgements
  add constraint tga_rto_acknowledgements_snapshot_fk
  foreign key (snapshot_id) references public.tga_rto_snapshots(id) on delete cascade;

alter table public.tga_rto_acknowledgements
  drop constraint if exists tga_rto_acknowledgements_ack_by_user_fk;
alter table public.tga_rto_acknowledgements
  add constraint tga_rto_acknowledgements_ack_by_user_fk
  foreign key (ack_by_user_uuid) references public.users(user_uuid) on delete restrict;

create index if not exists idx_tga_rto_ack_tenant_id_created_at on public.tga_rto_acknowledgements (tenant_id, created_at desc);
create index if not exists idx_tga_rto_ack_snapshot_id on public.tga_rto_acknowledgements (snapshot_id);
