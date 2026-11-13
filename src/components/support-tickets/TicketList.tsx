import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Inbox, SearchX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { ProductBadge, TypeBadge, UrgencyBadge } from './TicketBadges';
import { AssigneeSelect, StatusSelect, StopRowClick } from './TicketControls';
import { formatDate, personName, ticketRef, type SortKey, type SortState, type TicketRow } from './ticketLogic';

const PAGE_SIZE = 25;

interface Props {
  rows: TicketRow[];
  isLoading: boolean;
  /** Tickets in the system before any view or filter, to tell "nothing yet" from "nothing matches". */
  totalCount: number;
  filtersActive: boolean;
  sort: SortState;
  onSortChange: (key: SortKey) => void;
  onOpen: (id: string) => void;
  onRequestClose: (id: string) => void;
  onClearFilters: () => void;
  onNewTicket: () => void;
  /** Changing this resets to page one. */
  resetKey: string;
}

function SortHeader({
  label, k, sort, onSort, className,
}: { label: string; k: SortKey; sort: SortState; onSort: (k: SortKey) => void; className?: string }) {
  const active = sort.key === k;
  const Icon = !active ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th
      scope="col"
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={cn('px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground', className)}
    >
      <button
        type="button"
        onClick={() => onSort(k)}
        className="inline-flex min-h-8 items-center gap-1 rounded hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
      >
        {label}
        <Icon aria-hidden className={cn('h-3 w-3', !active && 'opacity-50')} />
      </button>
    </th>
  );
}

function EmptyState({ totalCount, filtersActive, onClearFilters, onNewTicket }: Pick<Props, 'totalCount' | 'filtersActive' | 'onClearFilters' | 'onNewTicket'>) {
  if (totalCount === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
        <Inbox aria-hidden className="h-10 w-10 text-muted-foreground" />
        <p className="font-medium text-foreground">No tickets yet</p>
        <p className="max-w-sm text-sm text-muted-foreground">When someone raises an issue, request or question it will appear here.</p>
        <Button onClick={onNewTicket} className="min-h-11 sm:min-h-9">New ticket</Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
      <SearchX aria-hidden className="h-10 w-10 text-muted-foreground" />
      <p className="font-medium text-foreground">Nothing matches this view</p>
      <p className="max-w-sm text-sm text-muted-foreground">
        {filtersActive ? 'Try removing a filter, or choose another view.' : 'Choose another view to see more tickets.'}
      </p>
      {filtersActive && <Button variant="outline" onClick={onClearFilters} className="text-foreground min-h-11 sm:min-h-9">Clear filters</Button>}
    </div>
  );
}

export function TicketList(props: Props) {
  const { rows, isLoading, sort, onSortChange, onOpen, onRequestClose, resetKey } = props;
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [resetKey]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  if (isLoading) {
    return (
      <div role="status" aria-label="Loading tickets" className="space-y-2 p-4 sm:p-6">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
      </div>
    );
  }
  if (rows.length === 0) return <EmptyState {...props} />;

  return (
    <div>
      {/* Table from 768px; cards below. */}
      <div className="hidden md:block">
        <table className="w-full table-fixed text-sm">
          <caption className="sr-only">Tickets</caption>
          <colgroup>
            <col />
            <col className="w-40" />
            <col className="w-36" />
            <col className="w-44" />
            <col className="w-28" />
            <col className="w-48" />
            <col className="w-32" />
          </colgroup>
          <thead className="border-b border-border bg-muted/50">
            <tr>
              <SortHeader label="Ticket" k="title" sort={sort} onSort={onSortChange} className="pl-4 sm:pl-6" />
              <SortHeader label="Client" k="client" sort={sort} onSort={onSortChange} />
              <th scope="col" className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Type</th>
              <SortHeader label="Status" k="status" sort={sort} onSort={onSortChange} />
              <SortHeader label="Urgency" k="urgency" sort={sort} onSort={onSortChange} />
              <th scope="col" className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Assigned to</th>
              <SortHeader label="Activity" k="activity" sort={sort} onSort={onSortChange} className="pr-4 sm:pr-6" />
            </tr>
          </thead>
          <tbody>
            {pageRows.map((t) => (
              <tr
                key={t.id}
                onClick={() => onOpen(t.id)}
                className="cursor-pointer border-b border-border transition-colors hover:bg-muted/50"
              >
                <td className="min-w-0 py-2.5 pl-4 pr-3 sm:pl-6">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onOpen(t.id); }}
                    className="block w-full min-w-0 rounded text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <span className="block text-xs text-muted-foreground">{ticketRef(t.ticket_number)}</span>
                    <span className="line-clamp-2 break-words font-medium text-foreground">{t.title}</span>
                  </button>
                  {t.product !== 'unicorn' && <ProductBadge product={t.product} className="mt-1" />}
                </td>
                <td className="truncate px-3 py-2.5 text-foreground" title={t.tenant?.name ?? undefined}>
                  <span className="block truncate">{t.tenant?.name ?? 'Unknown'}</span>
                  <span className="block truncate text-xs text-muted-foreground">{personName(t.reporter) || 'Unknown reporter'}</span>
                </td>
                <td className="px-3 py-2.5"><TypeBadge type={t.type} /></td>
                <td className="px-3 py-2.5">
                  <StopRowClick><StatusSelect ticket={t} compact onRequestClose={onRequestClose} /></StopRowClick>
                </td>
                <td className="px-3 py-2.5"><UrgencyBadge urgency={t.urgency} /></td>
                <td className="px-3 py-2.5">
                  <StopRowClick><AssigneeSelect ticket={t} compact /></StopRowClick>
                </td>
                <td className="whitespace-nowrap py-2.5 pl-3 pr-4 text-muted-foreground sm:pr-6">
                  <time dateTime={t.last_activity_at}>{formatDate(t.last_activity_at)}</time>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="space-y-3 p-4 md:hidden" aria-label="Tickets">
        {pageRows.map((t) => (
          <li key={t.id} className="rounded-xl border border-border bg-card p-3">
            <div className="mb-1 flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-semibold text-muted-foreground">{ticketRef(t.ticket_number)}</span>
              <UrgencyBadge urgency={t.urgency} />
              <TypeBadge type={t.type} />
              {t.product !== 'unicorn' && <ProductBadge product={t.product} />}
            </div>
            <button
              type="button"
              onClick={() => onOpen(t.id)}
              className="min-h-11 w-full rounded text-left font-medium text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
            >
              {t.title}
            </button>
            <p className="mt-1 text-xs text-muted-foreground">
              {t.tenant?.name ?? 'Unknown'} · {personName(t.reporter) || 'Unknown reporter'} · <time dateTime={t.last_activity_at}>{formatDate(t.last_activity_at)}</time>
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <StatusSelect ticket={t} compact onRequestClose={onRequestClose} />
              <AssigneeSelect ticket={t} compact />
            </div>
          </li>
        ))}
      </ul>

      <nav aria-label="Pagination" className="flex items-center justify-between gap-2 border-t border-border px-4 py-3 text-sm text-muted-foreground sm:px-6">
        <span>
          Showing {(safePage - 1) * PAGE_SIZE + 1} to {Math.min(safePage * PAGE_SIZE, rows.length)} of {rows.length} {rows.length === 1 ? 'ticket' : 'tickets'}
        </span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="text-foreground min-h-11 sm:min-h-8" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>Previous</Button>
          <span aria-live="polite">Page {safePage} of {totalPages}</span>
          <Button variant="outline" size="sm" className="text-foreground min-h-11 sm:min-h-8" disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)}>Next</Button>
        </div>
      </nav>
    </div>
  );
}
