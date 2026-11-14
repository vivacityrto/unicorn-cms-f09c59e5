import { describe, it, expect } from 'vitest';
import {
  EMPTY_FILTERS, aiBadge, applyFilters, closeNeedsReason, computeSummary, csvEscape, matchesView,
  parseListParams, sortTickets, ticketRef, ticketsToCsv, toListParams, viewCounts,
  STATUS_LABEL, URGENCY_LABEL, type TicketRow,
} from '../ticketLogic';

const NOW = new Date('2026-11-13T02:00:00Z').getTime();
const day = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

function t(over: Partial<TicketRow> & { id: string }): TicketRow {
  return {
    ticket_number: 1, product: 'unicorn', tenant_id: 54, reporter_id: 'r1', type: 'bug', status: 'new',
    urgency: 'medium', title: 'A ticket', assignee_id: null, source_url: null, external_ref: null,
    ai_state: 'none', created_at: day(2), updated_at: day(2), resolved_at: null, last_activity_at: day(2),
    deleted_at: null,
    tenant: { id: 54, name: 'Client A' },
    reporter: { user_uuid: 'r1', first_name: 'Reporter', last_name: 'One' },
    assignee: null,
    ...over,
  };
}

const rows: TicketRow[] = [
  t({ id: 'a', ticket_number: 1, status: 'new', urgency: 'critical', last_activity_at: day(1), created_at: day(1) }),
  t({ id: 'b', ticket_number: 2, status: 'new', urgency: 'low', assignee_id: 'staff1', created_at: day(30), last_activity_at: day(3) }),
  t({ id: 'c', ticket_number: 3, status: 'in_progress', urgency: 'high', assignee_id: 'me', created_at: day(10), last_activity_at: day(2) }),
  t({ id: 'd', ticket_number: 4, status: 'waiting', urgency: 'high', product: 'complyhub_ai', tenant_id: 6372, tenant: { id: 6372, name: 'Vivacity' }, created_at: day(5), last_activity_at: day(4) }),
  t({ id: 'e', ticket_number: 5, status: 'resolved', urgency: 'critical', created_at: day(90), last_activity_at: day(20) }),
  t({ id: 'f', ticket_number: 6, status: 'closed', urgency: 'medium', type: 'question', created_at: day(40), last_activity_at: day(15) }),
];

