import type { ReactNode } from 'react';
import { format } from 'date-fns';
import { Bell, Briefcase, CalendarDays, CheckSquare, ChevronLeft, ExternalLink, Inbox, Megaphone, MessageSquare, Search, ShieldAlert, Target, UserRound, Video } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MessageAttachments } from '@/components/messaging/MessageAttachments';
import { cn } from '@/lib/utils';
import type { ConversationMessage, ConversationThread } from '@/hooks/useClientCommunications';
import type { ClientNotification } from '@/hooks/useClientNotifications';
import type { UnifiedInboxItem } from '@/hooks/useClientInbox';
import {
  NOTIFICATION_LABEL,
  THREAD_LABEL,
  ago,
  dayDivider,
  groupByDay,
  initialsOf,
  notificationKind,
  threadKind,
  type InboxStats,
  type NotificationKind,
  type ThreadKind,
} from './inboxFormat';

const THREAD_STYLE: Record<ThreadKind, { icon: typeof MessageSquare; chip: string; tile: string }> = {
  general: { icon: MessageSquare, chip: 'border-border bg-muted text-muted-foreground', tile: 'bg-muted text-muted-foreground' },
  package: { icon: Briefcase, chip: 'border-primary/30 bg-primary/10 text-[var(--badge-default-fg)]', tile: 'bg-primary/10 text-primary' },
  task: { icon: CheckSquare, chip: 'border-blue-500/30 bg-blue-500/15 text-blue-700 dark:text-blue-300', tile: 'bg-blue-500/15 text-blue-700 dark:text-blue-300' },
  rock: { icon: Target, chip: 'border-purple-500/30 bg-purple-500/15 text-purple-700 dark:text-purple-300', tile: 'bg-purple-500/15 text-purple-700 dark:text-purple-300' },
  broadcast: { icon: Megaphone, chip: 'border-amber-500/30 bg-amber-500/15 text-amber-800 dark:text-amber-300', tile: 'bg-amber-500/15 text-amber-800 dark:text-amber-300' },
  csc: { icon: UserRound, chip: 'border-primary/30 bg-primary/10 text-[var(--badge-default-fg)]', tile: 'bg-primary/10 text-primary' },
  direct: { icon: MessageSquare, chip: 'border-border bg-muted text-muted-foreground', tile: 'bg-muted text-muted-foreground' },
};

const NOTE_STYLE: Record<NotificationKind, { icon: typeof Bell; tile: string }> = {
  tasks: { icon: CheckSquare, tile: 'bg-blue-500/15 text-blue-700 dark:text-blue-300' },
  meetings: { icon: Video, tile: 'bg-violet-500/15 text-violet-700 dark:text-violet-300' },
  obligations: { icon: ShieldAlert, tile: 'bg-amber-500/15 text-amber-800 dark:text-amber-300' },
  events: { icon: CalendarDays, tile: 'bg-teal-500/15 text-teal-700 dark:text-teal-300' },
  other: { icon: Bell, tile: 'bg-muted text-muted-foreground' },
};

const GROUP_HEADING = 'px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground';

/** The purple banner: what the inbox is and what is waiting, with the action to start a message. */
export function InboxHeader({ unreadMessages, unreadNotifications, action }: { unreadMessages: number; unreadNotifications: number; action?: ReactNode }) {
  const total = unreadMessages + unreadNotifications;
  return (
    <section aria-label="Inbox summary" className="brand-surface flex flex-col gap-3 rounded-2xl bg-gradient-to-r from-[#44235F] to-[#7130A0] p-5 text-white sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold">Inbox</h1>
        <p className="mt-0.5 text-sm text-white/80">{total === 0 ? 'You are all caught up.' : `${total} ${total === 1 ? 'thing is' : 'things are'} waiting for you.`}</p>
        <ul className="mt-2 flex flex-wrap gap-2" aria-label="Unread">
          <li className="rounded-full bg-white/15 px-3 py-1 text-xs font-medium">{unreadMessages} unread {unreadMessages === 1 ? 'message' : 'messages'}</li>
          <li className="rounded-full bg-white/15 px-3 py-1 text-xs font-medium">{unreadNotifications} unread {unreadNotifications === 1 ? 'notification' : 'notifications'}</li>
        </ul>
      </div>
      {action}
    </section>
  );
}

