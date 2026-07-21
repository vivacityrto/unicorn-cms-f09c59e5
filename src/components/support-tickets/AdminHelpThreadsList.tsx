import { useMemo, useState } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { Inbox, Search, MessageSquare, Building2, User } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { AdminHelpThreadRow } from './useAdminHelpThreads';

const STATUS_DOT: Record<string, string> = {
  open: 'bg-blue-500',
  resolved: 'bg-green-500',
  closed: 'bg-gray-400',
};

const STATUS_LABEL_CLASS: Record<string, string> = {
  open: 'text-blue-700',
  resolved: 'text-green-700',
  closed: 'text-gray-500',
};

function truncate(s: string | null | undefined, n: number) {
  if (!s) return '';
  return s.length > n ? s.slice(0, n) + '…' : s;
}

interface Props {
  rows: AdminHelpThreadRow[];
  isLoading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** When a thread is open in the side panel the list gets narrower — hides Created column. */
  compact?: boolean;
}

export function AdminHelpThreadsList({ rows, isLoading, selectedId, onSelect, compact }: Props) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'open' | 'unanswered' | 'all'>('open');

  const counts = useMemo(() => {
    let open = 0;
    let unanswered = 0;
    rows.forEach((r) => {
      if (r.status === 'open') open += 1;
      if (r.status === 'open' && r.unanswered) unanswered += 1;
    });
    return { open, unanswered, all: rows.length };
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter === 'open' && r.status !== 'open') return false;
      if (statusFilter === 'unanswered' && !(r.status === 'open' && r.unanswered)) return false;
      if (!q) return true;
      const hay = [
        r.subject ?? '',
        r.first_user_message ?? '',
        r.tenant?.name ?? '',
        r.reporter?.full_name ?? '',
        r.reporter?.email ?? '',
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search, statusFilter]);

  return (
    <div className="bg-white h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search subject, client, or reporter…"
            className="h-9 text-sm pl-8"
          />
        </div>
        <div className="flex items-center gap-1">
          {([
            { key: 'unanswered' as const, label: 'Unanswered', count: counts.unanswered },
            { key: 'open' as const, label: 'Open', count: counts.open },
            { key: 'all' as const, label: 'All', count: counts.all },
          ]).map((f) => {
            const active = statusFilter === f.key;
            return (
              <button
                key={f.key}
                onClick={() => setStatusFilter(f.key)}
                className={cn(
                  'text-xs font-medium px-2.5 py-1.5 rounded-md border transition-colors inline-flex items-center gap-1.5',
                  active
                    ? 'bg-[#7130A0] text-white border-[#7130A0]'
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50',
                )}
              >
                {f.label}
                <span className={cn(
                  'text-[10px] font-semibold rounded-full px-1.5 min-w-[18px] text-center leading-4',
                  active ? 'bg-white/25 text-white' : 'bg-gray-100 text-gray-600',
                )}>
                  {f.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Rows */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="divide-y divide-gray-100">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="px-4 py-3">
                <div className="animate-pulse bg-gray-200 h-4 w-2/3 rounded mb-2" />
                <div className="animate-pulse bg-gray-100 h-3 w-1/3 rounded" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-20 text-center">
            <Inbox className="w-10 h-10 text-gray-300 mx-auto" />
            <p className="text-gray-400 text-sm mt-3">
              {rows.length === 0 ? 'No client messages yet' : 'No messages match your filters'}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {filtered.map((r) => {
              const isSelected = selectedId === r.id;
              const showUnanswered = r.unanswered && r.status === 'open';
              const subjectText = r.subject || r.first_user_message || '(No subject)';
              const statusKey = r.status ?? 'open';
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(r.id)}
                    className={cn(
                      'w-full text-left px-4 py-3 transition-colors flex flex-col gap-1',
                      isSelected
                        ? 'bg-purple-50 border-l-2 border-[#7130A0] pl-[14px]'
                        : 'hover:bg-gray-50 border-l-2 border-transparent',
                    )}
                  >
                    {/* Row 1: subject + unanswered pill + last activity */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className={cn('h-1.5 w-1.5 rounded-full flex-none', STATUS_DOT[statusKey] ?? 'bg-gray-400')} />
                        <span className="font-medium text-sm text-gray-900 truncate">
                          {truncate(subjectText, compact ? 60 : 90)}
                        </span>
                        {showUnanswered && (
                          <span className="bg-amber-100 text-amber-700 text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide flex-none">
                            New
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-gray-500 whitespace-nowrap flex-none pt-0.5">
                        {r.last_message_at
                          ? formatDistanceToNow(new Date(r.last_message_at), { addSuffix: true })
                          : formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                      </span>
                    </div>

                    {/* Row 2: meta */}
                    <div className="flex items-center gap-3 text-xs text-gray-500 min-w-0">
                      <span className="inline-flex items-center gap-1 min-w-0 max-w-[45%]">
                        <Building2 className="h-3 w-3 flex-none" />
                        <span className="truncate">{r.tenant?.name ?? 'Unknown client'}</span>
                      </span>
                      <span className="inline-flex items-center gap-1 min-w-0 max-w-[35%]">
                        <User className="h-3 w-3 flex-none" />
                        <span className="truncate">
                          {r.reporter?.full_name ?? r.reporter?.email ?? 'Unknown'}
                        </span>
                      </span>
                      <span className="inline-flex items-center gap-1 flex-none">
                        <MessageSquare className="h-3 w-3" />
                        {r.message_count}
                      </span>
                      {!compact && (
                        <>
                          <span className="text-gray-300">·</span>
                          <span className="whitespace-nowrap">
                            {format(new Date(r.created_at), 'dd MMM yyyy')}
                          </span>
                        </>
                      )}
                      <span className="ml-auto flex-none">
                        <span className={cn(
                          'text-[10px] font-medium capitalize',
                          STATUS_LABEL_CLASS[statusKey] ?? 'text-gray-500',
                        )}>
                          {statusKey}
                        </span>
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {!isLoading && filtered.length > 0 && (
        <div className="px-4 py-2 border-t border-gray-100 text-[11px] text-gray-500 bg-gray-50">
          Showing {filtered.length} of {rows.length} thread{rows.length === 1 ? '' : 's'}
        </div>
      )}
    </div>
  );
}
