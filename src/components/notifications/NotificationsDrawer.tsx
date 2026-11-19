import { useMemo, useState, type ReactNode, type RefObject } from 'react';
import { ArrowLeft, Bell, CalendarClock, CheckCheck, ClipboardCheck, LifeBuoy, MessageSquare, Settings2, StickyNote, type LucideIcon } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { filterItems, groupByDay, plainText, typeCounts, typeLabel, type DrawerItem, type ReadView } from './drawerModel';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: readonly DrawerItem[];
  loading?: boolean;
  /** Called when a notification is chosen. The drawer closes first. */
  onOpenItem: (id: string) => void;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  /** "View all" at the bottom. */
  onViewAll?: () => void;
  /** When given, a gear in the header swaps the list for this (what you are notified about). */
  preferences?: ReactNode;
  onAllSettings?: () => void;
  /** The bell that opened the drawer. Focus goes back to it when the drawer closes, so keyboard users are not lost. */
  returnFocusTo?: RefObject<HTMLElement>;
}

function iconFor(type: string): LucideIcon {
  if (type === 'message') return MessageSquare;
  if (type.startsWith('note')) return StickyNote;
  if (type.includes('ticket')) return LifeBuoy;
  if (type.includes('meeting') || type.startsWith('event')) return CalendarClock;
  if (type.includes('task') || type.includes('obligation')) return ClipboardCheck;
  return Bell;
}

const iconButton =
  'flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/**
 * Notifications as a drawer on the right, the same for staff and clients: what is new at the top, grouped by day, one calm card
 * each. Choosing one opens it and closes the drawer; the card's own tick marks it read without leaving.
 */
