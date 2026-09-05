import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSuggestItems } from '@/hooks/useSuggestItems';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Loader2, Search } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const STATUS_CLASS: Record<string, string> = {
  new: 'bg-muted text-muted-foreground',
  triaged: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200',
  in_progress: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
  blocked: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200',
  resolved: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200',
  closed: 'bg-muted text-muted-foreground/70',
};

const URGENCY_CLASS: Record<string, string> = {
  low: 'bg-muted text-muted-foreground',
  medium: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200',
  high: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
  critical: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200',
};

interface Props {
  onSelect?: () => void;
}

export function SupportTicketsList({ onSelect }: Props) {
  const navigate = useNavigate();
  const { data: items, isLoading } = useSuggestItems();
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const list = items ?? [];
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter((i) => i.title.toLowerCase().includes(q));
  }, [items, search]);

  return (
    <div className="flex flex-col h-full">
      <div className="px-1 pb-3">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tickets…"
            className="h-8 text-xs pl-7"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            {search ? 'No matching tickets.' : 'No tickets yet.'}
          </div>
        ) : (
          <div className="divide-y">
            {filtered.map((item) => {
              const statusCode = item.status?.code ?? '';
              const urgency = item.urgency ?? item.priority?.code ?? '';
              return (
                <button
                  key={item.id}
                  className="w-full text-left px-3 py-2.5 hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => {
                    navigate(`/support-tickets/${item.id}`);
                    onSelect?.();
                  }}
                >
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.title}</p>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <Badge variant="outline" className={`text-[10px] h-5 border-0 ${STATUS_CLASS[statusCode] ?? 'bg-muted'}`}>
                          {item.status?.label ?? '—'}
                        </Badge>
                        <Badge variant="outline" className={`text-[10px] h-5 border-0 ${URGENCY_CLASS[urgency] ?? 'bg-muted'}`}>
                          {urgency || item.priority?.label || '—'}
                        </Badge>
                      </div>
                    </div>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap mt-0.5">
                      {formatDistanceToNow(new Date(item.updated_at), { addSuffix: true })}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="px-3 py-1.5 border-t bg-muted/30 text-[10px] text-muted-foreground text-center">
        {filtered.length} item{filtered.length !== 1 ? 's' : ''} · Drag header to reposition
      </div>
    </div>
  );
}
