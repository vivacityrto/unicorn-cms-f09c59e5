
-- Add registration governance fields to tga_rto_summary
alter table public.tga_rto_summary
  add column if not exists registration_manager text null,
  add column if not exists legal_authority text null,
  add column if not exists exerciser text null;
