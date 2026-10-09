import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => {
  const calls: Array<{ table: string; op: string; args: unknown[] }> = [];
  let result: { data?: unknown; error?: unknown } = { data: null, error: null };
  const chain = (table: string, op: string, args: unknown[]) => {
    calls.push({ table, op, args });
    const builder: Record<string, unknown> = {
      eq: (...a: unknown[]) => {
        calls.push({ table, op: 'eq', args: a });
        return builder;
      },
      select: (...a: unknown[]) => {
        calls.push({ table, op: 'select', args: a });
        return builder;
      },
      single: () => Promise.resolve(result),
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve),
    };
    return builder;
  };
  return {
    calls,
    setResult: (r: { data?: unknown; error?: unknown }) => (result = r),
    from: (table: string) => ({
      upsert: (...a: unknown[]) => chain(table, 'upsert', a),
      delete: (...a: unknown[]) => chain(table, 'delete', a),
      insert: (...a: unknown[]) => chain(table, 'insert', a),
    }),
  };
});

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: db.from } }));

import {
  addPeopleToGroup,
  createTenantContact,
  parseRowKey,
  removePersonFromGroup,
} from '../contactGroupsService';

describe('contactGroupsService', () => {
  beforeEach(() => {
    db.calls.length = 0;
    db.setResult({ data: null, error: null });
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('parses directory row keys', () => {
    expect(parseRowKey('user:12')).toEqual({ source: 'user', id: 12 });
    expect(parseRowKey('contact:5')).toEqual({ source: 'contact', id: 5 });
    for (const bad of ['', 'x:1', 'user:', 'user:0', 'user:abc', 'user']) expect(parseRowKey(bad)).toBeNull();
  });

  it('adds people with an upsert keyed on group + type + id', async () => {
    const result = await addPeopleToGroup(7, [
      { source: 'user', id: 1, tenantId: 10 },
      { source: 'contact', id: 2, tenantId: 11 },
    ]);
    expect(result).toEqual({ ok: true });
    const upsert = db.calls.find((c) => c.op === 'upsert')!;
    expect(upsert.table).toBe('tenant_contact_group_members');
    expect(upsert.args[0]).toEqual([
      { group_id: 7, member_type: 'user', member_id: '1', tenant_id: 10 },
      { group_id: 7, member_type: 'contact', member_id: '2', tenant_id: 11 },
    ]);
    expect(upsert.args[1]).toEqual({ onConflict: 'group_id,member_type,member_id' });
  });

  it('does nothing for an empty list and reports a failed add without throwing', async () => {
    expect(await addPeopleToGroup(7, [])).toEqual({ ok: true });
    expect(db.calls).toHaveLength(0);
    db.setResult({ error: { message: 'rls' } });
    const failed = await addPeopleToGroup(7, [{ source: 'user', id: 1, tenantId: 10 }]);
    expect(failed).toEqual({ ok: false, message: 'Could not add to the group.' });
  });

  it('removes exactly one member by group, type and id', async () => {
    expect(await removePersonFromGroup(7, 'contact', 5)).toEqual({ ok: true });
    const eqs = db.calls.filter((c) => c.op === 'eq').map((c) => c.args);
    expect(eqs).toEqual([['group_id', 7], ['member_type', 'contact'], ['member_id', '5']]);
    db.setResult({ error: { message: 'nope' } });
    expect((await removePersonFromGroup(7, 'user', 1)).ok).toBe(false);
  });

  it('creates a contact the same way the client contact list does', async () => {
    db.setResult({ data: { id: 42 }, error: null });
    const result = await createTenantContact({
      tenantId: 9,
      firstName: '  Ann ',
      lastName: ' Lee ',
      email: ' Ann@Lee.COM ',
      positionType: '',
    });
    expect(result).toEqual({ ok: true, id: 42 });
    const insert = db.calls.find((c) => c.op === 'insert')!;
    expect(insert.table).toBe('tenant_contacts');
    expect(insert.args[0]).toEqual({
      tenant_id: 9,
      first_name: 'Ann',
      last_name: 'Lee',
      email: 'ann@lee.com',
      position_type: null,
    });
  });

  it('reports a failed contact create', async () => {
    db.setResult({ data: null, error: { message: 'rls' } });
    const result = await createTenantContact({ tenantId: 9, firstName: 'A', lastName: 'B', email: 'a@b.co', positionType: null });
    expect(result).toEqual({ ok: false, message: 'Could not create the contact.' });
  });
});
