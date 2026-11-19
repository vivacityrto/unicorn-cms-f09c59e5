import { ArrowRight, Globe, Megaphone } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { Badge } from '@/components/ui/badge';
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

export function HomeMessagesView({ items }: { items: HomeBroadcast[] }) {
  return (
    <section aria-label="Messages from Vivacity">
      <Header title="Messages from Vivacity" to="/client/inbox?tab=messages" linkLabel="Open inbox" />
      <ul className="space-y-2">
        {items.map((m) => (
          <li key={m.id}>
            <Link to={`/client/inbox?tab=messages&thread=${m.id}`} className="flex items-start gap-3 rounded-lg border bg-card p-3 transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <span className={cn('mt-0.5 rounded-md p-1.5', m.isUnread ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground')}>
                <Megaphone className="h-4 w-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <p className="text-sm font-semibold text-foreground line-clamp-2">{m.subject}</p>
                  {m.isUnread && <Badge variant="default" className="px-1.5 py-0 text-[10px]">New</Badge>}
                </div>
                {m.excerpt && <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{m.excerpt}</p>}
                <p className="mt-1 text-[11px] text-muted-foreground">{ago(m.sentAt)}</p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
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
export function HomeMessagesCard() {
  const { data, isLoading, error } = useClientHomeBroadcasts();
  if (isLoading) return <Skeleton className="h-28 w-full rounded-xl" />;
  if (error || !data || data.length === 0) return null;
  return <HomeMessagesView items={data} />;
}

/** Latest regulator changes. Shows nothing when there are none or they cannot be loaded. */
export function HomeRegulatoryCard() {
  const { data, isLoading, error } = useClientHomeRegulatoryUpdates();
  if (isLoading) return <Skeleton className="h-28 w-full rounded-xl" />;
  if (error || !data || data.length === 0) return null;
  return <HomeRegulatoryView items={data} />;
}
