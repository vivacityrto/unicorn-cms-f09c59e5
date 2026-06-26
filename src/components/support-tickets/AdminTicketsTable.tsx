import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ArrowUpDown, ChevronLeft, ChevronRight, Inbox } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { AdminTicketRow } from './useAdminSupportTickets';

type SortKey = 'title' | 'client' | 'type' | 'status' | 'urgency' | 'created';
type SortDir = 'asc' | 'desc';

const STATUS_BADGE: Record<string, string> = {
  new: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  triaged: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
  in_progress: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200',
  blocked: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200',
  resolved: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200',
  closed: 'bg-muted text-muted-foreground/80',
};

const URGENCY_BADGE: Record<string, string> = {
  low: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  medium: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200',
  high: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
  critical: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200',
};

const PAGE_SIZE = 25;

function truncate(s: string | null | undefined, n: number) {
  if (!s) return '';
  return s.length > n ? s.slice(0, n) + '…' : s;
}

interface Props {
  rows: AdminTicketRow[];
  isLoading: boolean;
}

export function AdminTicketsTable({ rows, isLoading }: Props) {
  const navigate = useNavigate();
  const [sortKey, setSortKey] = useState<SortKey>('created');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(1);

  const sorted = useMemo(() => {
    const get = (r: AdminTicketRow): string | number => {
      switch (sortKey) {
        case 'title': return (r.title ?? '').toLowerCase();
        case 'client': return (r.tenant?.name ?? '').toLowerCase();
        case 'type': return (r.item_type?.label ?? '').toLowerCase();
        case 'status': return (r.status?.label ?? '').toLowerCase();
        case 'urgency': return r.urgency ?? '';
        case 'created': return new Date(r.created_at).getTime();
      }
    };
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = get(a); const bv = get(b);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }, [rows, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir(key === 'created' ? 'desc' : 'asc'); }
  };

  const Th = ({ k, children, className }: { k?: SortKey; children: React.ReactNode; className?: string }) => (
    <th className={cn('px-3 py-2 text-left text-xs font-medium text-muted-foreground', className)}>
      {k ? (
        <button onClick={() => toggleSort(k)} className="inline-flex items-center gap-1 hover:text-foreground">
          {children}
          <ArrowUpDown className={cn('h-3 w-3', sortKey === k ? 'text-foreground' : 'opacity-50')} />
        </button>
      ) : children}
    </th>
  );

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 border-b">
            <tr>
              <Th k="title">Title</Th>
              <Th k="client">Client</Th>
              <Th>Submitted by</Th>
              <Th k="type">Type</Th>
              <Th k="status">Status</Th>
              <Th k="urgency">Urgency</Th>
              <Th>Assigned</Th>
              <Th k="created">Created</Th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 8 }).map((__, j) => (
                    <td key={j} className="px-3 py-3"><Skeleton className="h-4 w-full" /></td>
                  ))}
                </tr>
              ))
            ) : pageRows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-16 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Inbox className="h-10 w-10 opacity-40" />
                    <p className="text-sm">No support tickets match your filters</p>
                  </div>
                </td>
              </tr>
            ) : (
              pageRows.map((r) => {
                const statusCode = r.status?.code ?? '';
                const unread = r.is_client_visible === false && statusCode === 'new';
                return (
                  <tr key={r.id} className="hover:bg-muted/40 transition-colors">
                    <td className="px-3 py-2.5">
                      <button
                        onClick={() => navigate(`/support-tickets/${r.id}`)}
                        className="text-left font-medium text-foreground hover:text-[#7130A0] hover:underline"
                      >
                        {truncate(r.title, 60)}
                      </button>
                      {unread && (
                        <Badge className="ml-2 bg-amber-100 text-amber-800 hover:bg-amber-100 text-[10px] px-1.5 py-0">
                          Unread
                        </Badge>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">{truncate(r.tenant?.name ?? '—', 15)}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{r.reporter?.full_name ?? '—'}</td>
                    <td className="px-3 py-2.5">
                      <Badge variant="secondary" className="font-normal">{r.item_type?.label ?? '—'}</Badge>
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge className={cn('font-normal', STATUS_BADGE[statusCode] ?? 'bg-muted')}>
                        {r.status?.label ?? '—'}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5">
                      {r.urgency ? (
                        <Badge className={cn('font-normal capitalize', URGENCY_BADGE[r.urgency] ?? 'bg-muted')}>
                          {r.urgency}
                        </Badge>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">{r.assignee?.full_name ?? '—'}</td>
                    <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">
                      {format(new Date(r.created_at), 'dd MMM yyyy')}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {!isLoading && sorted.length > 0 && (
        <div className="flex items-center justify-between px-3 py-2 border-t bg-muted/20">
          <span className="text-xs text-muted-foreground">
            Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, sorted.length)} of {sorted.length}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={safePage <= 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs">Page {safePage} of {totalPages}</span>
            <Button variant="outline" size="sm" disabled={safePage >= totalPages} onClick={() => setPage((p) => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
