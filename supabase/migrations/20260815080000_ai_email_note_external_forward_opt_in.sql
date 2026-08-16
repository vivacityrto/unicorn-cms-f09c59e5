-- Email bodies forwarded to an external AI provider (Lovable AI Gateway /
-- Google Gemini) are not covered by the client's existing privacy terms.
-- Gate that transfer behind an explicit opt-in, default OFF.
--
-- Write-path sweep before adding the column:
--   Frontend: src/ .from('app_settings') only UPDATEs named AI flag columns
--   (AdminAiFeatureFlags) or other existing settings; no INSERT lists every
--   column. Adding a DEFAULTed boolean cannot fail those writes.
--   Database: no public function INSERTs into app_settings. create_tenant
--   inserts tenants, not app_settings. validate_ai_feature_override is a
--   trigger on ai_feature_overrides (body-only replace below; same signature).
--   Triggers on app_settings: none that insert without a defaulted column.

ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS ai_email_note_external_forward_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.app_settings.ai_email_note_external_forward_enabled IS
  'Global default for forwarding email bodies to an external AI endpoint (generate-email-note). Off unless a tenant override enables it. Not covered by standard client privacy terms.';

CREATE OR REPLACE FUNCTION public.validate_ai_feature_override()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.flag_name NOT IN (
    'ai_meeting_summary_enabled',
    'ai_doc_extract_enabled',
    'ai_phase_check_enabled',
    'ai_risk_radar_enabled',
    'ai_email_note_external_forward_enabled'
  ) THEN
    RAISE EXCEPTION 'Invalid flag_name: %. Must be one of: ai_meeting_summary_enabled, ai_doc_extract_enabled, ai_phase_check_enabled, ai_risk_radar_enabled, ai_email_note_external_forward_enabled', NEW.flag_name;
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;
