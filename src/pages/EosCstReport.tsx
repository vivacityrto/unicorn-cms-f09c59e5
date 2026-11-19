import { Fragment, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { CstCompare } from '@/components/eos/cst-report/CstCompare';
import { CstWhyPanel, type WhyKey } from '@/components/eos/cst-report/CstWhyPanel';
import { Ring } from '@/components/eos/cst-report/CstCharts';
import { useAcademyBetween } from '@/features/eos-scorecard/useMetricReport';
import { flattenRtos, periodDates } from '@/features/eos-cst/cstInsights';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useCstReport } from '@/features/eos-cst/useCstReport';
import {
  CST_PERIOD_OPTIONS,
  certificateDelta,
  csvFilename,
  formatPercent,
  lastActiveText,
  percent,
  periodLabel,
  reportHeadline,
  reportToCsv,
  shiftAnchor,
  sydneyToday,
  type CstPeriod,
  type CstReport,
} from '@/features/eos-cst/cstReport';

function UsageBar({ part, whole }: { part: number; whole: number }) {
  const pct = percent(part, whole) ?? 0;
  return (
    <div className="min-w-0">
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-sm">
        <span className="font-semibold tabular-nums">{formatPercent(part, whole)}</span>{' '}
        <span className="text-muted-foreground">
          ({part} of {whole} {whole === 1 ? 'user' : 'users'})
        </span>
      </p>
    </div>
  );
}

function CertificateNote({ period, current, prior }: { period: CstPeriod; current: number; prior: number }) {
  const d = certificateDelta(period, current, prior);
  if (!d) return <span className="text-xs text-muted-foreground">No earlier year to compare</span>;
  const text = d.direction === 'flat' ? 'same as the period before' : `${Math.abs(d.delta)} ${d.direction === 'up' ? 'more' : 'fewer'} than the period before`;
  return (
    <span className={cn('text-xs', d.direction === 'down' && 'text-destructive', d.direction === 'up' && 'text-green-700 dark:text-green-400', d.direction === 'flat' && 'text-muted-foreground')}>
      {d.direction === 'up' ? '▲' : d.direction === 'down' ? '▼' : '='} {text}
    </span>
  );
}

interface InsightCardProps {
  selected: boolean;
  onSelect: () => void;
  label: string;
  value: string;
  note: string;
  ring: { pct: number | null; caption: string; tone?: 'primary' | 'bad' | 'good'; text: string };
  children?: React.ReactNode;
}

/** A headline number that can be chosen: the section below changes to show what is behind it. */
function InsightCard({ selected, onSelect, label, value, note, ring, children }: InsightCardProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-controls="cst-why"
      onClick={onSelect}
      className={cn(
        'group flex h-full flex-col rounded-xl border-2 p-4 text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none',
        selected ? 'border-primary bg-primary/5 shadow-md' : 'border-border bg-card hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-sm motion-reduce:hover:translate-y-0',
      )}
    >
      <p className="text-sm font-semibold text-muted-foreground">{label}</p>
      <div className="mt-1 flex items-center justify-between gap-3">
        <p className="text-4xl font-bold leading-none tabular-nums">{value}</p>
        <div className="flex flex-col items-center gap-0.5">
          <Ring pct={ring.pct} size={52} stroke={7} tone={ring.tone} label={`${ring.text} ${ring.caption}`}>
            <span className="text-[11px]">{ring.text}</span>
          </Ring>
          <span className="max-w-[5.5rem] text-center text-[10px] leading-tight text-muted-foreground">{ring.caption}</span>
        </div>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{note}</p>
      {children && <div className="mt-1">{children}</div>}
      <span className="mt-auto flex items-center gap-1 pt-3 text-xs font-semibold text-primary">
        {selected ? 'Showing why below' : 'See why'}
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform motion-reduce:transition-none', selected ? 'rotate-180' : 'group-hover:translate-y-0.5')} aria-hidden />
      </span>
    </button>
  );
}

