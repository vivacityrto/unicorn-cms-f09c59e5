import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('supabase/migrations/20261120120000_restrict_conversation_access_to_participants.sql', 'utf8').replace(/--[^\n]*/g, '');

/** The statement that creates one policy, so a check is about one policy only. */
const policy = (name: string) => {
  const start = sql.indexOf(`create policy ${name} on`);
  expect(start, `missing policy ${name}`).toBeGreaterThan(-1);
  const end = sql.indexOf('create policy', start + 10);
  return sql.slice(start, end === -1 ? undefined : end);
};

describe('conversation access is for the people in a conversation and Vivacity staff', () => {
  it('first drops every existing policy on both tables, whatever it was called', () => {
    const sweep = sql.slice(sql.indexOf('do $$'), sql.indexOf('create policy'));
    expect(sweep).toContain('pg_policies');
    expect(sweep).toContain("tablename in ('tenant_conversations', 'conversation_participants')");
    expect(sweep).toContain('drop policy if exists %I on %I.%I');
  });

  it('recreates exactly four policies on each table, all for signed-in users only', () => {
    const created = sql.split('create policy').slice(1);
    expect(created).toHaveLength(8);
    for (const p of created) expect(p).toContain('to authenticated');
    for (const n of ['tc_select', 'tc_insert_auth', 'tc_update_auth', 'tc_delete_staff', 'cp_select_member', 'cp_insert_auth', 'cp_update_own', 'cp_delete_admin']) {
      expect(policy(n)).toBeTruthy();
    }
  });

  it('lets a member read a conversation only if they started it or are in it', () => {
    const p = policy('tc_select');
    expect(p).toContain('created_by_user_uuid = (select auth.uid())');
    expect(p).toContain('is_conversation_participant_safe(id, (select auth.uid()))');
    expect(p).toContain('is_vivacity_team_safe');
  });

  it('judges who may start a conversation by the canonical membership gate, not the legacy tenant_users table (ADR-019)', () => {
    const p = policy('tc_insert_auth');
    expect(p).toContain('has_tenant_access_safe(tenant_id, (select auth.uid()))');
    expect(p).toContain('created_by_user_uuid = (select auth.uid())');
    expect(p).not.toContain('tenant_users');
    expect(sql).not.toContain('tenant_users');
  });

  it('lets only staff change a conversation', () => {
    const p = policy('tc_update_auth');
    expect(p).toContain('is_vivacity_team_safe');
    expect(p).not.toContain('tenant_users');
    expect(p).not.toContain('has_tenant_access');
  });

  it('lets a member add participants only to a conversation they created, and only people with access to that organisation', () => {
    const p = policy('cp_insert_auth');
    expect(p).toContain('tc.created_by_user_uuid = (select auth.uid())');
    expect(p).toContain('has_tenant_access_safe(tc.tenant_id, conversation_participants.user_id)');
    expect(p).not.toContain('tenant_users');
  });

  it('keeps a member able to mark their own read position', () => {
    const p = policy('cp_update_own');
    expect(p).toContain('user_id = (select auth.uid())');
  });
});
