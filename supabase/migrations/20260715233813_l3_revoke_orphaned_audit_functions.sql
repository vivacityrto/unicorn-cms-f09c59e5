
-- L3 (16 Jul 2026 Unicorn security audit addendum): audit-workflow cluster,
-- REVOKE-only set. Confirmed via Cursor's caller search + direct source review:
-- these five functions have either zero real callers, or their only real caller
-- (fn_audit_strategic_orchestration, via strategic-orchestration) uses the
-- service role, which is unaffected by revoking authenticated/anon EXECUTE.
--
-- audit_send_24hr_confirmation is the highest-urgency of the set: it fires a
-- real outbound client email (net.http_post -> send-automated-email) with no
-- caller check at all -- any authenticated user could trigger repeated real
-- emails to clients about tomorrow's audit appointments.
-- audit_flag_overdue_chcs: inserts notification_schedule rows, idempotent
-- (ON CONFLICT DO NOTHING) but still an unauthorized-trigger surface.
-- fn_audit_playbook / fn_audit_risk_command / fn_audit_strategic_orchestration:
-- all insert arbitrary, caller-supplied-actor rows into audit_events with zero
-- validation -- audit-log forgery risk (any authenticated user could attribute
-- a fabricated action to any user_id).

revoke execute on function public.audit_flag_overdue_chcs() from authenticated, anon;
revoke execute on function public.audit_send_24hr_confirmation() from authenticated, anon;
revoke execute on function public.fn_audit_playbook(uuid, bigint, uuid, text, jsonb) from authenticated, anon;
revoke execute on function public.fn_audit_risk_command(uuid, bigint, uuid, text, jsonb) from authenticated, anon;
revoke execute on function public.fn_audit_strategic_orchestration(uuid, uuid, text, jsonb) from authenticated, anon;

NOTIFY pgrst, 'reload schema';
