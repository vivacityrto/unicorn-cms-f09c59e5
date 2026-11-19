import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('supabase/migrations/20261120140000_staff_message_scope.sql', 'utf8').replace(/--[^\n]*/g, '');

describe('the staff message scope function', () => {
  it('asks the notification routing rather than copying its rules', () => {
    expect(sql).toContain("public.resolve_notification_recipients('client_message', t.id, NULL)");
    expect(sql).toContain('r.user_id = (SELECT auth.uid())');
    for (const copied of ['staff_notification_delegates', 'notification_client_overrides', 'notification_effective_pref']) expect(sql).not.toContain(copied);
  });

  it('only answers for Vivacity staff, active client organisations, never the Vivacity organisation', () => {
    expect(sql).toContain('public.is_vivacity_team_safe((SELECT auth.uid()))');
    expect(sql).toContain("t.status = 'active'");
    expect(sql).toContain('t.id != 6372');
  });

  it('is one read-only definer function with a pinned search path, runnable by signed-in users only', () => {
    expect(sql.match(/CREATE OR REPLACE FUNCTION/g)).toHaveLength(1);
    expect(sql).toContain('SECURITY DEFINER');
    expect(sql).toContain('STABLE');
    expect(sql).toContain("SET search_path TO ''");
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.get_my_message_scope() FROM PUBLIC, anon');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.get_my_message_scope() TO authenticated');
    expect(sql).not.toMatch(/\b(insert|update|delete)\b/i);
    expect(sql).not.toMatch(/DROP FUNCTION/i);
  });

  it('names the colleague being covered, only for a delegate', () => {
    expect(sql).toContain("CASE WHEN r.reason = 'delegate' THEN o.csc_user_id END AS covering_user_id");
    expect(sql).toContain("CASE WHEN r.reason = 'delegate' THEN NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), '') END AS covering_name");
  });
});
