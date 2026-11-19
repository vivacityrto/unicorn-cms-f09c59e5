import { beforeEach, describe, expect, it, vi } from 'vitest';

type Call = { table: string; op: string; payload?: unknown };
const db = vi.hoisted(() => ({
  calls: [] as Array<{ table: string; op: string; payload?: unknown }>,
  tenantUsers: [{ user_id: 'u1' }, { user_id: 'u2' }] as Array<{ user_id: string }>,
  failParticipant: new Set<string>(),
  failBatch: false,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      const b: Record<string, unknown> = {};
      let op = 'select';
      let payload: unknown;
      const result = () => {
        db.calls.push({ table, op, payload });
        if (table === 'tenant_conversations') return { data: { id: 'conv1' }, error: null };
        if (table === 'tenant_messages') return { data: { id: 'msg1' }, error: null };
        if (table === 'tenant_users') return { data: db.tenantUsers, error: null };
        if (table === 'conversation_participants' && op === 'upsert') {
          const rows = Array.isArray(payload) ? payload : [payload];
          const isBatch = Array.isArray(payload) && rows.length > 1;
          if (isBatch && db.failBatch) return { data: null, error: { message: 'fk violation' } };
          const bad = rows.some((r) => db.failParticipant.has((r as { user_id: string }).user_id));
          return { data: null, error: bad ? { message: 'fk violation' } : null };
        }
        return { data: null, error: null };
      };
      b.insert = (p: unknown) => { op = 'insert'; payload = p; return b; };
      b.upsert = (p: unknown) => { op = 'upsert'; payload = p; return Promise.resolve(result()); };
      b.select = () => b;
      b.eq = () => (table === 'tenant_users' ? Promise.resolve(result()) : b);
      b.single = () => Promise.resolve(result());
      return b;
    },
  },
}));

import { createStaffConversation } from './createStaffConversation';

const base = { tenantId: 7, subject: ' Hello ', category: 'general', body: 'Hi there', staffId: 'staff1' };
const participantRows = () =>
  (db.calls as Call[]).filter((c) => c.table === 'conversation_participants').flatMap((c) => (Array.isArray(c.payload) ? c.payload : [c.payload])) as Array<{ user_id: string; role: string }>;

beforeEach(() => {
  db.calls = [];
  db.tenantUsers = [{ user_id: 'u1' }, { user_id: 'u2' }];
  db.failParticipant = new Set();
  db.failBatch = false;
});

describe('starting a conversation with a client, from staff', () => {
  it('to everyone at the client: the sender joins first, every user joins, then the message is sent', async () => {
    const out = await createStaffConversation({ ...base, recipientId: null });
    expect(out).toEqual({ id: 'conv1', messageId: 'msg1', skippedParticipants: 0 });
    expect(participantRows().map((r) => `${r.role}:${r.user_id}`)).toEqual(['staff:staff1', 'client:u1', 'client:u2']);
    const order = (db.calls as Call[]).map((c) => `${c.table}.${c.op}`);
    expect(order.indexOf('conversation_participants.upsert')).toBeLessThan(order.indexOf('tenant_messages.insert'));
    expect((db.calls as Call[]).find((c) => c.table === 'tenant_conversations')?.payload).toMatchObject({ tenant_id: 7, subject: 'Hello', type: 'general', created_by_user_uuid: 'staff1' });
  });

  it('to one person: only that person and the sender are added, and the client list is never read', async () => {
    await createStaffConversation({ ...base, recipientId: 'u2' });
    expect(participantRows().map((r) => `${r.role}:${r.user_id}`)).toEqual(['staff:staff1', 'client:u2']);
    expect((db.calls as Call[]).some((c) => c.table === 'tenant_users')).toBe(false);
  });

  it('one bad account only costs that person, and is counted so the sender is told', async () => {
    db.failBatch = true;
    db.failParticipant = new Set(['u2']);
    const out = await createStaffConversation({ ...base, recipientId: null });
    expect(out.skippedParticipants).toBe(1);
    expect(out.id).toBe('conv1');
  });

  it('refuses, and sends nothing, when the one person chosen cannot be added', async () => {
    db.failParticipant = new Set(['u2']);
    await expect(createStaffConversation({ ...base, recipientId: 'u2' })).rejects.toThrow(/no sign-in account/);
    expect((db.calls as Call[]).some((c) => c.table === 'tenant_messages')).toBe(false);
  });

  it('leaves the subject empty when none is given', async () => {
    await createStaffConversation({ ...base, subject: '   ', recipientId: null });
    expect((db.calls as Call[]).find((c) => c.table === 'tenant_conversations')?.payload).toMatchObject({ subject: null });
  });
});
