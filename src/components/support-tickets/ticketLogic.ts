import { differenceInCalendarDays, format } from 'date-fns';

/**
 * Pure logic for the Tickets list, panel and summary bar. Kept free of React
 * and Supabase so it can be unit-tested and reused by the panel sheet.
 */

export type TicketType = 'bug' | 'request' | 'question' | 'other';
export type TicketStatus = 'new' | 'in_progress' | 'waiting' | 'resolved' | 'closed';
export type TicketUrgency = 'low' | 'medium' | 'high' | 'critical';
export type TicketProduct = 'unicorn' | 'complyhub_ai' | 'company';
export type AiState = 'none' | 'pending' | 'drafting' | 'drafted' | 'failed' | 'reviewed';

export const TICKET_TYPES: TicketType[] = ['bug', 'request', 'question', 'other'];
export const TICKET_STATUSES: TicketStatus[] = ['new', 'in_progress', 'waiting', 'resolved', 'closed'];
export const TICKET_URGENCIES: TicketUrgency[] = ['low', 'medium', 'high', 'critical'];
export const TICKET_PRODUCTS: TicketProduct[] = ['unicorn', 'complyhub_ai', 'company'];

/** Vivacity's own tenant id: the tenant of ComplyHub, company-wide and staff-raised internal tickets. */
export const VIVACITY_TICKET_TENANT_ID = 6372;

export const STATUS_LABEL: Record<TicketStatus, string> = {
  new: 'New',
  in_progress: 'In progress',
  waiting: 'Waiting on reporter',
  resolved: 'Resolved',
  closed: 'Closed',
};

export const TYPE_LABEL: Record<TicketType, string> = {
  bug: 'Something is broken',
  request: 'Request',
  question: 'Question',
  other: 'Other',
};

export const URGENCY_LABEL: Record<TicketUrgency, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

export const PRODUCT_LABEL: Record<TicketProduct, string> = {
  unicorn: 'Unicorn',
  complyhub_ai: 'ComplyHub',
  company: 'Company',
};

/** Higher rank sorts first. */
export const URGENCY_RANK: Record<TicketUrgency, number> = { critical: 4, high: 3, medium: 2, low: 1 };

/** What the reporter sees, in their own words, for the same statuses. */
export const CLIENT_STATUS_LABEL: Record<TicketStatus, string> = {
  new: 'Received',
  in_progress: 'In progress',
  waiting: 'Waiting for your reply',
  resolved: 'Resolved',
  closed: 'Closed',
};

export interface TicketPerson {
  user_uuid: string;
  first_name: string | null;
  last_name: string | null;
}

export interface TicketRow {
  id: string;
  ticket_number: number;
  product: TicketProduct;
  tenant_id: number;
  reporter_id: string;
  type: TicketType;
  status: TicketStatus;
  urgency: TicketUrgency;
  title: string;
  assignee_id: string | null;
  source_url: string | null;
  external_ref: string | null;
  ai_state: AiState;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  last_activity_at: string;
  deleted_at: string | null;
  tenant: { id: number; name: string | null } | null;
  reporter: TicketPerson | null;
  assignee: TicketPerson | null;
}

export type TicketView = 'triage' | 'open' | 'resolved' | 'all';
export const TICKET_VIEWS: { key: TicketView; label: string }[] = [
  { key: 'triage', label: 'Needs triage' },
  { key: 'open', label: 'Open' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'all', label: 'All' },
];

export type DateRange = '7d' | '30d' | '90d' | null;
export type ProductFilter = 'all' | TicketProduct;

export interface TicketFilterState {
  search: string;
  product: ProductFilter;
  type: 'all' | TicketType;
  urgency: 'all' | TicketUrgency;
  /** 'all' or a tenant id as string. */
  client: string;
  /** 'all', 'me', 'unassigned' or a staff user uuid. */
  assignee: string;
  range: DateRange;
}

export const EMPTY_FILTERS: TicketFilterState = {
  search: '',
  product: 'all',
  type: 'all',
  urgency: 'all',
  client: 'all',
  assignee: 'all',
  range: null,
};

export function ticketRef(n: number): string {
  return `ST-${n}`;
}

export function isOpenStatus(status: TicketStatus): boolean {
  return status === 'new' || status === 'in_progress' || status === 'waiting';
}

export function personName(p: { first_name: string | null; last_name: string | null } | null | undefined): string {
  if (!p) return '';
  return [p.first_name, p.last_name].filter(Boolean).join(' ').trim();
}

export function matchesView(t: TicketRow, view: TicketView): boolean {
  switch (view) {
    case 'triage':
      return t.status === 'new' && !t.assignee_id;
    case 'open':
      return isOpenStatus(t.status);
    case 'resolved':
      return t.status === 'resolved' || t.status === 'closed';
    default:
      return true;
  }
}

const RANGE_DAYS: Record<Exclude<DateRange, null>, number> = { '7d': 7, '30d': 30, '90d': 90 };

