/**
 * The "why is it 34.5%?" explanation for the automatic client measures.
 *
 * Every number comes from the weekly snapshot, one row per Live Client per week, which is the same data the
 * headline is worked out from, so the explanation can never disagree with the number above it.
 */

export type BreakdownKind = 'clients_active' | 'clients_quiet' | 'people_active' | 'never_signed_in' | 'certificates';

const KIND_BY_KEY: Readonly<Record<string, BreakdownKind>> = {
  cst_rtos_with_activity_pct: 'clients_active',
  cst_rtos_no_activity_count: 'clients_quiet',
  cst_client_activity_rate_pct: 'people_active',
  cst_users_never_signed_in_count: 'never_signed_in',
  cst_certificates_issued_count: 'certificates',
};

/** The kind of explanation a measure has, or null for measures people type in by hand. */
export function breakdownKind(metricKey: string | null | undefined): BreakdownKind | null {
  return (metricKey && KIND_BY_KEY[metricKey]) || null;
}

/** One client for one week. */
export interface CstClientRow {
  tenantId: number;
  name: string;
  cscId: string | null;
  cscName: string;
  clientUsers: number;
  activeUsers: number;
  neverSignedIn: number;
  certificates: number;
  /** All-time, from the live report. Undefined when it could not be loaded; null when the client has never been active. */
  lastActiveAt?: string | null;
}

export interface Split {
  label: string;
  count: number;
  tone: 'good' | 'bad';
}

export interface CscShare {
  name: string;
  /** The thing being explained for this CSC's clients. */
  count: number;
  /** Out of how many. */
  of: number;
}

export interface Breakdown {
  sentence: string;
  split: Split[];
  lift: string | null;
  listTitle: string;
  list: CstClientRow[];
  byCsc: CscShare[];
}