function downloadCsv(report: CstReport) {
  const blob = new Blob(['﻿', reportToCsv(report)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = csvFilename(report);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function EosCstReport() {
  const [period, setPeriod] = useState<CstPeriod>('month');
  const [anchor, setAnchor] = useState<string>(() => sydneyToday());
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [which, setWhich] = useState<WhyKey>('portal');
  const { data, isLoading, error, isFetching } = useCstReport(period, anchor);
  const dates = useMemo(() => (data ? periodDates(data) : { from: '', to: '' }), [data]);
  const tenantIds = useMemo(() => (data ? flattenRtos(data).map((r) => r.tenant_id) : []), [data]);
  const academy = useAcademyBetween(dates.from, dates.to, tenantIds, !!data);
  const choose = (next: WhyKey) => {
    setWhich(next);
    requestAnimationFrame(() => document.getElementById('cst-why')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' }));
  };

  const label = useMemo(() => (data ? periodLabel(period, data.start, data.end) : ''), [data, period]);
  const rolling = period === 'days28';
  const today = sydneyToday();
  const atCurrent = !data || new Date(data.end).getTime() > Date.now();

  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const certClients = data ? flattenRtos(data).filter((r) => r.certificates > 0).length : 0;
  const academyClients = academy.data ? Object.values(academy.data.byTenant).filter((t) => t.enrolled + t.completed > 0).length : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Client activity report</h1>
          <p className="mt-0.5 text-base text-muted-foreground">How much our Live Clients use the portal, the certificates they earn and what they do in the Academy, by CSC.</p>
        </div>
        <div className="inline-flex gap-1 rounded-lg bg-muted p-1" role="group" aria-label="Report period">
          {CST_PERIOD_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              aria-pressed={period === o.value}
              onClick={() => {
                setPeriod(o.value);
                setAnchor(today);
              }}
              className={cn('rounded-md px-3 py-1.5 text-sm font-semibold transition-colors', period === o.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        {!rolling && (
          <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Previous period" onClick={() => setAnchor(shiftAnchor(anchor, period, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
        )}
        <span className="min-w-[11rem] font-semibold">{label || 'Loading…'}</span>
        {!rolling && (
          <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Next period" disabled={atCurrent} onClick={() => setAnchor(shiftAnchor(anchor, period, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        )}
        {isFetching && !isLoading && <span className="text-xs text-muted-foreground">Updating…</span>}
        <Button variant="outline" size="sm" className="ml-auto" disabled={!data} onClick={() => data && downloadCsv(data)}>
          <Download className="mr-1.5 h-3.5 w-3.5" />
          Export CSV
        </Button>
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive" role="alert">
          The report could not be loaded. {(error as Error).message}
        </div>
      ) : isLoading || !data ? (
        <div className="h-64 animate-pulse rounded-lg border bg-muted/40" aria-busy="true" />
      ) : (
        <>
          <section aria-label="Summary" className="rounded-xl bg-gradient-to-r from-[#44235F] to-[#7130A0] p-5 text-white brand-surface">
            <p className="text-2xl font-bold leading-snug sm:text-[1.7rem]">{reportHeadline(data.totals, label)}</p>
            <p className="mt-1 text-sm text-white/85">Across {data.totals.live_rtos} Live Clients.</p>
          </section>

          <section aria-label="Key numbers" className="space-y-2">
            <p className="text-sm text-muted-foreground">Choose a number to see what is behind it.</p>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <InsightCard
                selected={which === 'portal'}
                onSelect={() => choose('portal')}
                label="Client users using the portal"
                value={formatPercent(data.totals.active_users, data.totals.client_users)}
                note={`${data.totals.active_users} of ${data.totals.client_users} users did something in this period.`}
                ring={{ pct: percent(data.totals.active_users, data.totals.client_users), caption: 'of users', text: formatPercent(data.totals.active_users, data.totals.client_users) }}
              />
              <InsightCard
                selected={which === 'certificates'}
                onSelect={() => choose('certificates')}
                label="Certificates issued"
                value={String(data.totals.certificates)}
                note="Course certificates clients earned in this period."
                ring={{
                  pct: percent(certClients, data.totals.live_rtos),
                  caption: 'of clients earned one',
                  tone: 'good',
                  text: `${certClients}`,
                }}
              >
                <CertificateNote period={period} current={data.totals.certificates} prior={data.totals.prior_certificates} />
              </InsightCard>
              <InsightCard
                selected={which === 'never'}
                onSelect={() => choose('never')}
                label="Users who never signed in"
                value={String(data.totals.never_signed_in)}
                note="These people were invited but have never logged in."
                ring={{ pct: percent(data.totals.never_signed_in, data.totals.client_users), caption: 'of users', tone: 'bad', text: formatPercent(data.totals.never_signed_in, data.totals.client_users) }}
              />
              <InsightCard
                selected={which === 'academy'}
                onSelect={() => choose('academy')}
                label="Academy: courses finished"
                value={academy.data ? String(academy.data.completed) : academy.isLoading ? '…' : '–'}
                note={academy.data ? `${academy.data.enrolled} courses chosen by learners and ${academy.data.completed} finished.` : 'Courses learners chose, and finished.'}
                ring={{ pct: percent(academyClients, data.totals.live_rtos), caption: 'of clients used it', tone: 'good', text: `${academyClients}` }}
              />
            </div>
          </section>

          <CstWhyPanel which={which} report={data} period={period} label={label} academy={{ data: academy.data, isLoading: academy.isLoading, error: academy.error as Error | null }} />

          <CstCompare period={period} anchor={anchor} label={label} inProgress={atCurrent} />

          <section aria-label="By CSC" className="space-y-3">
            <div>
              <h2 className="text-xl font-bold">By CSC</h2>
              <p className="text-sm text-muted-foreground">Each CSC looks after a group of RTOs. Open one to see its clients and when each last used the portal.</p>
            </div>
            <div className="overflow-hidden rounded-xl border">
              <div className="hidden grid-cols-[minmax(0,1.4fr)_minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)] gap-3 border-b bg-muted/50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:grid">
                <span>CSC</span>
                <span>Users using the portal</span>
                <span>Never signed in</span>
                <span>Certificates</span>
              </div>
              {data.csc.map((c) => {
                const key = c.csc_user_id ?? 'unassigned';
                const isOpen = open.has(key);
                return (
                  <Fragment key={key}>
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      onClick={() => toggle(key)}
                      className="grid w-full grid-cols-1 items-center gap-2 border-b px-4 py-3 text-left hover:bg-muted/40 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)] md:gap-3"
                    >
                      <span className="flex items-center gap-2">
                        {isOpen ? <ChevronDown className="h-4 w-4 shrink-0" aria-hidden /> : <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />}
                        <span>
                          <span className="block font-semibold">{c.csc_name}</span>
                          <span className="block text-sm text-muted-foreground">
                            {c.live_rtos} {c.live_rtos === 1 ? 'RTO' : 'RTOs'}
                          </span>
                        </span>
                      </span>
                      <UsageBar part={c.active_users} whole={c.client_users} />
                      <span className="text-sm">
                        <span className="font-semibold tabular-nums">{c.never_signed_in}</span> <span className="text-muted-foreground">{c.never_signed_in === 1 ? 'user' : 'users'}</span>
                      </span>
                      <span className="flex flex-col">
                        <span className="text-lg font-bold tabular-nums">{c.certificates}</span>
                        <CertificateNote period={period} current={c.certificates} prior={c.prior_certificates} />
                      </span>
                    </button>
                    {isOpen && (
                      <ul className="border-b bg-muted/30">
                        {c.rtos.map((r) => (
                          <li key={r.tenant_id} className="grid grid-cols-1 gap-1 border-t border-dashed px-4 py-2.5 pl-10 first:border-t-0 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)] md:gap-3">
                            <span className="min-w-0">
                              <Link to={`/tenant/${r.tenant_id}`} className="block truncate font-medium hover:underline">
                                {r.tenant_name}
                              </Link>
                              {r.last_active_at !== undefined && <span className="block text-xs text-muted-foreground">Last active: {lastActiveText(r.last_active_at)}</span>}
                            </span>
                            <UsageBar part={r.active_users} whole={r.client_users} />
                            <span className="text-sm tabular-nums">{r.never_signed_in}</span>
                            <span className="text-sm tabular-nums">{r.certificates}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Fragment>
                );
              })}
            </div>
          </section>
        </>
      )}

      <details className="rounded-xl border p-4 text-sm">
        <summary className="cursor-pointer font-semibold">How these numbers are worked out</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <p>
            <span className="font-semibold">Live Clients.</span> Active, On hold, In Arrears or Warning, with a lifecycle status of active, not archived, RTO accounts only. Suspended and closed clients are left out, so this can be a few fewer than the Manage Tenants Live filter.
          </p>
          <p>
            <span className="font-semibold">Using the portal.</span> A client user viewed a page, logged in, sent or read a message, finished an Academy lesson, or enrolled themselves in a course.
          </p>
          <p>
            <span className="font-semibold">Not counted.</span> Vivacity staff (including when they view as a client), documents staff share, automatic enrolments, system events and archived users.
          </p>
          <p>
            <span className="font-semibold">Academy.</span> Enrolments are counted on the day they were made and finished courses on the day they were completed, for Live Clients only. Revoked enrolments are left out.
          </p>
          <p>
            <span className="font-semibold">Certificates and users.</span> A certificate counts on the day it was issued, unless it was revoked. Past periods use today's users and Live status.
          </p>
        </div>
      </details>
    </div>
  );
}