export function NotificationsDrawer({ open, onOpenChange, items, loading, onOpenItem, onMarkRead, onMarkAllRead, onViewAll, preferences, onAllSettings, returnFocusTo }: Props) {
  const [view, setView] = useState<ReadView>('all');
  const [type, setType] = useState<string | null>(null);
  const [showPrefs, setShowPrefs] = useState(false);

  const unread = items.filter((n) => !n.isRead).length;
  const types = useMemo(() => typeCounts(items), [items]);
  // A type that has gone (all of them read and removed) must not leave the list empty with no way back.
  const activeType = type && types.some((t) => t.type === type) ? type : null;
  const groups = useMemo(() => groupByDay(filterItems(items, view, activeType)), [items, view, activeType]);

  const handleOpenChange = (next: boolean) => {
    if (!next) setShowPrefs(false);
    onOpenChange(next);
  };

  const choose = (id: string) => {
    onOpenChange(false);
    onOpenItem(id);
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        onCloseAutoFocus={(e) => {
          // There is no trigger inside the drawer to hand focus back to, so give it to the bell explicitly.
          if (returnFocusTo?.current) {
            e.preventDefault();
            returnFocusTo.current.focus();
          }
        }}
        className="flex w-full flex-col gap-0 overflow-hidden bg-background p-0 sm:max-w-[440px]">
        {showPrefs && preferences ? (
          <>
            <div className="flex items-center gap-2 border-b border-border px-4 py-4 pr-16">
              <button type="button" onClick={() => setShowPrefs(false)} aria-label="Back to notifications" className={iconButton}>
                <ArrowLeft className="h-4 w-4" />
              </button>
              <SheetTitle className="min-w-0 flex-1 truncate text-base font-semibold">What you are notified about</SheetTitle>
              {onAllSettings && (
                <button type="button" onClick={onAllSettings} className="text-xs font-medium text-primary hover:underline">
                  All settings
                </button>
              )}
            </div>
            <SheetDescription className="sr-only">Choose which notifications you receive.</SheetDescription>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">{preferences}</div>
          </>
        ) : (
          <>
            <div className="border-b border-border px-5 pb-4 pt-5 pr-16">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <SheetTitle className="text-lg font-semibold leading-tight">Notifications</SheetTitle>
                  <SheetDescription className="mt-0.5 text-xs text-muted-foreground">
                    {unread > 0 ? `${unread} unread` : 'You are all caught up'}
                  </SheetDescription>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {unread > 0 && (
                    <button type="button" onClick={onMarkAllRead} className={iconButton} aria-label="Mark all as read" title="Mark all as read">
                      <CheckCheck className="h-4 w-4" />
                    </button>
                  )}
                  {preferences && (
                    <button type="button" onClick={() => setShowPrefs(true)} className={iconButton} aria-label="Notification preferences" title="Choose what you are notified about">
                      <Settings2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              <div className="mt-4 flex items-center gap-2">
                <div role="group" aria-label="Show" className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5">
                  {(['all', 'unread'] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      aria-pressed={view === v}
                      onClick={() => setView(v)}
                      className={cn(
                        'rounded-md px-3 py-1 text-xs font-medium transition-colors',
                        view === v ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {v === 'all' ? 'All' : `Unread${unread > 0 ? ` ${unread}` : ''}`}
                    </button>
                  ))}
                </div>
                {types.length > 1 && (
                  <Select value={activeType ?? 'all'} onValueChange={(v) => setType(v === 'all' ? null : v)}>
                    <SelectTrigger aria-label="Type" className="ml-auto h-8 w-[170px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Every type</SelectItem>
                      {types.map((t) => (
                        <SelectItem key={t.type} value={t.type}>
                          {typeLabel(t.type)} ({t.count})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
              {loading ? (
                <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>
              ) : groups.length === 0 ? (
                <div className="flex flex-col items-center py-14 text-center">
                  <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <Bell className="h-5 w-5" />
                  </span>
                  <p className="text-sm font-medium text-foreground">{view === 'unread' ? 'Nothing unread' : 'No notifications yet'}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {view === 'unread' || activeType ? 'Try All, or another type.' : 'New activity will appear here.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-5">
                  {groups.map((g) => (
                    <section key={g.key} aria-label={g.label}>
                      <h3 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{g.label}</h3>
                      <ul className="space-y-2">
                        {g.items.map((n) => {
                          const Icon = iconFor(n.type);
                          return (
                            <li key={n.id} className="group relative">
                              <button
                                type="button"
                                onClick={() => choose(n.id)}
                                className={cn(
                                  'flex w-full items-start gap-3 rounded-xl border p-3 pr-10 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                  n.isRead ? 'border-border bg-card' : 'border-primary/30 bg-primary/5',
                                )}
                              >
                                <span className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', n.isRead ? 'bg-muted text-muted-foreground' : 'bg-primary/15 text-primary')}>
                                  <Icon className="h-4 w-4" />
                                </span>
                                <span className="min-w-0 flex-1">
                                  {n.tenantName && <span className="block truncate text-[11px] font-medium text-primary">{n.tenantName}</span>}
                                  <span className={cn('block text-sm leading-snug text-foreground', !n.isRead && 'font-semibold')}>{n.title || typeLabel(n.type)}</span>
                                  {plainText(n.message) && <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{plainText(n.message)}</span>}
                                  <span className="mt-1 block text-[11px] text-muted-foreground/80">
                                    {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                                  </span>
                                </span>
                              </button>
                              {!n.isRead && (
                                <button
                                  type="button"
                                  onClick={() => onMarkRead(n.id)}
                                  aria-label={`Mark "${n.title || typeLabel(n.type)}" as read`}
                                  title="Mark as read"
                                  className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                  <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-[#E5173F] group-hover:hidden group-focus-within:hidden" />
                                  <CheckCheck aria-hidden className="hidden h-3.5 w-3.5 group-hover:block group-focus-within:block" />
                                </button>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  ))}
                </div>
              )}
            </div>

            {onViewAll && (
              <div className="border-t border-border p-3">
                <button
                  type="button"
                  onClick={() => {
                    onOpenChange(false);
                    onViewAll();
                  }}
                  className="w-full rounded-lg py-2 text-center text-sm font-medium text-primary transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  View all notifications
                </button>
              </div>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
