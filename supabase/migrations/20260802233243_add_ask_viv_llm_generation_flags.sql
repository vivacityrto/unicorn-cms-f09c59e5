-- Phase 3 of the Ask Viv redesign: flag-gate real LLM generation so it can be
-- flipped off instantly without a deploy, with a staged rollout (Super Admin
-- always once the master flag is on -> named beta users -> everyone).
alter table public.app_settings
  add column if not exists ask_viv_llm_generation_enabled boolean not null default false,
  add column if not exists ask_viv_llm_generation_beta_user_ids uuid[] not null default '{}'::uuid[],
  add column if not exists ask_viv_llm_generation_all_staff boolean not null default false;

comment on column public.app_settings.ask_viv_llm_generation_enabled is
  'Master kill switch for Ask Viv Compliance-mode real LLM generation (Phase 3). When false, compliance-assistant always uses the deterministic template path regardless of role.';
comment on column public.app_settings.ask_viv_llm_generation_beta_user_ids is
  'Specific users.user_uuid values granted LLM generation during the beta rollout ring, independent of ask_viv_llm_generation_all_staff.';
comment on column public.app_settings.ask_viv_llm_generation_all_staff is
  'Final rollout ring: when true (and the master flag is also true), all Vivacity staff get LLM generation, not just Super Admin and beta_user_ids.';
