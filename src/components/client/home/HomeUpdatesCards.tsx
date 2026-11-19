import { useState } from 'react';
import { ArrowRight, Globe, Megaphone } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useClientHomeBroadcasts, useClientHomeRegulatoryUpdates, type HomeBroadcast, type HomeRegulatoryUpdate } from '@/hooks/use-client-home-updates';

const SECTION = 'text-sm font-semibold uppercase tracking-wide text-muted-foreground';

const IMPACT: Record<string, { label: string; className: string }> = {
  low: { label: 'Low impact', className: 'border-blue-500/30 bg-blue-500/15 text-blue-700 dark:text-blue-300' },
  moderate: { label: 'Moderate impact', className: 'border-yellow-500/30 bg-yellow-500/15 text-yellow-800 dark:text-yellow-300' },
  high: { label: 'High impact', className: 'border-orange-500/30 bg-orange-500/15 text-orange-800 dark:text-orange-300' },
  critical: { label: 'Critical impact', className: 'border-red-500/30 bg-red-500/15 text-red-700 dark:text-red-300' },
};

const ago = (iso: string | null) => {
  if (!iso) return '';
  try {
    return formatDistanceToNow(parseISO(iso), { addSuffix: true });
  } catch {
    return '';
  }
};

function Header({ title, to, linkLabel }: { title: string; to: string; linkLabel: string }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-3">
      <h2 className={SECTION}>{title}</h2>
      <Link to={to} className="inline-flex shrink-0 items-center text-sm text-primary hover:underline">
        {linkLabel} <ArrowRight className="ml-1 h-3.5 w-3.5" aria-hidden />
      </Link>
    </div>
  );
}

/** How many messages show before "Show all", so the card lines up with Reporting reminders beside it. */
export const MESSAGES_PREVIEW = 3;

function MessageRow({ m, compact }: { m: HomeBroadcast; compact: boolean }) {
  return (
    <li>
      <Link
        to={`/client/inbox?tab=messages&thread=${m.id}`}
        className={cn(
          'flex items-start gap-3 rounded-lg border bg-card transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          compact ? 'p-2.5' : 'p-3',
        )}
      >
        <span className={cn('mt-0.5 rounded-md p-1.5', m.isUnread ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground')}>
          <Megaphone className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
              <p className={cn('text-sm font-semibold text-foreground', compact ? 'line-clamp-1' : 'line-clamp-2')}>{m.subject}</p>
              {m.isUnread && <Badge variant="default" className="px-1.5 py-0 text-[10px]">New</Badge>}
            </div>
            {compact && <span className="shrink-0 pt-0.5 text-[11px] text-muted-foreground">{ago(m.sentAt)}</span>}
          </div>
          {m.excerpt && <p className={cn('mt-0.5 text-xs text-muted-foreground', compact ? 'line-clamp-1' : 'line-clamp-2')}>{m.excerpt}</p>}
          {!compact && <p className="mt-1 text-[11px] text-muted-foreground">{ago(m.sentAt)}</p>}
        </div>
      </Link>
    </li>
  );
}

/**
 * Broadcast messages from Vivacity. The compact version is a card shaped like the Reporting reminders card beside it
 * (same header, subtitle and "Show all" button), showing the first few and expanding to the rest.
 */
export function HomeMessagesView({ items, compact = false }: { items: HomeBroadcast[]; compact?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  if (!compact) {
    return (
      <section aria-label="Messages from Vivacity">
        <Header title="Messages from Vivacity" to="/client/inbox?tab=messages" linkLabel="Open inbox" />
        <ul className="space-y-2">{items.map((m) => <MessageRow key={m.id} m={m} compact={false} />)}</ul>
      </section>
    );
  }
  const rows = expanded ? items : items.slice(0, MESSAGES_PREVIEW);
  const more = items.length - MESSAGES_PREVIEW;
  return (
    <Card role="region" aria-label="Messages from Vivacity" className="h-full">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Megaphone className="h-5 w-5 text-primary" aria-hidden />
            Messages from Vivacity
          </CardTitle>
          <Link to="/client/inbox?tab=messages" className="inline-flex shrink-0 items-center text-sm text-primary hover:underline">
            Open inbox <ArrowRight className="ml-1 h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
        <p className="text-xs text-muted-foreground">Broadcasts from your Vivacity team.</p>
      </CardHeader>
      <CardContent className="pt-0">
        <ul className="space-y-1.5">{rows.map((m) => <MessageRow key={m.id} m={m} compact />)}</ul>
        {(expanded || more > 0) && (
          <div className="pt-2">
            <Button variant="ghost" size="sm" onClick={() => setExpanded((v) => !v)} className="w-full text-xs">
              {expanded ? 'Show fewer' : `Show all ${items.length} messages`}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function HomeRegulatoryView({ items }: { items: HomeRegulatoryUpdate[] }) {
  return (
    <section aria-label="Regulatory updates">
      <Header title="Regulatory updates" to="/client/regulatory-updates" linkLabel="All updates" />
      <ul className="space-y-2">
        {items.map((u) => {
          const impact = u.impact ? IMPACT[u.impact] : null;
          return (
            <li key={u.id}>
              <Link to={`/client/regulatory-updates/${u.id}`} className="flex items-start gap-3 rounded-lg border bg-card p-3 transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <span className="mt-0.5 rounded-md bg-primary/10 p-1.5 text-primary"><Globe className="h-4 w-4" aria-hidden /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <p className="text-sm font-semibold text-foreground">{u.regulator}</p>
                    {impact && <Badge variant="outline" className={cn('px-1.5 py-0 text-[10px]', impact.className)}>{impact.label}</Badge>}
                  </div>
                  {u.excerpt && <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{u.excerpt}</p>}
                  <p className="mt-1 text-[11px] text-muted-foreground">Detected {ago(u.detectedAt)}</p>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Latest broadcast messages. Shows nothing when there are none, or while the inbox is not available to this person. */
export function HomeMessagesCard({ compact = false }: { compact?: boolean }) {
  const { data, isLoading, error } = useClientHomeBroadcasts(compact ? 10 : 3);
  if (isLoading) return <Skeleton className="h-28 w-full rounded-xl" />;
  if (error || !data || data.length === 0) return null;
  return <HomeMessagesView items={data} compact={compact} />;
}

/** Latest regulator changes. Shows nothing when there are none or they cannot be loaded. */
export function HomeRegulatoryCard() {
  const { data, isLoading, error } = useClientHomeRegulatoryUpdates();
  if (isLoading) return <Skeleton className="h-28 w-full rounded-xl" />;
  if (error || !data || data.length === 0) return null;
  return <HomeRegulatoryView items={data} />;
}
