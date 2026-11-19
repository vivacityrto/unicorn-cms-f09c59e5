import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { format, formatDistanceToNowStrict } from 'date-fns';
import { AlertTriangle, ArrowRight, Calendar, ExternalLink, Globe, Layers, Link2, ShieldAlert, Tag } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  IMPACT_LABEL,
  IMPACT_MEANING,
  IMPACT_ORDER,
  isRecent,
  type ImpactLevel,
  type UpdateSummary,
} from '@/features/regulatory-updates/regulatoryView';

const IMPACT_STYLE: Record<ImpactLevel, { chip: string; bar: string; tile: string }> = {
  critical: { chip: 'border-red-500/30 bg-red-500/15 text-red-700 dark:text-red-300', bar: 'bg-red-500', tile: 'bg-red-500/15 text-red-700 dark:text-red-300' },
  high: { chip: 'border-orange-500/30 bg-orange-500/15 text-orange-800 dark:text-orange-300', bar: 'bg-orange-500', tile: 'bg-orange-500/15 text-orange-800 dark:text-orange-300' },
  moderate: { chip: 'border-yellow-500/30 bg-yellow-500/15 text-yellow-800 dark:text-yellow-300', bar: 'bg-yellow-500', tile: 'bg-yellow-500/15 text-yellow-800 dark:text-yellow-300' },
  low: { chip: 'border-blue-500/30 bg-blue-500/15 text-blue-700 dark:text-blue-300', bar: 'bg-blue-500', tile: 'bg-blue-500/15 text-blue-700 dark:text-blue-300' },
};

const NO_IMPACT = { chip: 'border-border bg-muted text-muted-foreground', bar: 'bg-border' };

export function ImpactChip({ level, suffix = '' }: { level: ImpactLevel | null; suffix?: string }) {
  if (!level) return null;
  return <Badge variant="outline" className={cn('px-2 py-0 text-[11px] font-semibold', IMPACT_STYLE[level].chip)}>{IMPACT_LABEL[level]}{suffix}</Badge>;
}

