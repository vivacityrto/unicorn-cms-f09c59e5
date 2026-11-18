import { useState } from 'react';
import { Archive, ChevronDown, ChevronRight, FileBarChart, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { breakdownKind } from '@/features/eos-scorecard/cstBreakdown';
import { aimText, formatValue, shortDate, type Area, type Measure } from '@/features/eos-scorecard/scorecardView';
import { AimBar } from './AimBar';
import { AimInfo } from './AimInfo';
import { MiniTrend } from './MiniTrend';
import { NumberEntry } from './NumberEntry';
import { StatusPill } from './StatusPill';

interface AreaAccordionProps {
  areas: readonly Area[];
  ownerNames: Readonly<Record<string, string>>;
  canManage: boolean;
  savingId: string | null;
  onSaveNumber: (measure: Measure, value: number) => void;
  onEdit: (measure: Measure) => void;
  onArchive: (measure: Measure) => void;
  /** Open the full report behind an automatic client measure. */
  onOpenReport?: (measure: Measure) => void;
}

function sourceSentence(m: Measure, owner: string | null): string {
  if (m.source === 'automatic') return 'Worked out automatically from Unicorn every Monday morning.';
  if (m.source === 'hybrid') return 'Worked out automatically, and can be corrected by hand.';
  return `Typed in by ${owner ?? 'the owner'} each week.`;
}

function MeasureRow({ measure, ownerNames, canManage, savingId, onSaveNumber, onEdit, onArchive, onOpenReport }: Omit<AreaAccordionProps, 'areas'> & { measure: Measure }) {
  const [open, setOpen] = useState(false);
  const owner = measure.ownerId ? ownerNames[measure.ownerId] ?? null : null;
  return (
    <li className="border-t">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="grid w-full grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] items-center gap-x-3 gap-y-1 px-4 py-3 text-left hover:bg-muted/40 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,.8fr)_minmax(0,1fr)_auto]"
      >
        <span className="flex min-w-0 items-center gap-2">
          {open ? <ChevronDown className="h-4 w-4 shrink-0" aria-hidden /> : <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />}
          <span className="min-w-0">
            <span className="block truncate font-semibold">{measure.name}</span>
            <span className="block truncate text-sm text-muted-foreground">Owner: {owner ?? 'Nobody yet'}</span>
          </span>
        </span>
        <span className="text-xl font-bold tabular-nums">{formatValue(measure.unit, measure.value)}</span>
        <span className="hidden text-sm sm:block">Aim: {aimText(measure)}</span>
        <StatusPill status={measure.status} className="justify-self-start sm:justify-self-end" />
      </button>
      {open && (
        <div className="grid gap-4 border-t border-dashed bg-muted/30 px-4 py-4 sm:grid-cols-3">
          <div className="space-y-3">
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">What this measures</h4>
              <p className="text-sm">{measure.description || 'No description yet.'}</p>
            </div>
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Where the number comes from</h4>
              <p className="text-sm">{sourceSentence(measure, owner)}</p>
            </div>
            {onOpenReport && breakdownKind(measure.metric.metric_key) && (
              <Button type="button" size="sm" variant="secondary" className="gap-1.5" onClick={() => onOpenReport(measure)}>
                <FileBarChart className="h-4 w-4" aria-hidden /> Full report
              </Button>
            )}
            {measure.lastEntry && measure.value === null && (
              <p className="text-sm text-muted-foreground">Last number: {formatValue(measure.unit, measure.lastEntry.value)} (week of {shortDate(measure.lastEntry.weekEnding)}).</p>
            )}
          </div>
          <div>
            <h4 className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Against the aim <AimInfo measure={measure} /></h4>
            <AimBar measure={measure} />
          </div>
          <div className="space-y-3">
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">History</h4>
              <MiniTrend measure={measure} />
            </div>
            {measure.source !== 'automatic' && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{'This week’s number'}</h4>
                <NumberEntry label={`This week’s number for ${measure.name}`} unit={measure.unit} saving={savingId === measure.id} onSave={(v) => onSaveNumber(measure, v)} />
              </div>
            )}
            {canManage && (
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={() => onEdit(measure)}>
                  <Pencil className="h-3.5 w-3.5" aria-hidden /> Edit
                </Button>
                <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={() => onArchive(measure)}>
                  <Archive className="h-3.5 w-3.5" aria-hidden /> Archive
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

/** Every measure, grouped by area. Closed by default: the page leads with what needs attention. */
export function AreaAccordion({ areas, ...rest }: AreaAccordionProps) {
  const [openAreas, setOpenAreas] = useState<ReadonlySet<string>>(new Set());
  const toggle = (category: string) =>
    setOpenAreas((current) => {
      const next = new Set(current);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });

  return (
    <div className="space-y-3">
      {areas.map((area) => {
        const open = openAreas.has(area.category);
        return (
          <section key={area.category} aria-label={area.name} className="overflow-hidden rounded-xl border">
            <button
              type="button"
              aria-expanded={open}
              onClick={() => toggle(area.category)}
              className="flex w-full flex-wrap items-center justify-between gap-2 bg-muted/50 px-4 py-3 text-left hover:bg-muted"
            >
              <span className="flex items-center gap-2">
                {open ? <ChevronDown className="h-4 w-4" aria-hidden /> : <ChevronRight className="h-4 w-4" aria-hidden />}
                <span className="text-lg font-bold">{area.name}</span>
                <span className="text-sm text-muted-foreground">
                  {area.measures.length} {area.measures.length === 1 ? 'measure' : 'measures'}
                </span>
              </span>
              <StatusPill status={area.worst} />
            </button>
            {open && (
              <ul>
                {area.measures.map((m) => (
                  <MeasureRow key={m.id} measure={m} {...rest} />
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