/** A row of filter pills, each with an optional count. */
export function FilterPills<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: Array<{ value: T; label: string; count?: number }>; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            value === o.value ? 'border-primary bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground',
          )}
        >
          {o.label}
          {o.count !== undefined && o.count > 0 && <span className={cn('rounded-full px-1.5 text-[10px] tabular-nums', value === o.value ? 'bg-white/25' : 'bg-muted')}>{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative">
      <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} className="h-9 pl-8" />
    </div>
  );
}

function Tile({ icon: Icon, className }: { icon: typeof Bell; className: string }) {
  return <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', className)}><Icon className="h-4 w-4" aria-hidden /></span>;
}

export function ConversationRow({ conv, selected, onSelect }: { conv: ConversationThread; selected: boolean; onSelect: (c: ConversationThread) => void }) {
  const kind = threadKind(conv.type);
  const style = THREAD_STYLE[kind];
  return (
    <button
      type="button"
      onClick={() => onSelect(conv)}
      aria-current={selected ? 'true' : undefined}
      className={cn(
        'flex w-full items-start gap-3 border-l-2 px-3 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
        selected ? 'border-l-primary bg-muted/70' : conv.isUnread ? 'border-l-primary/60 bg-primary/5' : 'border-l-transparent',
      )}
    >
      <Tile icon={style.icon} className={style.tile} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className={cn('line-clamp-2 text-sm', conv.isUnread ? 'font-semibold text-foreground' : 'font-medium text-foreground/80')}>{conv.subject || conv.topic || 'General'}</p>
          <span className="shrink-0 pt-0.5 text-[11px] text-muted-foreground">{ago(conv.last_message_at)}</span>
        </div>
        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{conv.last_message_preview || 'No messages yet'}</p>
        <div className="mt-1.5 flex items-center gap-2">
          <Badge variant="outline" className={cn('px-1.5 py-0 text-[10px]', style.chip)}>{THREAD_LABEL[kind]}</Badge>
          {conv.isUnread && <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary"><span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />Unread</span>}
        </div>
      </div>
    </button>
  );
}

export function ThreadHeader({ conv, onBack }: { conv: ConversationThread; onBack: () => void }) {
  const kind = threadKind(conv.type);
  const style = THREAD_STYLE[kind];
  return (
    <div className="flex items-center gap-3 border-b px-4 py-3">
      <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 xl:hidden" onClick={onBack} aria-label="Back to conversations"><ChevronLeft className="h-5 w-5" /></Button>
      <Tile icon={style.icon} className={style.tile} />
      <div className="min-w-0 flex-1">
        <h2 className="line-clamp-2 font-semibold text-foreground">{conv.subject || conv.topic || 'General'}</h2>
        <p className="text-xs text-muted-foreground">{THREAD_LABEL[kind]}{conv.created_at ? ` · started ${format(new Date(conv.created_at), 'd MMM yyyy')}` : ''}</p>
      </div>
    </div>
  );
}

/** Messages as chat bubbles with the sender's avatar, grouped under a divider for each day. */
export function MessageBubbles({ messages, currentUserId }: { messages: ConversationMessage[]; currentUserId: string | null }) {
  let lastDay = '';
  return (
    <div className="space-y-3 p-4">
      {messages.map((msg) => {
        const own = msg.sender_id === currentUserId;
        const day = dayDivider(new Date(msg.created_at));
        const showDay = day !== lastDay;
        lastDay = day;
        return (
          <div key={msg.id}>
            {showDay && (
              <div className="my-2 flex items-center gap-3 text-[11px] font-medium text-muted-foreground" role="separator" aria-label={day}>
                <span className="h-px flex-1 bg-border" /><span>{day}</span><span className="h-px flex-1 bg-border" />
              </div>
            )}
            <div className={cn('flex items-end gap-2', own ? 'flex-row-reverse' : 'flex-row')}>
              <Avatar className="h-7 w-7 shrink-0">
                {msg.sender_avatar_url ? <AvatarImage src={msg.sender_avatar_url} alt="" /> : null}
                <AvatarFallback className="bg-primary/15 text-[10px] text-primary">{initialsOf(own ? 'You' : msg.sender_name)}</AvatarFallback>
              </Avatar>
              <div className={cn('max-w-[80%] rounded-2xl px-3.5 py-2', own ? 'rounded-br-sm bg-primary/15 text-foreground' : 'rounded-bl-sm bg-muted text-foreground')}>
                {!own && (
                  <p className="mb-0.5 flex flex-wrap items-center gap-x-1.5 text-xs font-semibold text-muted-foreground">
                    {msg.sender_name}
                    {msg.sender_is_staff && <span className="rounded-full bg-primary/15 px-1.5 py-0 text-[10px] font-semibold text-[var(--badge-default-fg)]">Vivacity</span>}
                  </p>
                )}
                <p className="whitespace-pre-wrap break-words text-sm">{msg.body}</p>
                {msg.attachments && msg.attachments.length > 0 && <MessageAttachments attachments={msg.attachments} />}
                <p className="mt-1 text-right text-[11px] text-muted-foreground">{format(new Date(msg.created_at), 'h:mm a')}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, hint }: { icon: typeof Bell; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 px-6 py-12 text-center text-muted-foreground">
      <Icon className="h-9 w-9 opacity-40" aria-hidden />
      <p className="text-sm font-medium text-foreground/80">{title}</p>
      {hint && <p className="max-w-xs text-xs">{hint}</p>}
    </div>
  );
}

/** Notifications under day headings, each with a coloured icon for what it is about. */
export function NotificationFeed({ items, onOpen }: { items: ClientNotification[]; onOpen: (n: ClientNotification) => void }) {
  return (
    <div className="space-y-5">
      {groupByDay(items, (n) => n.created_at).map((g) => (
        <section key={g.label} aria-label={g.label} className="space-y-2">
          <h3 className={GROUP_HEADING}>{g.label}</h3>
          <ul className="space-y-2">
            {g.items.map((n) => {
              const kind = notificationKind(n.type);
              const style = NOTE_STYLE[kind];
              return (
                <li key={n.id}>
                  <button type="button" onClick={() => onOpen(n)} className={cn('flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', n.is_read ? 'bg-card' : 'border-primary/30 bg-primary/5')}>
                    <Tile icon={style.icon} className={style.tile} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <p className={cn('text-sm text-foreground', n.is_read ? 'font-medium' : 'font-semibold')}>{n.title}</p>
                        {!n.is_read && <Badge variant="default" className="px-1.5 py-0 text-[10px]">New</Badge>}
                      </div>
                      {n.message && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.message}</p>}
                      <p className="mt-1 text-[11px] text-muted-foreground">{NOTIFICATION_LABEL[kind]} · {format(new Date(n.created_at), 'd MMM yyyy, h:mm a')}</p>
                    </div>
                    {n.link && <ExternalLink aria-hidden className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** Everything in one feed, messages and notifications together, under day headings. */
export function AllFeed({ items, onOpen }: { items: UnifiedInboxItem[]; onOpen: (i: UnifiedInboxItem) => void }) {
  return (
    <div className="space-y-5">
      {groupByDay(items, (i) => i.created_at).map((g) => (
        <section key={g.label} aria-label={g.label} className="space-y-2">
          <h3 className={GROUP_HEADING}>{g.label}</h3>
          <ul className="space-y-2">
            {g.items.map((i) => {
              const isMessage = i.item_type === 'message';
              return (
                <li key={`${i.item_type}-${i.id}`}>
                  <button type="button" onClick={() => onOpen(i)} className={cn('flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', i.is_read ? 'bg-card' : 'border-primary/30 bg-primary/5')}>
                    <Tile icon={isMessage ? MessageSquare : Bell} className={isMessage ? THREAD_STYLE.general.tile : NOTE_STYLE.other.tile} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <p className={cn('line-clamp-2 text-sm text-foreground', i.is_read ? 'font-medium' : 'font-semibold')}>{i.title || 'Untitled'}</p>
                        {!i.is_read && <Badge variant="default" className="px-1.5 py-0 text-[10px]">New</Badge>}
                      </div>
                      {i.body && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{i.body}</p>}
                      <p className="mt-1 text-[11px] text-muted-foreground">{isMessage ? 'Message' : 'Notification'} · {ago(i.created_at)}</p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function TabCard({ value, icon, title, unread, detail, insight }: { value: string; icon: typeof Bell; title: string; unread: number; detail: string; insight: string }) {
  return (
    <TabsTrigger
      value={value}
      className="h-auto w-full items-start justify-start whitespace-normal rounded-xl border bg-card p-4 text-left shadow-none transition-colors hover:border-primary/50 data-[state=active]:border-primary data-[state=active]:bg-primary/5 data-[state=active]:shadow-none data-[state=active]:ring-2 data-[state=active]:ring-primary/30"
    >
      <span className="flex w-full items-start gap-3">
        <Tile icon={icon} className={unread > 0 ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'} />
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</span>{' '}
          <span className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold tabular-nums text-foreground">{unread}</span>{' '}
            <span className="text-sm text-muted-foreground">unread</span>
          </span>
          {' '}<span className="block text-xs text-muted-foreground">{detail}</span>{' '}
          <span className="mt-1 block truncate text-xs text-foreground/80">{insight}</span>
        </span>
      </span>
    </TabsTrigger>
  );
}

const countOf = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The three views of the inbox as cards that say what is waiting in each, so the choice carries information. */
export function InboxTabCards({ stats }: { stats: InboxStats }) {
  const { all, messages, notifications } = stats;
  const noteBits = [
    notifications.tasksUnread > 0 ? countOf(notifications.tasksUnread, 'task') : '',
    notifications.obligationsUnread > 0 ? countOf(notifications.obligationsUnread, 'obligation') : '',
  ].filter(Boolean);
  return (
    <TabsList className="grid h-auto w-full grid-cols-1 gap-3 bg-transparent p-0 md:grid-cols-3">
      <TabCard
        value="all"
        icon={Inbox}
        title="Everything"
        unread={all.unread}
        detail={countOf(all.total, 'item')}
        insight={all.latestAt ? `Latest activity ${ago(all.latestAt)}` : 'Nothing here yet'}
      />
      <TabCard
        value="messages"
        icon={MessageSquare}
        title="Messages"
        unread={messages.unread}
        detail={countOf(messages.total, 'conversation')}
        insight={
          messages.fromVivacityUnread > 0
            ? `${messages.fromVivacityUnread} from Vivacity waiting`
            : messages.latestSubject
              ? `Latest: ${messages.latestSubject}${messages.latestAt ? `, ${ago(messages.latestAt)}` : ''}`
              : 'No conversations yet'
        }
      />
      <TabCard
        value="notifications"
        icon={Bell}
        title="Notifications"
        unread={notifications.unread}
        detail={countOf(notifications.total, 'notification')}
        insight={noteBits.length > 0 ? `${noteBits.join(', ')} to look at` : notifications.latestTitle ? `Latest: ${notifications.latestTitle}` : 'No notifications yet'}
      />
    </TabsList>
  );
}