describe('views', () => {
  it('Needs triage is new and unassigned only', () => {
    expect(rows.filter((r) => matchesView(r, 'triage')).map((r) => r.id)).toEqual(['a']);
  });
  it('Open covers new, in progress and waiting; Resolved covers resolved and closed', () => {
    expect(rows.filter((r) => matchesView(r, 'open')).map((r) => r.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(rows.filter((r) => matchesView(r, 'resolved')).map((r) => r.id)).toEqual(['e', 'f']);
    expect(rows.filter((r) => matchesView(r, 'all'))).toHaveLength(6);
  });
  it('counts every view', () => {
    expect(viewCounts(rows)).toEqual({ triage: 1, open: 4, resolved: 2, all: 6 });
  });
});

describe('summary', () => {
  it('counts what needs action and the oldest open ticket in days', () => {
    expect(computeSummary(rows, NOW)).toEqual({ needsTriage: 1, highCriticalOpen: 3, open: 4, oldestOpenDays: 30 });
  });
  it('reports no oldest ticket when nothing is open', () => {
    expect(computeSummary([rows[4], rows[5]], NOW).oldestOpenDays).toBeNull();
    expect(computeSummary([], NOW)).toEqual({ needsTriage: 0, highCriticalOpen: 0, open: 0, oldestOpenDays: null });
  });
  it('respects filters because it is computed from the filtered rows', () => {
    const f = applyFilters(rows, { ...EMPTY_FILTERS, product: 'complyhub_ai' }, { meId: 'me', now: NOW });
    expect(computeSummary(f, NOW)).toEqual({ needsTriage: 0, highCriticalOpen: 1, open: 1, oldestOpenDays: 5 });
  });
});

describe('sorting', () => {
  it('defaults to most urgent first, then most recent activity', () => {
    expect(sortTickets(rows).map((r) => r.id)).toEqual(['a', 'e', 'c', 'd', 'f', 'b']);
  });
  it('sorts by a chosen column in either direction', () => {
    expect(sortTickets(rows, { key: 'ticket', dir: 'asc' }).map((r) => r.ticket_number)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(sortTickets(rows, { key: 'activity', dir: 'desc' })[0].id).toBe('a');
    expect(sortTickets(rows, { key: 'status', dir: 'asc' })[0].status).toBe('new');
  });
  it('does not mutate its input', () => {
    const copy = [...rows];
    sortTickets(rows);
    expect(rows).toEqual(copy);
  });
});

describe('filters', () => {
  const ctx = { meId: 'me', now: NOW };
  it('searches title, reporter, client and ST number', () => {
    expect(applyFilters(rows, { ...EMPTY_FILTERS, search: 'st-3' }, ctx).map((r) => r.id)).toEqual(['c']);
    expect(applyFilters(rows, { ...EMPTY_FILTERS, search: 'vivacity' }, ctx).map((r) => r.id)).toEqual(['d']);
    expect(applyFilters(rows, { ...EMPTY_FILTERS, search: 'reporter one' }, ctx)).toHaveLength(6);
  });
  it('filters by product, type and urgency', () => {
    expect(applyFilters(rows, { ...EMPTY_FILTERS, product: 'complyhub_ai' }, ctx).map((r) => r.id)).toEqual(['d']);
    expect(applyFilters(rows, { ...EMPTY_FILTERS, type: 'question' }, ctx).map((r) => r.id)).toEqual(['f']);
    expect(applyFilters(rows, { ...EMPTY_FILTERS, urgency: 'critical' }, ctx).map((r) => r.id)).toEqual(['a', 'e']);
  });
  it('filters by assignee: me, unassigned or a person', () => {
    expect(applyFilters(rows, { ...EMPTY_FILTERS, assignee: 'me' }, ctx).map((r) => r.id)).toEqual(['c']);
    expect(applyFilters(rows, { ...EMPTY_FILTERS, assignee: 'unassigned' }, ctx).map((r) => r.id)).toEqual(['a', 'd', 'e', 'f']);
    expect(applyFilters(rows, { ...EMPTY_FILTERS, assignee: 'staff1' }, ctx).map((r) => r.id)).toEqual(['b']);
    expect(applyFilters(rows, { ...EMPTY_FILTERS, assignee: 'me' }, { meId: null, now: NOW })).toHaveLength(0);
  });
  it('filters by client and date range', () => {
    expect(applyFilters(rows, { ...EMPTY_FILTERS, client: '6372' }, ctx).map((r) => r.id)).toEqual(['d']);
    expect(applyFilters(rows, { ...EMPTY_FILTERS, range: '7d' }, ctx).map((r) => r.id)).toEqual(['a', 'd']);
    expect(applyFilters(rows, { ...EMPTY_FILTERS, range: '30d' }, ctx).map((r) => r.id)).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('labels and references', () => {
  it('uses the decided status and urgency vocabulary', () => {
    expect(STATUS_LABEL).toEqual({
      new: 'New', in_progress: 'In progress', waiting: 'Waiting on reporter', resolved: 'Resolved', closed: 'Closed',
    });
    expect(URGENCY_LABEL.critical).toBe('Critical');
    expect(ticketRef(23)).toBe('ST-23');
  });
  it('requires a reason only when moving into closed', () => {
    expect(closeNeedsReason('closed', 'in_progress')).toBe(true);
    expect(closeNeedsReason('closed', 'closed')).toBe(false);
    expect(closeNeedsReason('resolved', 'new')).toBe(false);
  });
});

describe('AI badge state', () => {
  it('shows a notice while the fields are an unreviewed draft', () => {
    expect(aiBadge({ ai_state: 'pending' })?.label).toBe('AI is sorting this message');
    expect(aiBadge({ ai_state: 'drafting' })?.label).toBe('AI is sorting this message');
    expect(aiBadge({ ai_state: 'drafted' })?.label).toBe('AI draft, check before relying on it');
    expect(aiBadge({ ai_state: 'failed' })?.tone).toBe('warn');
  });
  it('shows nothing once reviewed or when AI was never involved', () => {
    expect(aiBadge({ ai_state: 'reviewed' })).toBeNull();
    expect(aiBadge({ ai_state: 'none' })).toBeNull();
  });
});

describe('CSV export', () => {
  it('escapes quotes, commas and newlines', () => {
    expect(csvEscape('a,b')).toBe('"a,b"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
    expect(csvEscape(null)).toBe('');
  });
  it('writes a header, one row per ticket and Australian long dates', () => {
    const csv = ticketsToCsv([rows[0]]).split('\n');
    expect(csv[0]).toBe('Ticket,Title,Product,Client,Reported by,Type,Status,Urgency,Assigned to,Created,Last activity');
    expect(csv[1]).toMatch(/^ST-1,A ticket,Unicorn,Client A,Reporter One,Something is broken,New,Critical,,\d{1,2} [A-Z][a-z]+ \d{4},/);
  });
});

describe('URL state', () => {
  it('round-trips view, filters, sort and the open ticket', () => {
    const state = parseListParams(new URLSearchParams(
      'view=open&q=export&product=complyhub_ai&type=bug&urgency=high&client=54&assignee=me&range=30d&sort=urgency&dir=asc&ticket=abc',
    ));
    expect(state.view).toBe('open');
    expect(state.filters).toEqual({ search: 'export', product: 'complyhub_ai', type: 'bug', urgency: 'high', client: '54', assignee: 'me', range: '30d' });
    expect(state.sort).toEqual({ key: 'urgency', dir: 'asc' });
    expect(state.ticket).toBe('abc');
    expect(parseListParams(toListParams(state))).toEqual(state);
  });
  it('falls back to safe defaults for unknown values and keeps the URL clean by default', () => {
    const state = parseListParams(new URLSearchParams('view=nonsense&product=other&range=1y&sort=bad'));
    expect(state.view).toBe('triage');
    expect(state.filters).toEqual(EMPTY_FILTERS);
    expect(state.sort).toEqual({ key: 'priority', dir: 'desc' });
    expect(toListParams(state).toString()).toBe('');
  });
});
