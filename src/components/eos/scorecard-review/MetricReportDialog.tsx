import { useMemo, useState, type ReactNode } from 'react';
import { ChevronRight, Maximize2, Minimize2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { lastActiveText } from '@/features/eos-cst/cstReport';
import {
  breakdownKind,
  buildBreakdown,
  countBy,
  isActiveClient,
  isQuiet,
  weekChanges,
  weeklySeries,
  type BreakdownKind,
  type CstClientRow,
} from '@/features/eos-scorecard/cstBreakdown';
import { addDays, aimText, formatValue, gapText, shortDate, sydneyDate, type Measure } from '@/features/eos-scorecard/scorecardView';
import { weekEndingOf } from '@/features/eos-scorecard/metricReport';
import { useAcademyActivity, useCertificateDetail, useCstWeekRows, useNeverSignedInPeople } from '@/features/eos-scorecard/useMetricReport';
import { AimInfo } from './AimInfo';
import { ClientDetailPanel } from './ClientDetailPanel';
import { DrillCard, type DrillStep } from './DrillCard';
import { SplitBar } from './SplitBar';
import { StatusPill } from './StatusPill';
import { VivInsight } from './VivInsight';

interface MetricReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  measure: Measure;
  weekKey: string;
  weekLabel: string;
  /** Ask Viv as soon as the report opens. */
  autoAsk?: boolean;
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="space-y-2 rounded-xl border bg-card p-4">
      <div>
        <h3 className="text-base font-bold">{title}</h3>
        {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function Table({ head, rows, empty, onRowClick }: { head: string[]; rows: ReactNode[][]; empty: string; onRowClick?: (index: number) => void }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
            {head.map((h) => (
              <th key={h} scope="col" className="px-2 py-1.5 font-semibold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, i) => (
            <tr key={i} onClick={onRowClick ? () => onRowClick(i) : undefined} className={cn('border-b last:border-0', onRowClick && 'cursor-pointer hover:bg-muted/50')}>
              {cells.map((cell, j) => (
                <td key={j} className={cn('px-2 py-1.5 align-top', j === 0 && 'font-medium')}>
                  {onRowClick && j === 0 ? (
                    <button type="button" className="group inline-flex items-center gap-1 text-left font-semibold text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      {cell}
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-60 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
                    </button>
                  ) : (
                    cell
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Counts({ items, empty }: { items: { label: string; count: number }[]; empty: string }) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  const max = Math.max(...items.map((i) => i.count));
  return (
    <ul className="space-y-1.5">
      {items.map((i) => (
        <li key={i.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 text-sm">
          <span className="truncate">{i.label}</span>
          <span className="font-semibold tabular-nums">{i.count}</span>
          <span aria-hidden className="col-span-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <span className="block h-full rounded-full bg-primary" style={{ width: `${(i.count / max) * 100}%` }} />
          </span>
        </li>
      ))}
    </ul>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-muted/50 p-3">
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

const names = (rows: readonly CstClientRow[]) => rows.map((r) => r.name).join(', ');

function WeekBars({ points, unit }: { points: { weekEnding: string; value: number | null }[]; unit: string }) {
  const max = Math.max(1, ...points.map((p) => p.value ?? 0));
  return (
    <ol className="flex items-end gap-2" aria-label="Last weeks, oldest first">
      {points.map((p) => (
        <li key={p.weekEnding} className="flex min-w-0 flex-1 flex-col items-center gap-1">
          <span className="text-xs font-semibold tabular-nums">{p.value === null ? '–' : formatValue(unit, p.value)}</span>
          <span className="flex h-16 w-full items-end">
            <span className="block w-full rounded-t bg-primary/70" style={{ height: `${p.value === null ? 0 : Math.max(4, (p.value / max) * 100)}%` }} />
          </span>
          <span className="text-[11px] text-muted-foreground">{shortDate(p.weekEnding)}</span>
        </li>
      ))}
    </ol>
  );
}

type ClientFilter = 'quiet' | 'active' | 'all';

function ClientTable({ rows, onOpen, initial = 'quiet', filters = true }: { rows: CstClientRow[]; onOpen: (row: CstClientRow) => void; initial?: ClientFilter; filters?: boolean }) {
  const [filter, setFilter] = useState<ClientFilter>(initial);
  const shown = useMemo(() => {
    const picked = filter === 'quiet' ? rows.filter(isQuiet) : filter === 'active' ? rows.filter(isActiveClient) : rows.filter((r) => r.clientUsers > 0);
    return [...picked].sort((a, b) => b.clientUsers - a.clientUsers || a.name.localeCompare(b.name));
  }, [rows, filter]);
  const options: { value: ClientFilter; label: string }[] = [
    { value: 'quiet', label: `Nobody active ${rows.filter(isQuiet).length}` },
    { value: 'active', label: `Someone active ${rows.filter(isActiveClient).length}` },
    { value: 'all', label: `All ${rows.filter((r) => r.clientUsers > 0).length}` },
  ];
  return (
    <div className="space-y-2">
      {filters && <div role="group" aria-label="Which clients" className="inline-flex gap-1 rounded-lg bg-muted p-1">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={filter === o.value}
            onClick={() => setFilter(o.value)}
            className={cn('rounded-md px-3 py-1 text-sm font-semibold', filter === o.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
          >
            {o.label}
          </button>
        ))}
      </div>}
      <Table
        head={['Client', 'CSC', 'People active', 'Last active']}
        empty="No clients in this view."
        onRowClick={(i) => onOpen(shown[i])}
        rows={shown.map((r) => [r.name, r.cscName, `${r.activeUsers} of ${r.clientUsers}`, r.lastActiveAt === undefined ? '–' : lastActiveText(r.lastActiveAt)])}
      />
    </div>
  );
}

function CertificateSections({ weekKey, tenantIds }: { weekKey: string; tenantIds: number[] }) {
  const certs = useCertificateDetail(weekKey, tenantIds);
  const academy = useAcademyActivity(weekKey, tenantIds);
  const list = certs.data ?? [];
  const a = academy.data;
  return (
    <>
      <Section title="Who earned them" hint="Certificates issued in this week, and not revoked.">
        {certs.isLoading ? (
          <div className="h-16 animate-pulse rounded-lg bg-muted/50" aria-busy="true" />
        ) : certs.error ? (
          <p className="text-sm text-destructive" role="alert">The list could not be loaded.</p>
        ) : (
          <Table
            head={['Learner', 'Course', 'Client', 'Issued']}
            empty="No certificates were issued this week."
            rows={list.map((c) => [c.learner, c.course, c.client, shortDate(sydneyDate(new Date(c.issuedAt)))])}
          />
        )}
      </Section>
      {list.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          <Section title="By course">
            <Counts items={countBy(list, (c) => c.course)} empty="None." />
          </Section>
          <Section title="By client">
            <Counts items={countBy(list, (c) => c.client)} empty="None." />
          </Section>
        </div>
      )}
      <Section title="Academy activity, last 28 days" hint="Live Clients only. Enrolments are counted on the day they were made; completions on the day the course was finished.">
        {academy.isLoading ? (
          <div className="h-16 animate-pulse rounded-lg bg-muted/50" aria-busy="true" />
        ) : academy.error || !a ? (
          <p className="text-sm text-destructive" role="alert">Academy activity could not be loaded.</p>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <Stat label="Enrolments" value={a.enrolled} />
              <Stat label="Chosen by the learner" value={a.selfEnrolled} />
              <Stat label="Added automatically" value={a.automatic} />
              <Stat label="Courses completed" value={a.completed} />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <h4 className="text-sm font-semibold">Busiest courses</h4>
                <Table head={['Course', 'Enrolled', 'Finished']} empty="No Academy activity in this period." rows={a.topCourses.map((c) => [c.title, c.enrolled, c.completed])} />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-semibold">Enrolled, but nobody finished</h4>
                <Table head={['Course', 'Enrolled']} empty="Every course with three or more enrolments has had a completion." rows={a.stalled.map((c) => [c.title, c.enrolled])} />
              </div>
            </div>
          </div>
        )}
      </Section>
    </>
  );
}

function NeverSignedInSection({ tenantIds }: { tenantIds: number[] }) {
  const people = useNeverSignedInPeople(tenantIds);
  return (
    <Section title="The people" hint="Invited at a Live Client and never signed in, as of today. Chase them, or remove them if they have left.">
      {people.isLoading ? (
        <div className="h-16 animate-pulse rounded-lg bg-muted/50" aria-busy="true" />
      ) : people.error ? (
        <p className="text-sm text-destructive" role="alert">The list could not be loaded.</p>
      ) : (
        <Table head={['Person', 'Client', 'Added']} empty="Nobody is waiting to sign in." rows={(people.data ?? []).map((p) => [p.name, p.client, p.addedOn ? shortDate(sydneyDate(new Date(p.addedOn))) : '–'])} />
      )}
    </Section>
  );
}

type Step =
  | (DrillStep & { kind: 'client'; row: CstClientRow })
  | (DrillStep & { kind: 'csc'; csc: string; rows: CstClientRow[] });

const clientStep = (row: CstClientRow): Step => ({ key: `client:${row.tenantId}`, label: row.name, kind: 'client', row });

function Report({ measure, weekKey, kind }: { measure: Measure; weekKey: string; kind: BreakdownKind }) {
  const { byWeek, current, isLoading, error } = useCstWeekRows(weekKey);
  const weekEnding = weekEndingOf(weekKey);
  const tenantIds = useMemo(() => current.map((r) => r.tenantId), [current]);
  const breakdown = useMemo(() => (current.length > 0 ? buildBreakdown(kind, current, { value: measure.value, target: measure.target }) : null), [kind, current, measure.value, measure.target]);
  const previous = byWeek[addDays(weekEnding, -7)];
  const changes = useMemo(() => (previous ? weekChanges(previous, current) : null), [previous, current]);
  const series = useMemo(() => weeklySeries(kind, byWeek), [kind, byWeek]);
  const activity = kind === 'clients_active' || kind === 'clients_quiet' || kind === 'people_active';

  if (isLoading) return <div className="h-48 animate-pulse rounded-xl bg-muted/50" aria-busy="true" />;
  if (error || !breakdown) return <p className="text-sm text-destructive" role="alert">The report could not be loaded for this week.</p>;

  return (
    <div className="space-y-4">
      <Section title="What this number means">
        <p className="text-base font-medium">{breakdown.sentence}</p>
        <SplitBar split={breakdown.split} />
        {breakdown.lift && <p className="text-sm font-semibold">To reach the aim: {breakdown.lift}</p>}
        {measure.description && <p className="text-sm text-muted-foreground">{measure.description}</p>}
      </Section>

      {activity && changes && (
        <Section title="What changed since last week">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <h4 className="text-sm font-semibold">Went quiet ({changes.wentQuiet.length})</h4>
              <p className="text-sm text-muted-foreground">{changes.wentQuiet.length > 0 ? names(changes.wentQuiet) : 'No client went quiet.'}</p>
            </div>
            <div>
              <h4 className="text-sm font-semibold">Came back ({changes.cameBack.length})</h4>
              <p className="text-sm text-muted-foreground">{changes.cameBack.length > 0 ? names(changes.cameBack) : 'No client came back.'}</p>
            </div>
          </div>
        </Section>
      )}

      {series.length > 1 && (
        <Section title="The last few weeks">
          <WeekBars points={series} unit={measure.unit} />
        </Section>
      )}

      <DrillCard<Step>
        title="By CSC"
        hint={kind === 'certificates' ? 'Certificates earned by each CSC’s clients. Choose a CSC to see their clients.' : 'Choose a CSC to see their clients.'}
        root={(open) => (
          <Table
            head={['CSC', kind === 'clients_active' || kind === 'clients_quiet' ? 'Clients with nobody active' : kind === 'people_active' ? 'People active' : kind === 'never_signed_in' ? 'Never signed in' : 'Certificates', kind === 'certificates' ? 'Clients' : 'Out of']}
            empty="No clients."
            rows={breakdown.byCsc.map((c) => [c.name, c.count, c.of])}
            onRowClick={(i) => {
              const name = breakdown.byCsc[i].name;
              open({ key: `csc:${name}`, label: name, kind: 'csc', csc: name, rows: current.filter((r) => r.cscName === name) });
            }}
          />
        )}
        page={(step, open) =>
          step.kind === 'client' ? (
            <ClientDetailPanel row={step.row} weekEnding={weekEnding} />
          ) : (
            <div className="space-y-3">
              <div>
                <h3 className="text-xl font-bold">{step.csc}</h3>
                <p className="text-sm text-muted-foreground">{step.rows.length} {step.rows.length === 1 ? 'client' : 'clients'}. Choose one to see its people.</p>
              </div>
              <ClientTable rows={step.rows} onOpen={(r) => open(clientStep(r))} initial="all" />
            </div>
          )
        }
      />

      {activity && (
        <DrillCard<Step>
          title="Clients"
          hint="Biggest first. “People active” counts client users who did something in the last 28 days. Choose a client to see its people."
          root={(open) => <ClientTable rows={current} onOpen={(r) => open(clientStep(r))} />}
          page={(step) => (step.kind === 'client' ? <ClientDetailPanel row={step.row} weekEnding={weekEnding} /> : null)}
        />
      )}

      {kind === 'never_signed_in' && (
        <>
          <Section title="By client">
            <Counts items={breakdown.list.map((r) => ({ label: r.name, count: r.neverSignedIn }))} empty="No client has anyone who never signed in." />
          </Section>
          <NeverSignedInSection tenantIds={tenantIds} />
        </>
      )}

      {kind === 'certificates' && <CertificateSections weekKey={weekKey} tenantIds={tenantIds} />}
    </div>
  );
}

/** Measures people type in have no breakdown, only their own recent numbers. */
function HistoryOnly({ measure, weekKey }: { measure: Measure; weekKey: string }) {
  const last = measure.history.length - 1;
  const points = measure.history.map((value, i) => ({ weekEnding: addDays(weekEndingOf(weekKey), -7 * (last - i)), value }));
  return (
    <Section title="The last few weeks" hint="Typed in each week by the owner. There is no breakdown behind this number.">
      <WeekBars points={points} unit={measure.unit} />
    </Section>
  );
}

/** The full report for one measure: Viv's read first, then what the number is made of, who to look at, and what changed. */
export function MetricReportDialog({ open, onOpenChange, measure, weekKey, weekLabel, autoAsk = false }: MetricReportDialogProps) {
  const kind = breakdownKind(measure.metric.metric_key);
  const [expanded, setExpanded] = useState(false);
  if (!open) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'max-w-none gap-0 overflow-y-auto p-0 [&>button]:text-white [&>button]:opacity-90 [&>button]:hover:opacity-100',
          expanded
            ? 'left-0 top-0 h-[100dvh] max-h-none w-screen translate-x-0 translate-y-0 rounded-none border-0 data-[state=closed]:slide-out-to-left-0 data-[state=closed]:slide-out-to-top-0 data-[state=open]:slide-in-from-left-0 data-[state=open]:slide-in-from-top-0'
            : 'max-h-[92dvh] w-[min(96vw,64rem)]',
        )}
      >
        <div className="relative space-y-1 border-b bg-gradient-to-r from-[#44235F] to-[#7130A0] px-5 py-4 pr-24 text-white">
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            aria-pressed={expanded}
            aria-label={expanded ? 'Shrink the report' : 'Make the report full screen'}
            title={expanded ? 'Shrink' : 'Full screen'}
            className="absolute right-14 top-3 flex h-11 w-11 items-center justify-center rounded-sm text-white opacity-90 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            {expanded ? <Minimize2 className="h-4 w-4" aria-hidden /> : <Maximize2 className="h-4 w-4" aria-hidden />}
          </button>
          <DialogDescription className="text-xs font-semibold uppercase tracking-wide text-white/80">Report · Week of {weekLabel}</DialogDescription>
          <DialogTitle className="text-2xl font-bold !text-white">{measure.name}</DialogTitle>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <span className="text-3xl font-bold tabular-nums">{formatValue(measure.unit, measure.value)}</span>
            <StatusPill status={measure.status} />
            <span className="text-sm text-white/85">{gapText(measure)}</span>
            <span className="inline-flex items-center gap-1 text-sm text-white/85">Aim: {aimText(measure)} <AimInfo measure={measure} onDark /></span>
          </div>
        </div>
        <div className={cn('space-y-4 p-4 sm:p-5', expanded && 'mx-auto w-full max-w-7xl')}>
          <VivInsight measure={measure} weekKey={weekKey} autoStart={autoAsk} />
          {kind ? <Report measure={measure} weekKey={weekKey} kind={kind} /> : <HistoryOnly measure={measure} weekKey={weekKey} />}
        </div>
      </DialogContent>
    </Dialog>
  );
}
