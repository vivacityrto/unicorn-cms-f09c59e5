import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Maximize2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ThreadList } from '../ThreadList';
import { UNREAD_BADGE_CLASS } from '../unreadBadge';
import { VivMessengerIcon } from '../VivMessengerIcon';
import { useMessengerDock } from './dockContext';
import {
  DRAG_THRESHOLD, EDGE_GAP, LAUNCHER_SIZE, clampTop, nudge, readPosition, settle, topFromRatio, writePosition,
  type DockPosition,
} from './dockPosition';
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

  // Where the bubble sits. Drag it anywhere; it snaps to the nearest edge when let go and is remembered on this device. With no
  // saved position it sits in the default corner (bottom right, above the footer).
  const [position, setPosition] = useState<DockPosition | null>(() => readPosition());
  const [dragAt, setDragAt] = useState<{ left: number; top: number } | null>(null);
  const press = useRef<{ x: number; y: number; offX: number; offY: number; moved: boolean } | null>(null);
  const justDragged = useRef(false);
  const [, setWindowSize] = useState(0);
  useEffect(() => {
    // A resize re-places the bubble inside the new window.
    const onResize = () => setWindowSize((n) => n + 1);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const move = useCallback((next: DockPosition | null) => {
    setPosition(next);
    writePosition(next);
  }, []);

  const onPointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    press.current = { x: e.clientX, y: e.clientY, offX: e.clientX - rect.left, offY: e.clientY - rect.top, moved: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const p = press.current;
    if (!p) return;
    if (!p.moved && Math.hypot(e.clientX - p.x, e.clientY - p.y) < DRAG_THRESHOLD) return;
    p.moved = true;
    setDragAt({
      left: Math.min(Math.max(e.clientX - p.offX, 0), window.innerWidth - LAUNCHER_SIZE),
      top: clampTop(e.clientY - p.offY, window.innerHeight),
    });
  };
  const endPress = (e: ReactPointerEvent<HTMLButtonElement>, dropped: boolean) => {
    const p = press.current;
    press.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    if (p?.moved && dropped) {
      const left = Math.min(Math.max(e.clientX - p.offX, 0), window.innerWidth - LAUNCHER_SIZE);
      move(settle(left, e.clientY - p.offY, window.innerWidth, window.innerHeight));
      // The click that follows a drag must not open the bubble.
      justDragged.current = true;
      setTimeout(() => { justDragged.current = false; }, 0);
    }
    setDragAt(null);
  };
  const onLauncherKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!e.shiftKey) return;
    if (e.key === 'Home') {
      e.preventDefault();
      move(null);
      return;
    }
    const next = nudge(position, e.key, window.innerHeight);
    if (next) {
      e.preventDefault();
      move(next);
    }
  };

  const side = position?.side ?? 'right';
  const launcherStyle = dragAt
    ? { left: dragAt.left, top: dragAt.top }
    : position
      ? { top: topFromRatio(position.y, window.innerHeight), [position.side]: EDGE_GAP }
      : undefined;
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

  // Once a keep-mounted thread has been opened the panel stays in the page, hidden, when the dock is closed, so an answer
  // still on its way (Ask Viv) is not lost by closing and reopening the bubble.
  const panelInPage = open || visited.size > 0;
  const listHref = fullPageHref?.(null) ?? null;
  const unreadLabel = unreadTotal > 0 ? `Open messages, ${unreadTotal} unread` : 'Open messages';

  return (
    <>
      {/* Tells screen readers when something new arrives, without moving focus. */}
      <span className="sr-only" role="status" aria-live="polite">
        {unreadTotal > 0 ? `${unreadTotal} unread ${unreadTotal === 1 ? 'conversation' : 'conversations'}` : ''}
      </span>

      <span id="messenger-dock-move-hint" className="sr-only">
        Drag to move the messages button out of the way. Or hold Shift and use the arrow keys, and Shift with Home to put it back.
      </span>

      {!open && (
        <button
          ref={launcherRef}
          type="button"
          onClick={() => {
            if (!justDragged.current) openDock();
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={(e) => endPress(e, true)}
          onPointerCancel={(e) => endPress(e, false)}
          onKeyDown={onLauncherKeyDown}
          aria-label={unreadLabel}
          aria-describedby="messenger-dock-move-hint"
          title="Messages (drag to move)"
          style={launcherStyle}
          className={cn(
            'fixed z-50 h-14 w-14 touch-none select-none rounded-full shadow-lg shadow-primary/30 ring-1 ring-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none dark:ring-white/10',
            !launcherStyle && 'bottom-12 right-5',
            dragAt ? 'cursor-grabbing scale-110 shadow-xl' : 'cursor-grab transition-transform duration-150 hover:scale-105',
          )}
        >
          <VivMessengerIcon className="h-full w-full" />
          {unreadTotal > 0 && (
            <span aria-hidden className={cn('absolute -right-1 -top-1 flex h-[22px] min-w-[22px] items-center justify-center rounded-full px-1 text-[11px] font-bold leading-none tabular-nums', UNREAD_BADGE_CLASS)}>
              {unreadTotal > 99 ? '99+' : unreadTotal}
            </span>
          )}
        </button>
      )}

      {panelInPage && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label={title}
          hidden={!open}
          tabIndex={-1}
          onKeyDown={(e) => {
            // A menu inside the panel (the Type filter) closes itself on Escape. Its content is drawn outside the panel, but React
            // still hands the key to the panel, so ignore a key that something already handled or that did not start inside it.
            if (e.key === 'Escape' && !e.defaultPrevented && e.currentTarget.contains(e.target as Node)) closeDock();
          }}
          className={cn(
            'fixed z-50 flex-col overflow-hidden border bg-card text-card-foreground shadow-2xl outline-none',
            open ? 'flex' : 'hidden',
            // Phone: fills the screen under the header. Larger screens: a panel in the launcher's place.
            'inset-x-0 bottom-0 top-11 rounded-none sm:inset-x-auto sm:bottom-12 sm:top-auto sm:h-[min(620px,calc(100dvh-7rem))] sm:w-[400px] sm:rounded-2xl',
            // The panel opens on the same side as the bubble.
            side === 'left' ? 'sm:left-5 sm:right-auto' : 'sm:right-5 sm:left-auto',
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

          {open && selected && !keepMounted.includes(selected.id) && <div className="flex min-h-0 flex-1 flex-col">{renderThread(selected, api(selected))}</div>}

          {open && !selected && (
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
