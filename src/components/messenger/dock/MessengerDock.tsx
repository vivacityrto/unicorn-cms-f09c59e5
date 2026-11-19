import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Maximize2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ThreadList } from '../ThreadList';
import { UNREAD_BADGE_CLASS } from '../unreadBadge';
import { VivMessengerIcon } from '../VivMessengerIcon';
import { useMessengerDock } from './dockContext';
import type { MessengerThread } from '../types';

/* -------------------------------------------------------------------------- */
/*  The dock                                                                    */
/* -------------------------------------------------------------------------- */

export interface DockThreadApi {
  /** Back to the thread list. */
  onBack: () => void;
  /** Open this thread by id (used when a thread is created from another). */
  select: (id: string | null) => void;
  /** The "open full page" and close buttons, ready to drop into a thread header. */
  headerActions: ReactNode;
  /** True while this thread is the one on screen. */
  active: boolean;
}

export interface MessengerDockProps {
  threads: MessengerThread[];
  threadsLoading?: boolean;
  /** The number on the launcher. */
  unreadTotal: number;
  /** Draws one open thread. Called with that thread only. */
  renderThread: (thread: MessengerThread, api: DockThreadApi) => ReactNode;
  /** Thread ids that stay mounted once opened, so something in flight (an Ask Viv answer) survives going back to the list. */
  keepMounted?: readonly string[];
  /** Beside the search box, for example a "New message" button. */
  listAction?: ReactNode;
  /** Where the full-page version of the messenger (or of one thread) lives. Return null for none. */
  fullPageHref?: (thread: MessengerThread | null) => string | null;
  emptyThreads?: ReactNode;
  title?: string;
}

const ICON_BUTTON =
  'flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/**
 * The messenger bubble: a round launcher at the bottom right with an unread count, and a panel that opens in its place with
 * the thread list and the open conversation. The same component serves the client portal and the staff portal; each passes
 * its own threads and how to draw one. On a phone the panel fills the screen below the header.
 *
 * It sits above the pinned footer (about 25px) and clear of the back-to-top pill, which now sits at the top.
 */
export function MessengerDock({ threads, threadsLoading, unreadTotal, renderThread, keepMounted = [], listAction, fullPageHref, emptyThreads, title = 'Messages' }: MessengerDockProps) {
  const { open, selectedId, openDock, closeDock, select } = useMessengerDock();
  const panelRef = useRef<HTMLDivElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  const [visited, setVisited] = useState<ReadonlySet<string>>(new Set());

  const selected = threads.find((t) => t.id === selectedId) ?? null;

  // Remember which keep-mounted threads have been opened, so they are drawn once and then kept.
  useEffect(() => {
    if (open && selected && keepMounted.includes(selected.id) && !visited.has(selected.id)) {
      setVisited((prev) => new Set(prev).add(selected.id));
    }
  }, [open, selected, keepMounted, visited]);

  // Focus moves into the panel when it opens and back to the launcher when it closes.
  useEffect(() => {
    if (open) panelRef.current?.focus();
    else if (wasOpen.current) launcherRef.current?.focus();
    wasOpen.current = open;
  }, [open]);

  const api = (thread: MessengerThread): DockThreadApi => {
    const href = fullPageHref?.(thread) ?? null;
    return {
      onBack: () => select(null),
      select,
      active: open && selectedId === thread.id,
      headerActions: (
        <>
          {href && (
            <Link to={href} onClick={closeDock} className={ICON_BUTTON} aria-label="Open in the Inbox" title="Open in the Inbox">
              <Maximize2 className="h-4 w-4" aria-hidden />
            </Link>
          )}
          <button type="button" onClick={closeDock} className={ICON_BUTTON} aria-label="Close messages" title="Close">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </>
      ),
    };
  };

  const listHref = fullPageHref?.(null) ?? null;
  const unreadLabel = unreadTotal > 0 ? `Open messages, ${unreadTotal} unread` : 'Open messages';

  return (
    <>
      {/* Tells screen readers when something new arrives, without moving focus. */}
      <span className="sr-only" role="status" aria-live="polite">
        {unreadTotal > 0 ? `${unreadTotal} unread ${unreadTotal === 1 ? 'conversation' : 'conversations'}` : ''}
      </span>

      {!open && (
        <button
          ref={launcherRef}
          type="button"
          onClick={() => openDock()}
          aria-label={unreadLabel}
          title="Messages"
          className="fixed bottom-12 right-5 z-50 h-14 w-14 rounded-full shadow-lg shadow-primary/30 ring-1 ring-black/5 transition-transform duration-150 hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none dark:ring-white/10"
        >
          <VivMessengerIcon className="h-full w-full" />
          {unreadTotal > 0 && (
            <span aria-hidden className={cn('absolute -right-1 -top-1 flex h-[22px] min-w-[22px] items-center justify-center rounded-full px-1 text-[11px] font-bold leading-none tabular-nums', UNREAD_BADGE_CLASS)}>
              {unreadTotal > 99 ? '99+' : unreadTotal}
            </span>
          )}
        </button>
      )}

      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label={title}
          tabIndex={-1}
          onKeyDown={(e) => {
            if (e.key === 'Escape') closeDock();
          }}
          className={cn(
            'fixed z-50 flex flex-col overflow-hidden border bg-card text-card-foreground shadow-2xl outline-none',
            // Phone: fills the screen under the header. Larger screens: a panel in the launcher's place.
            'inset-x-0 bottom-0 top-11 rounded-none sm:inset-x-auto sm:bottom-12 sm:right-5 sm:top-auto sm:h-[min(620px,calc(100dvh-7rem))] sm:w-[400px] sm:rounded-2xl',
          )}
        >
          {keepMounted
            .filter((id) => visited.has(id))
            .map((id) => {
              const t = threads.find((x) => x.id === id);
              if (!t) return null;
              const shown = selected?.id === id;
              return (
                <div key={id} hidden={!shown} className={cn('min-h-0 flex-1 flex-col', shown ? 'flex' : 'hidden')}>
                  {renderThread(t, api(t))}
                </div>
              );
            })}

          {selected && !keepMounted.includes(selected.id) && <div className="flex min-h-0 flex-1 flex-col">{renderThread(selected, api(selected))}</div>}

          {!selected && (
            <div className="flex min-h-0 flex-1 flex-col">
              <header className="flex items-center gap-2 border-b px-3 py-2">
                <VivMessengerIcon className="h-8 w-8" />
                <h2 className="flex-1 text-sm font-semibold text-foreground">{title}</h2>
                {listHref && (
                  <Link to={listHref} onClick={closeDock} className={ICON_BUTTON} aria-label="Open in the Inbox" title="Open in the Inbox">
                    <Maximize2 className="h-4 w-4" aria-hidden />
                  </Link>
                )}
                <button type="button" onClick={closeDock} className={ICON_BUTTON} aria-label="Close messages" title="Close">
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </header>
              <div className="flex min-h-0 flex-1 flex-col p-2.5">
                <ThreadList threads={threads} selectedId={null} onSelect={(id) => select(id)} isLoading={threadsLoading} action={listAction} empty={emptyThreads} className="min-h-0 flex-1" />
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
