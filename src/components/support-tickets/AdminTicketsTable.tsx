import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ArrowUpDown, ChevronUp, ChevronDown, Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AdminTicketRow } from './useAdminSupportTickets';

type SortKey = 'title' | 'client' | 'type' | 'status' | 'urgency' | 'created';
type SortDir = 'asc' | 'desc';

const STATUS_BADGE: Record<string, string> = {
  new: 'bg-gray-100 text-gray-600',
  triaged: 'bg-amber-100 text-amber-700',
  in_progress: 'bg-blue-100 text-blue-700',
  blocked: 'bg-red-100 text-red-700',
  resolved: 'bg-green-100 text-green-700',
  closed: 'bg-gray-200 text-gray-500',
};

const URGENCY_BADGE: Record<string, string> = {
  low: 'bg-gray-100 text-gray-500',
  medium: 'bg-blue-100 text-blue-600',
  high: 'bg-amber-100 text-amber-700',
  critical: 'bg-red-100 text-red-700',
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
  const [sortDir, setSortDir] = useState<SortDir>('asc');
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

  const Th = ({
    k, children, className,
  }: { k?: SortKey; children: React.ReactNode; className?: string }) => {
    const active = k && sortKey === k;
    const Arrow = active ? (sortDir === 'asc' ? ChevronUp : ChevronDown) : ArrowUpDown;
    return (
      <th
        className={cn(
          'text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3 text-left',
          className,
        )}
      >
        {k ? (
          <button
            onClick={() => toggleSort(k)}
            className="group inline-flex items-center gap-1 hover:text-gray-700"
          >
            {children}
            <Arrow
              className={cn(
                'h-3 w-3 transition-opacity',
                active ? 'opacity-100 text-gray-700' : 'opacity-0 group-hover:opacity-60',
              )}
            />
          </button>
        ) : children}
      </th>
    );
  };

  return (
    <div className="bg-white">
      <div className="overflow-x-auto">
        <table className="w-full">
          <colgroup>
            <col />
            <col className="w-36" />
            <col className="w-40" />
            <col className="w-36" />
            <col className="w-32" />
            <col className="w-24" />
            <col className="w-36" />
            <col className="w-28" />
          </colgroup>
          <thead className="bg-gray-50 border-b border-gray-200">
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
          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-gray-100">
                  {Array.from({ length: 8 }).map((__, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="animate-pulse bg-gray-200 h-4 rounded" />
                    </td>
                  ))}
                </tr>
              ))
            ) : pageRows.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-16 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <Inbox className="w-10 h-10 text-gray-300" />
                    <p className="text-gray-400 text-sm mt-3">No tickets match your filters</p>
                  </div>
                </td>
              </tr>
            ) : (
              pageRows.map((r) => {
                const statusCode = r.status?.code ?? '';
                const unread = r.is_client_visible === false && statusCode === 'new';
                return (
                  <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-sm">
                      <button
                        onClick={() => navigate(`/support-tickets/${r.id}`)}
                        className="font-medium text-gray-900 hover:text-[#7130A0] cursor-pointer text-left truncate max-w-[400px]"
                      >
                        {truncate(r.title, 55)}
                      </button>
                      {unread && (
                        <span className="bg-amber-100 text-amber-700 text-[10px] font-semibold px-1.5 py-0.5 rounded ml-2 align-middle">
                          Unread
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 truncate">
                      {r.tenant?.name ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {r.reporter?.full_name ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className="bg-gray-100 text-gray-700 text-xs font-medium px-2 py-0.5 rounded-full">
                        {r.item_type?.label ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className={cn(
                        'text-xs font-medium px-2 py-0.5 rounded-full',
                        STATUS_BADGE[statusCode] ?? 'bg-gray-100 text-gray-600',
                      )}>
                        {r.status?.label ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {r.urgency ? (
                        <span className={cn(
                          'text-xs font-medium px-2 py-0.5 rounded-full capitalize',
                          URGENCY_BADGE[r.urgency] ?? 'bg-gray-100 text-gray-600',
                        )}>
                          {r.urgency}
                        </span>
                      ) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {r.assignee?.full_name ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
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
        <div className="px-6 py-3 flex items-center justify-between border-t border-gray-100">
          <span className="text-sm text-gray-500">
            Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, sorted.length)} of {sorted.length} tickets
          </span>
          <div className="flex items-center gap-2">
            <button
              disabled={safePage <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="border border-gray-300 rounded-md px-3 py-1.5 text-xs font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Prev
            </button>
            <span className="text-xs text-gray-500">Page {safePage} of {totalPages}</span>
            <button
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="border border-gray-300 rounded-md px-3 py-1.5 text-xs font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