export function applyFilters(
  rows: TicketRow[],
  f: TicketFilterState,
  ctx: { meId: string | null; now?: number },
): TicketRow[] {
  const q = f.search.trim().toLowerCase();
  const now = ctx.now ?? Date.now();
  const cutoff = f.range ? now - RANGE_DAYS[f.range] * 24 * 60 * 60 * 1000 : null;

  return rows.filter((r) => {
    if (q) {
      const hay = [
        r.title,
        r.tenant?.name ?? '',
        personName(r.reporter),
        ticketRef(r.ticket_number),
      ].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (f.product !== 'all' && r.product !== f.product) return false;
    if (f.type !== 'all' && r.type !== f.type) return false;
    if (f.urgency !== 'all' && r.urgency !== f.urgency) return false;
    if (f.client !== 'all' && String(r.tenant_id) !== f.client) return false;
    if (f.assignee === 'unassigned' && r.assignee_id) return false;
    if (f.assignee === 'me' && (!ctx.meId || r.assignee_id !== ctx.meId)) return false;
    if (f.assignee !== 'all' && f.assignee !== 'me' && f.assignee !== 'unassigned' && r.assignee_id !== f.assignee) return false;
    if (cutoff != null && new Date(r.created_at).getTime() < cutoff) return false;
    return true;
  });
}

export interface TicketSummary {
  needsTriage: number;
  highCriticalOpen: number;
  open: number;
  /** Age in days of the oldest open ticket, or null when nothing is open. */
  oldestOpenDays: number | null;
}

/** Summary counts for a (filtered) set of rows. They intentionally ignore the active view. */
export function computeSummary(rows: TicketRow[], now: number = Date.now()): TicketSummary {
  let needsTriage = 0;
  let highCriticalOpen = 0;
  let open = 0;
  let oldest: number | null = null;
  for (const r of rows) {
    if (matchesView(r, 'triage')) needsTriage += 1;
    if (!isOpenStatus(r.status)) continue;
    open += 1;
    if (r.urgency === 'high' || r.urgency === 'critical') highCriticalOpen += 1;
    const age = Math.max(0, differenceInCalendarDays(now, new Date(r.created_at)));
    if (oldest == null || age > oldest) oldest = age;
  }
  return { needsTriage, highCriticalOpen, open, oldestOpenDays: oldest };
}

export function viewCounts(rows: TicketRow[]): Record<TicketView, number> {
  return {
    triage: rows.filter((r) => matchesView(r, 'triage')).length,
    open: rows.filter((r) => matchesView(r, 'open')).length,
    resolved: rows.filter((r) => matchesView(r, 'resolved')).length,
    all: rows.length,
  };
}

export type SortKey = 'priority' | 'ticket' | 'title' | 'client' | 'status' | 'urgency' | 'activity';
export interface SortState {
  key: SortKey;
  dir: 'asc' | 'desc';
}
export const DEFAULT_SORT: SortState = { key: 'priority', dir: 'desc' };

function byActivityDesc(a: TicketRow, b: TicketRow): number {
  const d = new Date(b.last_activity_at).getTime() - new Date(a.last_activity_at).getTime();
  return d !== 0 ? d : a.id.localeCompare(b.id);
}

/** The default order is most urgent first, then most recent activity. */
export function sortTickets(rows: TicketRow[], sort: SortState = DEFAULT_SORT): TicketRow[] {
  const dir = sort.dir === 'asc' ? 1 : -1;
  const copy = [...rows];
  copy.sort((a, b) => {
    let c = 0;
    switch (sort.key) {
      case 'priority':
        c = (URGENCY_RANK[b.urgency] ?? 0) - (URGENCY_RANK[a.urgency] ?? 0);
        return c !== 0 ? c * (sort.dir === 'desc' ? 1 : -1) : byActivityDesc(a, b);
      case 'ticket':
        c = a.ticket_number - b.ticket_number;
        break;
      case 'title':
        c = a.title.toLowerCase().localeCompare(b.title.toLowerCase());
        break;
      case 'client':
        c = (a.tenant?.name ?? '').toLowerCase().localeCompare((b.tenant?.name ?? '').toLowerCase());
        break;
      case 'status':
        c = TICKET_STATUSES.indexOf(a.status) - TICKET_STATUSES.indexOf(b.status);
        break;
      case 'urgency':
        c = (URGENCY_RANK[a.urgency] ?? 0) - (URGENCY_RANK[b.urgency] ?? 0);
        break;
      case 'activity':
        c = new Date(a.last_activity_at).getTime() - new Date(b.last_activity_at).getTime();
        break;
    }
    return c !== 0 ? c * dir : byActivityDesc(a, b);
  });
  return copy;
}

export interface AiBadge {
  label: string;
  tone: 'info' | 'warn';
}

/** The "AI draft" badge shown beside a ticket's fields, or null once a person has reviewed them. */
export function aiBadge(t: Pick<TicketRow, 'ai_state'>): AiBadge | null {
  switch (t.ai_state) {
    case 'pending':
    case 'drafting':
      return { label: 'AI is sorting this message', tone: 'info' };
    case 'drafted':
      return { label: 'AI draft, check before relying on it', tone: 'warn' };
    case 'failed':
      return { label: 'AI draft unavailable, set the fields by hand', tone: 'warn' };
    default:
      return null;
  }
}

/** Closing a ticket needs a reason the reporter can read. */
export function closeNeedsReason(next: TicketStatus, current: TicketStatus): boolean {
  return next === 'closed' && current !== 'closed';
}

export function formatDate(iso: string): string {
  return format(new Date(iso), 'd MMMM yyyy');
}

export function formatDateTime(iso: string): string {
  return `${format(new Date(iso), 'd MMMM yyyy')}, ${format(new Date(iso), 'h:mm aaa')}`;
}

export function csvEscape(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function ticketsToCsv(rows: TicketRow[]): string {
  const headers = ['Ticket', 'Title', 'Product', 'Client', 'Reported by', 'Type', 'Status', 'Urgency', 'Assigned to', 'Created', 'Last activity'];
  const lines = rows.map((r) =>
    [
      ticketRef(r.ticket_number),
      r.title,
      PRODUCT_LABEL[r.product] ?? r.product,
      r.tenant?.name ?? '',
      personName(r.reporter),
      TYPE_LABEL[r.type] ?? r.type,
      STATUS_LABEL[r.status] ?? r.status,
      URGENCY_LABEL[r.urgency] ?? r.urgency,
      personName(r.assignee),
      formatDate(r.created_at),
      formatDate(r.last_activity_at),
    ].map(csvEscape).join(','),
  );
  return [headers.join(','), ...lines].join('\n');
}

/** Filters and view survive a refresh and a shared link through the URL search params. */
export interface ListUrlState {
  view: TicketView;
  filters: TicketFilterState;
  sort: SortState;
  ticket: string | null;
}

const oneOf = <T extends string>(v: string | null, allowed: readonly T[], fallback: T): T =>
  v && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;

export function parseListParams(p: URLSearchParams): ListUrlState {
  const sortKeys: SortKey[] = ['priority', 'ticket', 'title', 'client', 'status', 'urgency', 'activity'];
  return {
    view: oneOf(p.get('view'), ['triage', 'open', 'resolved', 'all'] as const, 'triage'),
    filters: {
      search: p.get('q') ?? '',
      product: oneOf(p.get('product'), ['all', ...TICKET_PRODUCTS] as const, 'all'),
      type: oneOf(p.get('type'), ['all', ...TICKET_TYPES] as const, 'all'),
      urgency: oneOf(p.get('urgency'), ['all', ...TICKET_URGENCIES] as const, 'all'),
      client: p.get('client') ?? 'all',
      assignee: p.get('assignee') ?? 'all',
      range: ((r: string | null): DateRange => (r === '7d' || r === '30d' || r === '90d' ? r : null))(p.get('range')),
    },
    sort: {
      key: oneOf(p.get('sort'), sortKeys, 'priority'),
      dir: p.get('dir') === 'asc' ? 'asc' : 'desc',
    },
    ticket: p.get('ticket'),
  };
}

export function toListParams(s: ListUrlState): URLSearchParams {
  const p = new URLSearchParams();
  if (s.view !== 'triage') p.set('view', s.view);
  if (s.filters.search) p.set('q', s.filters.search);
  if (s.filters.product !== 'all') p.set('product', s.filters.product);
  if (s.filters.type !== 'all') p.set('type', s.filters.type);
  if (s.filters.urgency !== 'all') p.set('urgency', s.filters.urgency);
  if (s.filters.client !== 'all') p.set('client', s.filters.client);
  if (s.filters.assignee !== 'all') p.set('assignee', s.filters.assignee);
  if (s.filters.range) p.set('range', s.filters.range);
  if (s.sort.key !== DEFAULT_SORT.key || s.sort.dir !== DEFAULT_SORT.dir) {
    p.set('sort', s.sort.key);
    p.set('dir', s.sort.dir);
  }
  if (s.ticket) p.set('ticket', s.ticket);
  return p;
}

export function filtersActive(f: TicketFilterState): boolean {
  return JSON.stringify(f) !== JSON.stringify(EMPTY_FILTERS);
}

export type ThreadViewer = 'staff' | 'client';

/** Who wrote a message, as the viewer should see it. Clients never see staff names. */
export function authorLabel(
  msg: { author_id: string | null; author?: { first_name: string | null; last_name: string | null } | null },
  viewer: ThreadViewer,
  reporterId: string,
): string {
  if (viewer === 'client') {
    return msg.author_id && msg.author_id === reporterId ? 'You' : 'Vivacity team';
  }
  if (!msg.author_id) return 'System';
  const base = personName(msg.author) || 'Staff member';
  return msg.author_id === reporterId ? `${base} (reporter)` : base;
}