interface MeasureFacts {
  value: number | null;
  target: number;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const byBiggest = (a: CstClientRow, b: CstClientRow) => b.clientUsers - a.clientUsers || a.name.localeCompare(b.name);

export const isQuiet = (r: CstClientRow) => r.clientUsers > 0 && r.activeUsers === 0;
export const isActiveClient = (r: CstClientRow) => r.clientUsers > 0 && r.activeUsers > 0;

function groupByCsc(rows: readonly CstClientRow[], count: (group: CstClientRow[]) => number, of: (group: CstClientRow[]) => number): CscShare[] {
  const groups = new Map<string, CstClientRow[]>();
  for (const r of rows) groups.set(r.cscName, [...(groups.get(r.cscName) ?? []), r]);
  return [...groups.entries()]
    .map(([name, group]) => ({ name, count: count(group), of: of(group) }))
    .sort((a, b) => b.count - a.count || b.of - a.of || a.name.localeCompare(b.name));
}

const sum = (rows: readonly CstClientRow[], pick: (r: CstClientRow) => number) => rows.reduce((total, r) => total + pick(r), 0);

/** The measure's own number worked out from one week's rows, the same way the database does it. */
export function metricFromRows(kind: BreakdownKind, rows: readonly CstClientRow[]): number | null {
  const withUsers = rows.filter((r) => r.clientUsers > 0);
  switch (kind) {
    case 'clients_active':
      return withUsers.length === 0 ? null : Math.round((withUsers.filter(isActiveClient).length * 1000) / withUsers.length) / 10;
    case 'clients_quiet':
      return rows.length === 0 ? null : withUsers.filter(isQuiet).length;
    case 'people_active': {
      const users = sum(rows, (r) => r.clientUsers);
      return users === 0 ? null : Math.round((sum(rows, (r) => r.activeUsers) * 1000) / users) / 10;
    }
    case 'never_signed_in':
      return rows.length === 0 ? null : sum(rows, (r) => r.neverSignedIn);
    case 'certificates':
      return rows.length === 0 ? null : sum(rows, (r) => r.certificates);
  }
}

export function buildBreakdown(kind: BreakdownKind, rows: readonly CstClientRow[], m: MeasureFacts): Breakdown {
  const withUsers = rows.filter((r) => r.clientUsers > 0);
  const active = withUsers.filter(isActiveClient);
  const quiet = withUsers.filter(isQuiet);
  const clientsWord = (n: number) => (n === 1 ? 'client' : 'clients');
  const below = (needed: number) => m.value !== null && needed > 0;

  if (kind === 'clients_active' || kind === 'clients_quiet') {
    const sentence =
      kind === 'clients_active'
        ? `${active.length} of ${withUsers.length} clients with portal users had someone use the portal in the last 28 days. The other ${quiet.length} had nobody.`
        : `${quiet.length} of ${withUsers.length} clients had nobody use the portal in the last 28 days.`;
    let lift: string | null = null;
    if (kind === 'clients_active') {
      const needed = Math.ceil((m.target / 100) * withUsers.length) - active.length;
      if (below(needed)) lift = `${needed} more ${needed === 1 ? 'client needs' : 'clients need'} someone active to reach ${m.target}%.`;
    } else {
      const reduce = quiet.length - m.target;
      if (m.value !== null && reduce > 0) lift = `Getting ${reduce} of these ${clientsWord(reduce)} active again would meet the aim of ${m.target} or fewer.`;
    }
    return {
      sentence,
      split: [
        { label: 'Someone active', count: active.length, tone: 'good' },
        { label: 'Nobody active', count: quiet.length, tone: 'bad' },
      ],
      lift,
      listTitle: 'Clients with nobody active, biggest first',
      list: [...quiet].sort(byBiggest),
      byCsc: groupByCsc(withUsers, (g) => g.filter(isQuiet).length, (g) => g.length),
    };
  }

  if (kind === 'people_active') {
    const users = sum(rows, (r) => r.clientUsers);
    const activeUsers = sum(rows, (r) => r.activeUsers);
    const needed = Math.ceil((m.target / 100) * users) - activeUsers;
    return {
      sentence: `${activeUsers} of ${users} client users used the portal in the last 28 days.`,
      split: [
        { label: 'Used the portal', count: activeUsers, tone: 'good' },
        { label: 'Did not', count: users - activeUsers, tone: 'bad' },
      ],
      lift: below(needed) ? `${plural(needed, 'more person needs', 'more people need')} to use the portal to reach ${m.target}%.` : null,
      listTitle: 'Clients with nobody active, biggest first',
      list: [...quiet].sort(byBiggest),
      byCsc: groupByCsc(withUsers, (g) => sum(g, (r) => r.activeUsers), (g) => sum(g, (r) => r.clientUsers)),
    };
  }

  if (kind === 'never_signed_in') {
    const total = sum(rows, (r) => r.neverSignedIn);
    const users = sum(rows, (r) => r.clientUsers);
    const holding = rows.filter((r) => r.neverSignedIn > 0).sort((a, b) => b.neverSignedIn - a.neverSignedIn || a.name.localeCompare(b.name));
    const topThree = sum(holding.slice(0, 3), (r) => r.neverSignedIn);
    const reduce = total - m.target;
    return {
      sentence:
        total === 0
          ? 'Everyone who has been invited has signed in at least once.'
          : `${plural(total, 'invited person has', 'invited people have')} never signed in, across ${plural(holding.length, 'client', 'clients')}.${holding.length > 3 ? ` The three biggest account for ${topThree} of them.` : ''}`,
      split: [
        { label: 'Have signed in', count: users - total, tone: 'good' },
        { label: 'Never signed in', count: total, tone: 'bad' },
      ],
      lift: m.value !== null && reduce > 0 ? `${reduce} of these people need to sign in, or be removed if they have left, to meet the aim of ${m.target} or fewer.` : null,
      listTitle: 'Clients with people who never signed in',
      list: holding,
      byCsc: groupByCsc(rows, (g) => sum(g, (r) => r.neverSignedIn), (g) => sum(g, (r) => r.clientUsers)),
    };
  }

  const total = sum(rows, (r) => r.certificates);
  const earning = rows.filter((r) => r.certificates > 0).sort((a, b) => b.certificates - a.certificates || a.name.localeCompare(b.name));
  const missing = m.target - total;
  return {
    sentence: total === 0 ? 'No certificates were issued this week.' : `${plural(total, 'certificate was', 'certificates were')} issued this week, across ${plural(earning.length, 'client', 'clients')}.`,
    split: [],
    lift: m.value !== null && missing > 0 ? `${plural(missing, 'more certificate', 'more certificates')} would have met the aim of ${m.target}.` : null,
    listTitle: 'Clients that earned certificates',
    list: earning,
    byCsc: groupByCsc(rows, (g) => sum(g, (r) => r.certificates), (g) => g.length),
  };
}

export interface WeekChanges {
  wentQuiet: CstClientRow[];
  cameBack: CstClientRow[];
}

/** Which clients moved between "someone active" and "nobody active" since the week before. */
export function weekChanges(previous: readonly CstClientRow[], current: readonly CstClientRow[]): WeekChanges {
  const before = new Map(previous.map((r) => [r.tenantId, r]));
  const wentQuiet = current.filter((r) => isQuiet(r) && before.has(r.tenantId) && isActiveClient(before.get(r.tenantId)!));
  const cameBack = current.filter((r) => isActiveClient(r) && before.has(r.tenantId) && isQuiet(before.get(r.tenantId)!));
  return { wentQuiet: wentQuiet.sort(byBiggest), cameBack: cameBack.sort(byBiggest) };
}

export interface WeekPoint {
  weekEnding: string;
  value: number | null;
}

/** The measure's number for each week we have rows for, oldest first. */
export function weeklySeries(kind: BreakdownKind, rowsByWeek: Readonly<Record<string, readonly CstClientRow[]>>): WeekPoint[] {
  return Object.keys(rowsByWeek)
    .sort()
    .map((weekEnding) => ({ weekEnding, value: metricFromRows(kind, rowsByWeek[weekEnding]) }));
}

/** Count items by a label, biggest first, for "by course" and "by client". */
export function countBy<T>(items: readonly T[], label: (item: T) => string): { label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(label(item), (counts.get(label(item)) ?? 0) + 1);
  return [...counts.entries()].map(([name, count]) => ({ label: name, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}
