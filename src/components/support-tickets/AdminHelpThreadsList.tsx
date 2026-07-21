import { useMemo, useState } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { Inbox, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { AdminHelpThreadRow } from './useAdminHelpThreads';

const STATUS_BADGE: Record<string, string> = {
  open: 'bg-blue-100 text-blue-700',
  resolved: 'bg-green-100 text-green-700',
  closed: 'bg-gray-200 text-gray-500',
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
}

export function AdminHelpThreadsList({ rows, isLoading, selectedId, onSelect }: Props) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'open' | 'all'>('open');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter === 'open' && r.status !== 'open') return false;
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
    <div className="bg-white">
      <div className="flex items-center gap-3 px-6 py-3 border-b border-gray-100">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search subject, client, or reporter…"
            className="h-9 text-sm pl-8"
          />
        </div>
        <div className="flex items-center gap-1">
          {(['open', 'all'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                'text-xs font-medium px-3 py-1.5 rounded-md border transition-colors',
                statusFilter === s
                  ? 'bg-[#7130A0] text-white border-[#7130A0]'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50',
              )}
            >
              {s === 'open' ? 'Open only' : 'All'}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3 text-left">Subject</th>
              <th className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3 text-left w-40">Client</th>
              <th className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3 text-left w-40">Submitted by</th>
              <th className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3 text-left w-28">Status</th>
              <th className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3 text-left w-28">Created</th>
              <th className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3 text-left w-32">Last activity</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-gray-100">
                  {Array.from({ length: 6 }).map((__, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="animate-pulse bg-gray-200 h-4 rounded" />
                    </td>
                  ))}
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-16 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <Inbox className="w-10 h-10 text-gray-300" />
                    <p className="text-gray-400 text-sm mt-3">No client messages match your filters</p>
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map((r) => {
                const isSelected = selectedId === r.id;
                const showUnanswered = r.unanswered && r.status === 'open';
                const subjectText = r.subject || r.first_user_message || '(No subject)';
                return (
                  <tr
                    key={r.id}
                    onClick={() => onSelect(r.id)}
                    className={cn(
                      'border-b border-gray-100 cursor-pointer transition-colors',
                      isSelected ? 'bg-purple-50' : 'hover:bg-gray-50',
                    )}
                  >
                    <td className="px-4 py-3 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900 truncate max-w-[400px]">
                          {truncate(subjectText, 70)}
                        </span>
                        {showUnanswered && (
                          <span className="bg-amber-100 text-amber-700 text-[10px] font-semibold px-1.5 py-0.5 rounded">
                            Unanswered
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 truncate">
                      {r.tenant?.name ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 truncate">
                      {r.reporter?.full_name ?? r.reporter?.email ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className={cn(
                        'text-xs font-medium px-2 py-0.5 rounded-full capitalize',
                        STATUS_BADGE[r.status ?? ''] ?? 'bg-gray-100 text-gray-600',
                      )}>
                        {r.status ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                      {format(new Date(r.created_at), 'dd MMM yyyy')}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                      {r.last_message_at
                        ? formatDistanceToNow(new Date(r.last_message_at), { addSuffix: true })
                        : '—'}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
