## P1-b Batch 12 (FINAL) — RLS auth.uid() Subquery Optimization

Mechanical performance-only migration. Replaces bare `auth.uid()` with `(SELECT auth.uid())` in RLS policy USING/WITH CHECK expressions. Final batch covering `user_*`, `users`, `vector_*`, `workflow_*`, and `workload_snapshots`. No access-rule changes.

### Scope
~57 policies across 18 tables:
- `user_activity` (6), `user_invitations` (3), `user_microsoft_identities` (7)
- `user_notification_integrations` (3), `user_notification_prefs` (3), `user_notifications` (4)
- `user_profile_setup_prompts` (3), `user_time_capture_settings` (5)
- `user_time_inbox_dismissals` (3), `user_ui_prefs` (3), `user_uuid_history` (2)
- `user_win_banner_state` (3), `users` (6)
- `vector_embeddings` (2), `vector_index_logs` (2)
- `workflow_optimisation_signals` (2), `workflow_performance_metrics` (1)
- `workload_snapshots` (2)

### Execution
Single migration applying the SQL exactly as supplied.
