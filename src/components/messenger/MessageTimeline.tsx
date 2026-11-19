import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { format } from 'date-fns';
import { ArrowDown, FileText, RotateCw } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { initialsOf } from '@/components/client/inbox/inboxFormat';
import { cn } from '@/lib/utils';
import { buildTimeline, seenSummary, typingLabel } from './messengerLogic';
import type { MessengerMessage, MessengerPerson } from './types';

const URL_RE = /(https?:\/\/[^\s<>"']+)/g;

/** Message text as text. Only http(s) links become links; nothing the sender typed is ever treated as markup. */
export function MessageText({ body }: { body: string }) {
  return (
    <>
      {body.split(URL_RE).map((part, i) =>
        i % 2 === 1 ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 break-all">
            {part}
          </a>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}

function DefaultAttachments({ message }: { message: MessengerMessage }) {
  if (!message.attachments?.length) return null;
  return (
    <ul className="mt-1 flex flex-wrap gap-1.5">
      {message.attachments.map((a) => (
        <li key={a.id} className="inline-flex max-w-[14rem] items-center gap-1 rounded-md bg-black/10 px-1.5 py-0.5 text-[11px] dark:bg-white/10">
          <FileText aria-hidden className="h-3 w-3 shrink-0" />
          {a.url ? (
            <a href={a.url} target="_blank" rel="noopener noreferrer" className="truncate underline underline-offset-2">{a.name}</a>
          ) : (
            <span className="truncate">{a.name}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

interface TimelineProps {
  messages: MessengerMessage[];
  isLoading?: boolean;
  people?: MessengerPerson[];
  /** Others' messages after this show a "New messages" divider and the thread opens there. */
  unreadAfter?: string | null;
  typingNames?: string[];
  showSeen?: boolean;
  /** How many of the newest messages are drawn first; "Show earlier" adds more. */
  pageSize?: number;
  hasOlder?: boolean;
  onLoadOlder?: () => void;
  onRetry?: (messageId: string) => void;
  /** Lets the host draw attachments with its own signed-URL component. */
  renderAttachments?: (message: MessengerMessage) => ReactNode;
  /** Draws the bubbles for a "thinking" bot reply and similar host-owned rows after the last message. */
  footer?: ReactNode;
  empty?: ReactNode;
  className?: string;
}

/** The conversation body: grouped bubbles, day dividers, "New messages", Seen, typing, and a jump-to-latest pill. */
export function MessageTimeline({ messages, isLoading, people, unreadAfter, typingNames, showSeen = true, pageSize = 60, hasOlder, onLoadOlder, onRetry, renderAttachments, footer, empty, className }: TimelineProps) {
  const [shown, setShown] = useState(pageSize);
  const scroller = useRef<HTMLDivElement>(null);
  const [away, setAway] = useState(false);
  // Whether the reader was at the bottom before the newest message was drawn. Measured on scroll, not after the new
  // message has already made the content taller, so a tall message does not look like the reader had scrolled away.
  const atBottom = useRef(true);
  const lastId = messages[messages.length - 1]?.id;

  const slice = useMemo(() => (messages.length > shown ? messages.slice(messages.length - shown) : messages), [messages, shown]);
  const timeline = useMemo(() => buildTimeline(slice, { unreadAfter }), [slice, unreadAfter]);
  const seen = useMemo(() => (showSeen ? seenSummary(messages, people) : null), [messages, people, showSeen]);
  const typing = typingLabel(typingNames ?? []);
  const hiddenCount = messages.length - slice.length;

  const toBottom = (smooth = false) => {
    const el = scroller.current;
    if (el) {
      // Older browsers and test environments have no scrollTo on elements.
      if (typeof el.scrollTo === 'function') el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
      else el.scrollTop = el.scrollHeight;
    }
    atBottom.current = true;
  };

  // Open at the first unread message, otherwise at the latest.
  const opened = useRef(false);
  // The newest message the open or the follow logic has already dealt with, so opening a thread is not also treated as
  // "a new message arrived" (which would scroll past the unread divider straight to the bottom).
  const handledLastId = useRef<string | undefined>(undefined);
  useLayoutEffect(() => {
    if (opened.current || messages.length === 0) return;
    opened.current = true;
    handledLastId.current = lastId;
    const marker = scroller.current?.querySelector('[data-unread-divider]');
    if (marker) {
      atBottom.current = false;
      marker.scrollIntoView({ block: 'start' });
    } else toBottom();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  // A new message follows you down if you were already at the bottom; otherwise the pill offers it.
  useEffect(() => {
    if (!opened.current || handledLastId.current === lastId) return;
    handledLastId.current = lastId;
    const mine = messages[messages.length - 1]?.fromMe;
    if (atBottom.current || mine) toBottom(true);
    else setAway(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastId]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
    atBottom.current = gap < 140;
    if (gap < 80) setAway(false);
  };

  if (isLoading && messages.length === 0) {
    return (
      <div className={cn('flex-1 space-y-3 p-4', className)}>
        {[0, 1, 2].map((i) => <Skeleton key={i} className={cn('h-10 rounded-2xl', i % 2 ? 'ml-auto w-1/2' : 'w-2/3')} />)}
      </div>
    );
  }

  return (
    <div className={cn('relative flex min-h-0 flex-1 flex-col', className)}>
      <div ref={scroller} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto px-3 py-3" role="log" aria-live="polite" aria-label="Messages">
        {(hiddenCount > 0 || hasOlder) && (
          <button
            type="button"
            onClick={() => (hiddenCount > 0 ? setShown((n) => n + pageSize) : onLoadOlder?.())}
            className="mx-auto mb-3 block rounded-full border bg-card px-3 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Show earlier messages
          </button>
        )}
        {messages.length === 0 && (empty ?? <p className="py-10 text-center text-xs text-muted-foreground">No messages yet. Say hello.</p>)}
        {timeline.map((item) => {
          if (item.type === 'day') {
            return (
              <div key={item.key} className="my-3 flex items-center gap-3 text-[11px] font-medium text-muted-foreground" role="separator">
                <span className="h-px flex-1 bg-border" />{item.label}<span className="h-px flex-1 bg-border" />
              </div>
            );
          }
          if (item.type === 'unread') {
            return (
              <div key={item.key} data-unread-divider className="my-3 flex items-center gap-3 text-[11px] font-semibold text-primary" role="separator">
                <span className="h-px flex-1 bg-primary/40" />New messages<span className="h-px flex-1 bg-primary/40" />
              </div>
            );
          }
          return (
            <div key={item.key} className={cn('mb-2 flex items-end gap-2', item.fromMe ? 'justify-end' : 'justify-start')}>
              {!item.fromMe && (
                <Avatar className="mb-0.5 h-7 w-7 shrink-0">
                  {item.senderAvatarUrl && <AvatarImage src={item.senderAvatarUrl} alt="" />}
                  <AvatarFallback className="text-[10px]">{initialsOf(item.senderName)}</AvatarFallback>
                </Avatar>
              )}
              <div className={cn('flex max-w-[82%] flex-col gap-0.5', item.fromMe ? 'items-end' : 'items-start')}>
                {!item.fromMe && (
                  <span className="px-1 text-[11px] text-muted-foreground">
                    {item.senderName}
                    {item.senderRole === 'staff' && <span className="ml-1.5 rounded bg-cyan-500/15 px-1 text-[10px] font-medium text-cyan-700 dark:text-cyan-300">Vivacity</span>}
                  </span>
                )}
                {item.messages.map((m, i) => {
                  const last = i === item.messages.length - 1;
                  return (
                    <div key={m.id} className={cn('flex flex-col', item.fromMe ? 'items-end' : 'items-start')}>
                      <div
                        className={cn(
                          'whitespace-pre-wrap break-words rounded-2xl px-3 py-1.5 text-[13px] leading-snug',
                          item.fromMe ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground',
                          item.fromMe ? (last ? 'rounded-br-md' : '') : last ? 'rounded-bl-md' : '',
                          m.delivery === 'sending' && 'opacity-60',
                          m.delivery === 'failed' && 'ring-1 ring-destructive',
                        )}
                      >
                        {m.body && <MessageText body={m.body} />}
                        {renderAttachments ? renderAttachments(m) : <DefaultAttachments message={m} />}
                      </div>
                      {last && (
                        <span className="mt-0.5 px-1 text-[10px] text-muted-foreground">
                          {format(new Date(m.createdAt), 'h:mm a')}
                          {seen?.messageId === m.id && <span className="ml-1.5">· {seen.label}</span>}
                          {m.delivery === 'sending' && <span className="ml-1.5">· Sending…</span>}
                        </span>
                      )}
                      {m.delivery === 'failed' && (
                        <button type="button" onClick={() => onRetry?.(m.id)} className="mt-0.5 inline-flex items-center gap-1 px-1 text-[11px] font-medium text-destructive hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                          <RotateCw aria-hidden className="h-3 w-3" />Not sent. Retry
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        {footer}
        {typing && <p className="px-1 pb-1 text-[11px] italic text-muted-foreground" aria-live="polite">{typing}</p>}
      </div>
      {away && (
        <button
          type="button"
          onClick={() => { toBottom(true); setAway(false); }}
          aria-label="Jump to latest message"
          className="absolute bottom-3 right-3 inline-flex h-8 items-center gap-1 rounded-full border bg-card px-2.5 text-[11px] font-medium text-foreground shadow-md hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowDown aria-hidden className="h-3.5 w-3.5" />New
        </button>
      )}
    </div>
  );
}
