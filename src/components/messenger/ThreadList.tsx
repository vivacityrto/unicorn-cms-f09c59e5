import { useMemo, useState, type ReactNode } from 'react';
import { Search } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { ago, initialsOf } from '@/components/client/inbox/inboxFormat';
import { cn } from '@/lib/utils';
import { THREAD_KIND_LABEL, filterThreads, kindsPresent, sortThreads, totalUnread, type ThreadFilter } from './messengerLogic';
import { BADGE_TONE, THREAD_STYLE } from './threadStyle';
import type { MessengerThread } from './types';

export function ThreadTile({ thread, className }: { thread: Pick<MessengerThread, 'kind' | 'avatarUrl' | 'title'>; className?: string }) {
  const { icon: Icon, tile } = THREAD_STYLE[thread.kind];
  if (thread.avatarUrl) {
    return (
      <Avatar className={cn('h-9 w-9 shrink-0', className)}>
        <AvatarImage src={thread.avatarUrl} alt="" />
        <AvatarFallback>{initialsOf(thread.title)}</AvatarFallback>
      </Avatar>
    );
  }
  return (
    <span aria-hidden className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', tile, className)}>
      <Icon className="h-4 w-4" />
    </span>
  );
}

export function ThreadRow({ thread, selected, onSelect }: { thread: MessengerThread; selected: boolean; onSelect: (id: string) => void }) {
  const count = thread.unread ? Math.max(thread.unreadCount ?? 1, 1) : 0;
  return (
    <button
      type="button"
      onClick={() => onSelect(thread.id)}
      aria-current={selected ? 'true' : undefined}
      className={cn(
        'flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        selected ? 'bg-muted' : thread.unread && 'bg-primary/5',
      )}
    >
      <ThreadTile thread={thread} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className={cn('truncate text-[13px]', thread.unread ? 'font-semibold text-foreground' : 'font-medium text-foreground/85')}>{thread.title}</p>
          <span className="shrink-0 text-[10px] text-muted-foreground">{ago(thread.lastActivityAt)}</span>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5">
          <p className={cn('line-clamp-1 flex-1 text-xs', thread.unread ? 'text-foreground/80' : 'text-muted-foreground')}>{thread.preview || 'No messages yet'}</p>
          {thread.badge && (
            <span className={cn('shrink-0 rounded-full border px-1.5 text-[10px] leading-4', BADGE_TONE[thread.badge.tone])}>{thread.badge.label}</span>
          )}
          {count > 0 && (
            <span aria-label={`${count} unread`} className="min-w-[1.125rem] shrink-0 rounded-full bg-primary px-1 text-center text-[10px] font-semibold leading-[1.125rem] text-primary-foreground">
              {count > 99 ? '99+' : count}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

interface ThreadListProps {
  threads: MessengerThread[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  isLoading?: boolean;
  /** Shown when there are no threads at all (not when a filter matches nothing). */
  empty?: ReactNode;
  /** A start-new-conversation control, shown beside the search box. */
  action?: ReactNode;
  className?: string;
}

/** Search, filter chips and the thread rows. Filter chips only appear for the kinds that exist. */
export function ThreadList({ threads, selectedId, onSelect, isLoading, empty, action, className }: ThreadListProps) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ThreadFilter>('all');
  const sorted = useMemo(() => sortThreads(threads), [threads]);
  const visible = useMemo(() => filterThreads(sorted, filter, query), [sorted, filter, query]);
  const unread = totalUnread(threads);
  const kinds = kindsPresent(threads);
  const chips: Array<{ value: ThreadFilter; label: string; count?: number }> = [
    { value: 'all', label: 'All' },
    { value: 'unread', label: 'Unread', count: unread },
    ...(kinds.length > 1 ? kinds.map((k) => ({ value: k as ThreadFilter, label: THREAD_KIND_LABEL[k] })) : []),
  ];

  return (
    <div className={cn('flex min-h-0 flex-col gap-2', className)}>
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search messages"
            aria-label="Search messages"
            className="h-8 w-full rounded-full border bg-background pl-8 pr-3 text-[13px] outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        {action}
      </div>
      {threads.length > 0 && (
        <div role="group" aria-label="Filter conversations" className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none]">
          {chips.map((c) => (
            <button
              key={c.value}
              type="button"
              aria-pressed={filter === c.value}
              onClick={() => setFilter(c.value)}
              className={cn(
                'inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                filter === c.value ? 'border-primary bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground',
              )}
            >
              {c.label}
              {c.count ? <span className={cn('rounded-full px-1 text-[10px] tabular-nums', filter === c.value ? 'bg-white/25' : 'bg-muted')}>{c.count}</span> : null}
            </button>
          ))}
        </div>
      )}
      <div className="-mx-1 min-h-0 flex-1 space-y-0.5 overflow-y-auto px-1" role="list" aria-label="Conversations">
        {isLoading && threads.length === 0 ? (
          [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)
        ) : threads.length === 0 ? (
          (empty ?? <p className="px-2 py-6 text-center text-xs text-muted-foreground">No conversations yet.</p>)
        ) : visible.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">Nothing matches.</p>
        ) : (
          visible.map((t) => (
            <div role="listitem" key={t.id}>
              <ThreadRow thread={t} selected={t.id === selectedId} onSelect={onSelect} />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
