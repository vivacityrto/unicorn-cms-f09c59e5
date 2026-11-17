import { Fragment, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useCstReport } from '@/features/eos-cst/useCstReport';
import {
  CST_PERIOD_OPTIONS,
  certificateDelta,
  csvFilename,
  formatPercent,
  percent,
  periodLabel,
  reportToCsv,
  shiftAnchor,
  sydneyToday,
  type CstPeriod,
  type CstReport,
} from '@/features/eos-cst/cstReport';

function Meter({ part, whole }: { part: number; whole: number }) {
  const pct = percent(part, whole) ?? 0;
  return (
    <span className="inline-flex items-center gap-2">
      <span className="h-2 w-16 rounded-full bg-muted overflow-hidden" aria-hidden="true">
        <span className="block h-full bg-primary" style={{ width: `${pct}%` }} />
      </span>
      <span className="tabular-nums text-sm">{formatPercent(part, whole)}</span>
    </span>
  );
}

function Delta({ period, current, prior }: { period: CstPeriod; current: number; prior: number }) {
  const d = certificateDelta(period, current, prior);
  if (!d) return <span className="text-xs text-muted-foreground">no prior year</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="tabular-nums">{prior}</span>
      <Badge
        variant="outline"
        className={cn(
          'text-xs',
          d.direction === 'down' && 'border-destructive/40 text-destructive',
          d.direction === 'up' && 'border-green-600/40 text-green-700 dark:text-green-400',
        )}
      >
        {d.delta > 0 ? '+' : ''}
        {d.delta}
      </Badge>
    </span>
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
  const { data, isLoading, error, isFetching } = useCstReport(period, anchor);

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

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">CST report</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Client activity and certificates issued for Live Clients, grouped by primary CSC.
          </p>
        </div>
        <div className="inline-flex rounded-lg bg-muted p-1 gap-1" role="group" aria-label="Report period">
          {CST_PERIOD_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              aria-pressed={period === o.value}
              onClick={() => {
                setPeriod(o.value);
                setAnchor(today);
              }}
              className={cn(
                'px-3 py-1.5 text-sm font-semibold rounded-md transition-colors',
                period === o.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
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
        <span className="font-semibold min-w-[11rem]">{label || 'Loading…'}</span>
        {!rolling && (
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            aria-label="Next period"
            disabled={atCurrent}
            onClick={() => setAnchor(shiftAnchor(anchor, period, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        )}
        <Badge variant="secondary">Live Clients{data ? ` · ${data.totals.live_rtos}` : ''}</Badge>
        {isFetching && !isLoading && <span className="text-xs text-muted-foreground">Updating…</span>}
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          disabled={!data}
          onClick={() => data && downloadCsv(data)}
        >
          <Download className="h-3.5 w-3.5 mr-1.5" />
          Export CSV
        </Button>
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive" role="alert">
          The report could not be loaded. {(error as Error).message}
        </div>
      ) : isLoading || !data ? (
        <div className="h-64 rounded-lg border bg-muted/40 animate-pulse" aria-busy="true" />
      ) : (
        <div className="rounded-lg border overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2 font-semibold">Primary CSC</th>
                <th className="px-3 py-2 font-semibold text-right">Live RTOs</th>
                <th className="px-3 py-2 font-semibold text-right">Client users</th>
                <th className="px-3 py-2 font-semibold text-right">Active users</th>
                <th className="px-3 py-2 font-semibold">Activity rate</th>
                <th className="px-3 py-2 font-semibold text-right">RTOs active</th>
                <th className="px-3 py-2 font-semibold text-right">Never signed in</th>
                <th className="px-3 py-2 font-semibold text-right">Certificates</th>
                <th className="px-3 py-2 font-semibold text-right">Prior period</th>
              </tr>
            </thead>
            <tbody>
              {data.csc.map((c) => {
                const key = c.csc_user_id ?? 'unassigned';
                const isOpen = open.has(key);
                return (
                  <Fragment key={key}>
                    <tr
                      className="border-b cursor-pointer hover:bg-muted/40"
                      onClick={() => toggle(key)}
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          toggle(key);
                        }
                      }}
                      aria-expanded={isOpen}
                    >
                      <td className="px-3 py-2 font-semibold">
                        <span className="inline-flex items-center gap-1.5">
                          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          {c.csc_name}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{c.live_rtos}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{c.client_users}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{c.active_users}</td>
                      <td className="px-3 py-2"><Meter part={c.active_users} whole={c.client_users} /></td>
                      <td className="px-3 py-2 text-right tabular-nums">{c.rtos_active} of {c.rtos_with_users}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{c.never_signed_in}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">{c.certificates}</td>
                      <td className="px-3 py-2 text-right"><Delta period={period} current={c.certificates} prior={c.prior_certificates} /></td>
                    </tr>
                    {isOpen &&
                      c.rtos.map((r) => (
                        <tr key={r.tenant_id} className="border-b bg-muted/30 text-muted-foreground">
                          <td className="pl-10 pr-3 py-1.5">
                            <Link to={`/tenant/${r.tenant_id}`} className="text-foreground hover:underline">
                              {r.tenant_name}
                            </Link>
                          </td>
                          <td />
                          <td className="px-3 py-1.5 text-right tabular-nums">{r.client_users}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{r.active_users}</td>
                          <td className="px-3 py-1.5"><Meter part={r.active_users} whole={r.client_users} /></td>
                          <td />
                          <td className="px-3 py-1.5 text-right tabular-nums">{r.never_signed_in}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{r.certificates}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{r.prior_certificates}</td>
                        </tr>
                      ))}
                  </Fragment>
                );
              })}
              <tr className="bg-muted/40 font-semibold">
                <td className="px-3 py-2">All Live Clients</td>
                <td className="px-3 py-2 text-right tabular-nums">{data.totals.live_rtos}</td>
                <td className="px-3 py-2 text-right tabular-nums">{data.totals.client_users}</td>
                <td className="px-3 py-2 text-right tabular-nums">{data.totals.active_users}</td>
                <td className="px-3 py-2"><Meter part={data.totals.active_users} whole={data.totals.client_users} /></td>
                <td className="px-3 py-2 text-right tabular-nums">{data.totals.rtos_active} of {data.totals.rtos_with_users}</td>
                <td className="px-3 py-2 text-right tabular-nums">{data.totals.never_signed_in}</td>
                <td className="px-3 py-2 text-right tabular-nums">{data.totals.certificates}</td>
                <td className="px-3 py-2 text-right"><Delta period={period} current={data.totals.certificates} prior={data.totals.prior_certificates} /></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
        <div className="rounded-lg border p-3 space-y-1">
          <h3 className="font-semibold">Live Clients</h3>
          <p className="text-muted-foreground">The same list as Manage Tenants: status Active, On hold, In Arears or Warning, not archived, RTO accounts only.</p>
        </div>
        <div className="rounded-lg border p-3 space-y-1">
          <h3 className="font-semibold">Counts as activity</h3>
          <p className="text-muted-foreground">A client user's portal page view, login, message sent or read, Academy lesson completed, or a course they enrolled in themselves.</p>
        </div>
        <div className="rounded-lg border p-3 space-y-1">
          <h3 className="font-semibold">Does not count</h3>
          <p className="text-muted-foreground">Vivacity staff (including viewing as a client), documents staff share, automatic enrolments, system events and archived users.</p>
        </div>
        <div className="rounded-lg border p-3 space-y-1">
          <h3 className="font-semibold">Certificates and users</h3>
          <p className="text-muted-foreground">Certificates count the issue date of a non-revoked certificate. Client users exclude Vivacity staff and archived users. Past periods use current users and Live status.</p>
        </div>
      </div>
    </div>
  );
}
