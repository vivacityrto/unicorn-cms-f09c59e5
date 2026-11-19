import { differenceInCalendarDays, parseISO } from 'date-fns';
import type { ClientTenantUserRow } from '@/features/client-identity/models';

export type UserFilter = 'all' | 'active' | 'invited' | 'quiet';

/** Active people who have not been seen for this many days (or ever) count as quiet. */
export const QUIET_AFTER_DAYS = 30;

const seenAt = (r: Pick<ClientTenantUserRow, 'last_active_at' | 'last_sign_in_at'>) => r.last_active_at ?? r.last_sign_in_at ?? null;

/** Whole days since this person was last seen, or null if they never have been. */
export function daysSinceSeen(r: Pick<ClientTenantUserRow, 'last_active_at' | 'last_sign_in_at'>, today: Date = new Date()): number | null {
  const iso = seenAt(r);
  if (!iso) return null;
  const d = parseISO(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.max(0, differenceInCalendarDays(today, d));
}

export const isQuiet = (r: ClientTenantUserRow, today: Date = new Date()) => {
  if (r.row_type !== 'active') return false;
  const d = daysSinceSeen(r, today);
  return d === null || d > QUIET_AFTER_DAYS;
};

export function matchesUserFilter(r: ClientTenantUserRow, f: UserFilter, today: Date = new Date()): boolean {
  if (f === 'active') return r.row_type === 'active';
  if (f === 'invited') return r.row_type === 'invited';
  if (f === 'quiet') return isQuiet(r, today);
  return true;
}

export interface UserSummary {
  total: number;
  active: number;
  invited: number;
  quiet: number;
  /** Active people seen in the last 7 days. */
  recent: number;
  /** Days until the soonest pending invite expires (negative if already expired), or null. */
  soonestInviteExpiryDays: number | null;
  /** Active people only. */
  byRole: Array<{ key: 'user' | 'academy_user' | 'other'; label: string; count: number }>;
  byActivity: Array<{ key: 'week' | 'month' | 'older' | 'never'; label: string; count: number }>;
}

export function summariseUsers(rows: readonly ClientTenantUserRow[], today: Date = new Date()): UserSummary {
  const active = rows.filter((r) => r.row_type === 'active');
  const invited = rows.filter((r) => r.row_type === 'invited');

  let week = 0;
  let month = 0;
  let older = 0;
  let never = 0;
  for (const r of active) {
    const d = daysSinceSeen(r, today);
    if (d === null) never += 1;
    else if (d <= 7) week += 1;
    else if (d <= QUIET_AFTER_DAYS) month += 1;
    else older += 1;
  }

  const expiries = invited
    .map((r) => r.invite_expires_at)
    .filter((x): x is string => !!x)
    .map((x) => differenceInCalendarDays(parseISO(x), today))
    .filter((n) => !Number.isNaN(n));

  const full = active.filter((r) => r.relationship_role === 'user').length;
  const academy = active.filter((r) => r.relationship_role === 'academy_user').length;

  return {
    total: rows.length,
    active: active.length,
    invited: invited.length,
    quiet: never + older,
    recent: week,
    soonestInviteExpiryDays: expiries.length ? Math.min(...expiries) : null,
    byRole: [
      { key: 'user', label: 'Full access', count: full },
      { key: 'academy_user', label: 'Academy only', count: academy },
      { key: 'other', label: 'Other', count: active.length - full - academy },
    ],
    byActivity: [
      { key: 'week', label: 'This week', count: week },
      { key: 'month', label: 'This month', count: month },
      { key: 'older', label: 'Longer ago', count: older },
      { key: 'never', label: 'Never signed in', count: never },
    ],
  };
}
