-- Ask Viv Assistant Phase I — full rollout. The topbar's "Ask Viv" entry
-- point (AskVivButton.tsx) now opens the new Assistant instead of the
-- original compliance-assistant panel, so the assistant needs to actually
-- be live for everyone the topbar button is visible to, not just gated
-- behind manual testing toggles.
update public.app_settings
  set ask_viv_assistant_enabled = true,
      ask_viv_assistant_all_staff = true;
