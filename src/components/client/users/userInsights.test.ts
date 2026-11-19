import { describe, expect, it } from 'vitest';
import type { ClientTenantUserRow } from '@/features/client-identity/models';
import { daysSinceSeen, isQuiet, matchesUserFilter, summariseUsers } from './userInsights';

const today = new Date('2026-11-19T00:00:00Z');
let n = 0;
const row = (over: Partial<ClientTenantUserRow> = {}): ClientTenantUserRow => ({
  row_type: 'active', row_key: `k${++n}`, tenant_id: 1, user_id: `u${n}`, first_name: 'A', last_name: 'B', display_name: 'A B', email: `a${n}@x.test`, avatar_url: null,
  relationship_role: 'user', primary_contact: null, secondary_contact: null, access_scope: null, last_sign_in_at: null, last_active_at: null,
  invited_at: null, invite_expires_at: null, status: 'active', member_since: null, last_sent_at: null, mailgun_message_id: null, ...over,
});

describe('user insights', () => {
  it('works out how long since someone was seen, preferring last activity over sign-in', () => {
    expect(daysSinceSeen(row({ last_active_at: '2026-11-16T00:00:00Z', last_sign_in_at: '2026-01-01T00:00:00Z' }), today)).toBe(3);
    expect(daysSinceSeen(row({ last_sign_in_at: '2026-11-09T00:00:00Z' }), today)).toBe(10);
    expect(daysSinceSeen(row(), today)).toBeNull();
    expect(daysSinceSeen(row({ last_active_at: 'nonsense' }), today)).toBeNull();
  });

  it('calls active people quiet after 30 days or never, and never calls invites quiet', () => {
    expect(isQuiet(row({ last_active_at: '2026-11-18T00:00:00Z' }), today)).toBe(false);
    expect(isQuiet(row({ last_active_at: '2026-10-01T00:00:00Z' }), today)).toBe(true);
    expect(isQuiet(row(), today)).toBe(true);
    expect(isQuiet(row({ row_type: 'invited' }), today)).toBe(false);
  });

  it('filters rows by card', () => {
    const rows = [row({ last_active_at: '2026-11-18T00:00:00Z' }), row(), row({ row_type: 'invited', user_id: null })];
    const pick = (f: Parameters<typeof matchesUserFilter>[1]) => rows.filter((r) => matchesUserFilter(r, f, today)).length;
    expect([pick('all'), pick('active'), pick('invited'), pick('quiet')]).toEqual([3, 2, 1, 1]);
  });

  it('summarises roles, activity and invite expiry', () => {
    const s = summariseUsers([
      row({ last_active_at: '2026-11-17T00:00:00Z' }),
      row({ relationship_role: 'academy_user', last_active_at: '2026-11-01T00:00:00Z' }),
      row({ last_active_at: '2026-08-01T00:00:00Z' }),
      row({ relationship_role: null }),
      row({ row_type: 'invited', user_id: null, invite_expires_at: '2026-11-21T00:00:00Z' }),
      row({ row_type: 'invited', user_id: null, invite_expires_at: '2026-11-17T00:00:00Z' }),
    ], today);
    expect(s).toMatchObject({ total: 6, active: 4, invited: 2, quiet: 2, recent: 1, soonestInviteExpiryDays: -2 });
    expect(s.byRole.map((x) => x.count)).toEqual([2, 1, 1]);
    expect(s.byActivity.map((x) => x.count)).toEqual([1, 1, 1, 1]);
  });

  it('is safe with no rows', () => {
    expect(summariseUsers([], today)).toMatchObject({ total: 0, active: 0, invited: 0, quiet: 0, soonestInviteExpiryDays: null });
  });
});
