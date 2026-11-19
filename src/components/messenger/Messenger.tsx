import type { ReactNode } from 'react';
import { MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ConversationPane, type ConversationPaneProps } from './ConversationPane';
import { ThreadList } from './ThreadList';
import type { MessengerThread } from './types';

export interface MessengerProps {
  threads: MessengerThread[];
  threadsLoading?: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /**
   * The open conversation when it is not in `threads` (a filter has taken it out of the list). It stays open until you close it,
   * rather than vanishing from under you, and the list shows only what the filter says.
   */
  openThread?: MessengerThread | null;
  /**
   * The open thread's data and actions (from its source). Omit while nothing is selected.
   * `page`: list and conversation side by side from the xl breakpoint, one at a time below it.
   * `dock`: always one at a time, sized for the bubble.
   */
  conversation?: Omit<ConversationPaneProps, 'thread' | 'onBack'>;
  mode?: 'page' | 'dock';
  /** Beside the search box, for example a "New message" icon button. */
  listAction?: ReactNode;
  emptyThreads?: ReactNode;
  /** Shown in the conversation area on wide screens when nothing is selected. */
  emptySelection?: ReactNode;
  /** A new message being written. Takes the conversation area until it is sent or closed (a page's "New message"). */
  compose?: ReactNode;
  className?: string;
}

/**
 * The messenger shell: thread list plus open conversation. It owns layout only; data and actions come from the host,
 * so the client Inbox, the bubble, staff Communications and a client's Messages tab all share this.
 */
export function Messenger({ threads, threadsLoading, selectedId, onSelect, openThread, conversation, mode = 'page', listAction, emptyThreads, emptySelection, compose, className }: MessengerProps) {
  const composing = !!compose;
  const selected = composing ? null : threads.find((t) => t.id === selectedId) ?? (openThread && openThread.id === selectedId ? openThread : null);
  const dock = mode === 'dock';
  const showList = dock ? !selected : true;
  const showPane = dock ? !!selected : true;

  return (
    <div className={cn('flex min-h-0 overflow-hidden', dock ? 'flex-col' : 'rounded-2xl border bg-card xl:grid xl:grid-cols-[22rem_1fr]', className)}>
      {showList && (
        <section aria-label="Conversations" className={cn('flex min-h-0 flex-col p-2.5', !dock && 'xl:border-r', !dock && (selected || composing) && 'hidden xl:flex', dock && 'flex-1')}>
          <ThreadList threads={threads} selectedId={selectedId} onSelect={onSelect} isLoading={threadsLoading} action={listAction} empty={emptyThreads} className="min-h-0 flex-1" />
        </section>
      )}
      {showPane && (
        <div className={cn('flex min-h-0 flex-1 flex-col', !dock && !selected && !composing && 'hidden xl:flex')}>
          {composing ? (
            compose
          ) : selected && conversation ? (
            <ConversationPane key={selected.id} thread={selected} onBack={() => onSelect(null)} backClassName={dock ? undefined : 'xl:hidden'} {...conversation} />
          ) : (
            (emptySelection ?? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-muted-foreground">
                <MessageSquare aria-hidden className="h-8 w-8" />
                <p className="text-sm">Select a conversation</p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
