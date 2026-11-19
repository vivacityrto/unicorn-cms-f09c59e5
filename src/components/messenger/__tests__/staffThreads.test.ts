import { describe, expect, it } from 'vitest';
import { buildStaffThreads, scopeBadge, type StaffConversationRow, type StaffScopeRow } from '../adapters/staffThreads';

const row = (over: Partial<StaffScopeRow>): StaffScopeRow => ({ tenant_id: 1, reason: 'primary_csc', covering_user_id: null, covering_name: null, ...over });
const conv = (over: Partial<StaffConversationRow>): StaffConversationRow => ({ id: 'c1', tenant_id: 1, subject: 'Package question', topic: 'package', type: 'package', last_message_at: '2026-11-19T01:00:00Z', last_message_preview: 'Thanks', created_at: '2026-11-18T00:00:00Z', ...over });

describe('why a thread is in my list', () => {
  it('shows no chip for my own clients', () => {
    expect(scopeBadge(row({ reason: 'primary_csc' }))).toBeUndefined();
    expect(scopeBadge(undefined)).toBeUndefined();
  });

  it('names the colleague I am covering for, by first name', () => {
    expect(scopeBadge(row({ reason: 'delegate', covering_name: 'Nova Canto' }))).toEqual({ label: 'Covering Nova', tone: 'info' });
    expect(scopeBadge(row({ reason: 'delegate', covering_name: null }))).toEqual({ label: 'Covering', tone: 'info' });
  });

  it('marks watched and unassigned clients', () => {
    expect(scopeBadge(row({ reason: 'watching' }))).toEqual({ label: 'Watching', tone: 'neutral' });
    expect(scopeBadge(row({ reason: 'unassigned' }))).toEqual({ label: 'Unassigned', tone: 'warning' });
  });
});

describe('staff threads', () => {
  const scope = new Map([[1, row({ reason: 'delegate', covering_name: 'Nova Canto' })]]);
  const names = new Map([[1, 'Acme Training'], [2, 'Other RTO']]);

  it('leads with the organisation, carries its id and says why it is mine', () => {
    const [t] = buildStaffThreads({ conversations: [conv({})], scope, tenantNames: names, unreadConversationIds: new Set(), myReadAt: new Map() });
    expect(t).toMatchObject({ id: 'c1', title: 'Acme Training · Package question', tenantId: 1, kind: 'package', badge: { label: 'Covering Nova' } });
  });

  it('is unread only when it is mine and the routing sent me an unread message notification for it', () => {
    const unread = new Set(['c1', 'c2']);
    const threads = buildStaffThreads({ conversations: [conv({ id: 'c1' }), conv({ id: 'c2', tenant_id: 2 }), conv({ id: 'c3' })], scope, tenantNames: names, unreadConversationIds: unread, myReadAt: new Map() });
    expect(threads.map((t) => [t.id, t.unread])).toEqual([['c1', true], ['c2', false], ['c3', false]]);
  });

  it('records when the oldest unread message arrived, only for a conversation that is unread for me', () => {
    const since = new Map([['c1', '2026-11-16T09:00:00Z'], ['c2', '2026-11-16T10:00:00Z']]);
    const threads = buildStaffThreads({ conversations: [conv({ id: 'c1' }), conv({ id: 'c2', tenant_id: 2 })], scope, tenantNames: names, unreadConversationIds: new Set(['c1', 'c2']), myReadAt: new Map(), unreadSince: since });
    expect(threads.map((t) => [t.id, t.unread, t.unreadSince])).toEqual([['c1', true, '2026-11-16T09:00:00Z'], ['c2', false, null]]);
  });

  it('shows a conversation outside my scope without a chip, and never as unread', () => {
    const [t] = buildStaffThreads({ conversations: [conv({ tenant_id: 2 })], scope, tenantNames: names, unreadConversationIds: new Set(['c1']), myReadAt: new Map() });
    expect(t.badge).toBeUndefined();
    expect(t.unread).toBe(false);
    expect(t.title).toBe('Other RTO · Package question');
  });

  it('carries where I had read up to, and copes with a missing name or subject', () => {
    const [t] = buildStaffThreads({ conversations: [conv({ subject: null, topic: null, type: null, tenant_id: 9 })], scope, tenantNames: names, unreadConversationIds: new Set(), myReadAt: new Map([['c1', '2026-11-19T00:00:00Z']]) });
    expect(t).toMatchObject({ title: 'Client 9 · General', kind: 'general', myLastReadAt: '2026-11-19T00:00:00Z' });
  });
});
