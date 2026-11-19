import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('supabase/migrations/20261120130000_broadcast_recipients_use_active_members.sql', 'utf8').replace(/--[^\n]*/g, '');
const edge = readFileSync('supabase/functions/send-broadcast-campaign/index.ts', 'utf8');

describe('broadcast recipients are active members', () => {
  it('replaces only the recipient function, keeping its signature and access', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.fn_resolve_broadcast_recipients(p_target_mode text, p_package_type text, p_include_roles text[])');
    expect(sql).toContain('RETURNS TABLE(tenant_id bigint, user_id uuid, tenant_name text)');
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.fn_resolve_broadcast_recipients(text, text, text[]) FROM PUBLIC, anon, authenticated');
    expect(sql.match(/CREATE OR REPLACE FUNCTION/g)).toHaveLength(1);
    // Never a second overload: no DROP, no changed arity.
    expect(sql).not.toMatch(/DROP FUNCTION/i);
  });

  it('requires an active tenant_members row for every recipient', () => {
    expect(sql).toMatch(/EXISTS \(\s*SELECT 1 FROM public\.tenant_members tm\s*WHERE tm\.tenant_id = t\.id AND tm\.user_id = p\.user_id AND tm\.status = 'active'\s*\)/);
  });

  it('keeps targeting for people with a contact row and treats active members without one as ordinary users who can sign in', () => {
    expect(sql).toContain('p.role = ANY(p_include_roles)');
    expect(sql).toContain('p.relationship_role = ANY(p_include_roles)');
    expect(sql).toContain("p.access_scope = 'full'");
    expect(sql).toContain("'child', 'user', 'full'");
    expect(sql).toContain('EXISTS (SELECT 1 FROM auth.users a WHERE a.id = tm.user_id)');
  });

  it('keeps every audience mode and the one-organisation-per-person rule', () => {
    for (const mode of ["'everyone'", "'members'", "'superhero'", "'tier'", "'package_type'"]) expect(sql).toContain(`WHEN ${mode}`);
    expect(sql).toContain('DISTINCT ON (p.user_id)');
    expect(sql).toContain('t.id != 6372');
  });
});

describe('the immediate send adds recipients as participants, nobody else', () => {
  it('no longer mirrors every tenant_users row', () => {
    expect(edge).not.toMatch(/from\("tenant_users"\)/);
    expect(edge).toContain('const recipientUsers = Array.from(new Set(rows.map((r) => r.user_id)));');
    expect(edge).toContain('recipientUsers.map((userId) =>');
  });
});