const ago = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${formatDistanceToNowStrict(d)} ago`;
};

/** The purple banner for both pages. */
export function RegulatoryBanner({ eyebrow, title, children, action }: { eyebrow: string; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <section aria-label={title} className="brand-surface flex flex-col gap-3 rounded-2xl bg-gradient-to-r from-[#44235F] to-[#7130A0] p-5 text-white sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-white/75">{eyebrow}</p>
        <h1 className="mt-0.5 break-words text-2xl font-bold sm:text-3xl">{title}</h1>
        {children}
      </div>
      {action}
    </section>
  );
}

/** Overview cards that double as the impact filter: how many updates sit at each level and what that level means. */
export function ImpactCards({ counts, total, active, onSelect }: { counts: Record<ImpactLevel, number>; total: number; active: ImpactLevel | 'all'; onSelect: (v: ImpactLevel | 'all') => void }) {
  const card = (value: ImpactLevel | 'all', label: string, count: number, meaning: string, tile: string, Icon: typeof Globe) => (
    <button
      key={value}
      type="button"
      onClick={() => onSelect(value)}
      aria-pressed={active === value}
      className={cn(
        'flex w-full items-start gap-3 rounded-xl border bg-card p-4 text-left transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        value === 'all' && 'sm:col-span-2 lg:col-span-1',
        active === value && 'border-primary bg-primary/5 ring-2 ring-primary/30',
      )}
    >
      <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', tile)}><Icon className="h-4 w-4" aria-hidden /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>{' '}
        <span className="block text-2xl font-bold tabular-nums text-foreground">{count}</span>{' '}
        <span className="block text-xs text-muted-foreground">{meaning}</span>
      </span>
    </button>
  );
  return (
    <div role="group" aria-label="Filter by impact" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {card('all', 'All updates', total, 'Everything detected so far.', 'bg-primary/10 text-primary', Globe)}
      {IMPACT_ORDER.map((l) => card(l, IMPACT_LABEL[l], counts[l], IMPACT_MEANING[l], IMPACT_STYLE[l].tile, l === 'critical' || l === 'high' ? ShieldAlert : AlertTriangle))}
    </div>
  );
}

/** One update as a card: a coloured edge for the impact, who published it, what changed and how big it is. */
export function UpdateCard({ update }: { update: UpdateSummary }) {
  const edge = update.impact ? IMPACT_STYLE[update.impact].bar : NO_IMPACT.bar;
  return (
    <Link
      to={`/client/regulatory-updates/${update.id}`}
      className="group relative flex h-full flex-col overflow-hidden rounded-xl border bg-card p-4 pl-5 transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className={cn('absolute inset-y-0 left-0 w-1.5', edge)} aria-hidden />
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h3 className="break-words text-base font-semibold text-foreground">{update.regulator}</h3>
        <ImpactChip level={update.impact} suffix=" impact" />
        {isRecent(update.detectedAt) && <Badge variant="default" className="px-1.5 py-0 text-[10px]">New</Badge>}
      </div>
      {update.excerpt ? <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{update.excerpt}</p> : <p className="mt-2 text-sm text-muted-foreground">Open to read what changed.</p>}
      <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 pt-3 text-xs text-muted-foreground">
        {update.detectedAt && <span className="inline-flex items-center gap-1"><Calendar className="h-3.5 w-3.5" aria-hidden />Detected {ago(update.detectedAt)}</span>}
        {update.areaCount > 0 && <span className="inline-flex items-center gap-1"><Layers className="h-3.5 w-3.5" aria-hidden />{update.areaCount} {update.areaCount === 1 ? 'area' : 'areas'} affected</span>}
        {update.category && <span className="inline-flex items-center gap-1 capitalize"><Tag className="h-3.5 w-3.5" aria-hidden />{update.category}</span>}
        <span className="ml-auto inline-flex items-center gap-1 font-medium text-primary group-hover:underline">Read <ArrowRight className="h-3.5 w-3.5" aria-hidden /></span>
      </div>
    </Link>
  );
}

/** A month heading with its updates in a grid that uses the width. */
export function MonthSection({ label, items }: { label: string; items: UpdateSummary[] }) {
  return (
    <section aria-label={label} className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{label}</h2>
      <div className="grid gap-3 lg:grid-cols-2">
        {items.map((u) => <UpdateCard key={u.id} update={u} />)}
      </div>
    </section>
  );
}

/** The key facts about one update in a card beside the summary. */
export function AtAGlance({ impact, detectedAt, regulator, category, areaCount, sourceCount, sourceUrl }: { impact: ImpactLevel | null; detectedAt: string | null; regulator: string; category: string | null; areaCount: number; sourceCount: number; sourceUrl: string | null }) {
  const row = (Icon: typeof Globe, label: string, value: ReactNode) => (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="break-words text-sm font-medium text-foreground">{value}</dd>
      </div>
    </div>
  );
  return (
    <section aria-label="At a glance" className="space-y-4 rounded-xl border bg-card p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">At a glance</h2>
      {impact && (
        <div className={cn('rounded-lg border p-3', IMPACT_STYLE[impact].chip)}>
          <p className="text-sm font-semibold">{IMPACT_LABEL[impact]} impact</p>
          <p className="mt-0.5 text-xs">{IMPACT_MEANING[impact]}</p>
        </div>
      )}
      <dl className="space-y-3">
        {row(Globe, 'Published by', regulator)}
        {detectedAt && row(Calendar, 'Detected', format(new Date(detectedAt), "d MMMM yyyy 'at' h:mm a"))}
        {row(Layers, 'Areas affected', areaCount > 0 ? `${areaCount}` : 'None listed')}
        {category && row(Tag, 'Category', <span className="capitalize">{category}</span>)}
        {row(Link2, 'Sources', sourceCount > 0 ? `${sourceCount} cited` : 'None cited')}
      </dl>
      {sourceUrl && (
        <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
          Open the regulator page <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </a>
      )}
    </section>
  );
}
