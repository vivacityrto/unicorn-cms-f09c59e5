## P1-b Batch A2 — RLS auth.uid() Subquery Optimization

Mechanical performance-only migration. Replaces bare `auth.uid()` with `(SELECT auth.uid())` in RLS policy USING/WITH CHECK expressions across `ai_*`, `app_settings`, `assistant_*`, `audit*`, and `auth_tokens`. No access-rule changes.

### Scope
~80 policies across 36 tables:
- `ai_client_query_usage` (2), `ai_event_payloads` (2), `ai_events` (2), `ai_evidence_analysis_usage` (2)
- `ai_feature_overrides` (5), `ai_feedback` (2), `ai_interaction_logs` (4)
- `ai_quality_events` (2), `ai_review_flags` (3), `ai_suggestions` (2)
- `app_settings` (2)
- `assistant_audit_log` (3), `assistant_messages` (3), `assistant_threads` (3)
- `audit` (4), `audit_action` (3), `audit_appointments` (2), `audit_ask_viv_access_denied` (1)
- `audit_avatars` (3), `audit_client_impersonation` (3), `audit_dashboard_events` (2)
- `audit_eos_events` (2), `audit_events` (2), `audit_finding` (3), `audit_gwc_trends` (4)
- `audit_inspection` (2), `audit_intelligence_packs` (2), `audit_invites` (3)
- `audit_log` (2), `audit_people_analyzer` (2), `audit_question` (2), `audit_question_bank` (2)
- `audit_response` (3), `audit_restricted_actions` (3), `audit_seat_health` (2)
- `audit_section` (2), `audit_succession_events` (2), `audit_template_questions` (2)
- `audit_template_response_sets` (3), `audit_templates` (2), `audit_upgrade_attempts` (3)
- `audit_user_events` (3), `auth_tokens` (3)

### Execution
Single migration applying the SQL exactly as supplied.
