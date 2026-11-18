import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { certificateDelta, formatPercent, lastActiveText, percent, type CstPeriod, type CstReport } from '@/features/eos-cst/cstReport';
import {
  bucketByTime,
  clientBuckets,
  cscRates,
  flattenRtos,
  periodDates,
  toClientRow,
  topCounts,
  userSplit,
  type RtoRow,
} from '@/features/eos-cst/cstInsights';
import { countBy } from '@/features/eos-scorecard/cstBreakdown';
import type { AcademyActivity } from '@/features/eos-scorecard/metricReport';
import { shortDate, sydneyDate } from '@/features/eos-scorecard/scorecardView';
import { useCertificatesBetween, useNeverSignedInPeople } from '@/features/eos-scorecard/useMetricReport';
import { ClientDetailPanel } from '@/components/eos/scorecard-review/ClientDetailPanel';
import { DrillCard, type DrillStep } from '@/components/eos/scorecard-review/DrillCard';
import { SplitBar } from '@/components/eos/scorecard-review/SplitBar';
import { Columns, HBars, Panel, Ring, RowTable, StatTile } from './CstCharts';

export type WhyKey = 'portal' | 'certificates' | 'never' | 'academy';

interface WhyPanelProps {
  which: WhyKey;
  report: CstReport;
  period: CstPeriod;
  label: string;
  academy: { data: AcademyActivity | undefined; isLoading: boolean; error: Error | null };
}

type ClientStep = DrillStep & { row: RtoRow };

const clientStep = (row: RtoRow): ClientStep => ({ key: `client:${row.tenant_id}`, label: row.tenant_name, row });
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const loading = <div className="h-24 animate-pulse rounded-lg bg-muted/50" aria-busy="true" />;

/** The clients table for the portal panel: pick who to look at, then open one in place to see its people. */
function ClientsDrill({ rows, detailEnd }: { rows: RtoRow[]; detailEnd: string }) {
  type F = 'quiet' | 'active' | 'all';
  const [filter, setFilter] = useState<F>('quiet');
  const withUsers = rows.filter((r) => r.client_users > 0);
  const shown = useMemo(() => {
    const picked = filter === 'quiet' ? withUsers.filter((r) => r.active_users === 0) : filter === 'active' ? withUsers.filter((r) => r.active_users > 0) : withUsers;
    return [...picked].sort((a, b) => b.client_users - a.client_users || a.tenant_name.localeCompare(b.tenant_name));
  }, [withUsers, filter]);
  const options: { value: F; label: string; n: number }[] = [
    { value: 'quiet', label: 'Nobody active', n: withUsers.filter((r) => r.active_users === 0).length },
    { value: 'active', label: 'Someone active', n: withUsers.filter((r) => r.active_users > 0).length },
    { value: 'all', label: 'All', n: withUsers.length },
  ];
  return (
    <DrillCard<ClientStep>
      title="Clients"
      hint="Biggest first. Choose a client to see each person, what they did and the courses and certificates they have."
      root={(open) => (
        <div className="space-y-2">
          <div role="group" aria-label="Which clients" className="inline-flex gap-1 rounded-lg bg-muted p-1">
            {options.map((o) => (
              <button
                key={o.value}
                type="button"
                aria-pressed={filter === o.value}
                onClick={() => setFilter(o.value)}
                className={cn('rounded-md px-3 py-1 text-sm font-semibold', filter === o.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
              >
                {o.label} {o.n}
              </button>
            ))}
          </div>
          <RowTable
            head={['Client', 'CSC', 'People active', 'Last active']}
            empty="No clients in this view."
            onRowClick={(i) => open(clientStep(shown[i]))}
            rows={shown.map((r) => [r.tenant_name, r.cscName, `${r.active_users} of ${r.client_users}`, r.last_active_at === undefined ? '–' : lastActiveText(r.last_active_at)])}
          />
        </div>
      )}
      page={(step) => <ClientDetailPanel row={toClientRow(step.row)} weekEnding={detailEnd} />}
    />
  );
}

function PortalWhy({ report, detailEnd }: { report: CstReport; detailEnd: string }) {
  const rows = useMemo(() => flattenRtos(report), [report]);
  const { active, quiet } = userSplit(report.totals);
  const buckets = clientBuckets(rows);
  const withUsers = rows.length - buckets.noUsers;
  const rates = cscRates(report).filter((c) => c.pct !== null);
  const best = useMemo(() => topCounts(rows.filter((r) => r.client_users > 0), (r) => r.tenant_name, (r) => r.active_users, 5), [rows]);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-4">
        <Ring pct={percent(active, report.totals.client_users)} size={88} stroke={10} label={`${formatPercent(active, report.totals.client_users)} of users were active`}>
          {formatPercent(active, report.totals.client_users)}
        </Ring>
        <div className="min-w-[16rem] flex-1 space-y-1.5">
          <p className="text-base font-semibold leading-snug">
            {active} of {report.totals.client_users} client users did something in this period. {buckets.nobody} of {withUsers} clients that have users had nobody active.
          </p>
          <SplitBar
            split={[
              { label: 'Active users', count: active, tone: 'good' },
              { label: 'Quiet users', count: quiet, tone: 'bad' },
            ]}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <StatTile label="Clients with someone active" value={withUsers - buckets.nobody} tone="text-green-700 dark:text-green-400" />
        <StatTile label="Clients with nobody active" value={buckets.nobody} tone="text-red-700 dark:text-red-400" />
        <StatTile label="Clients with no users yet" value={buckets.noUsers} />
        <StatTile label="Client users" value={report.totals.client_users} />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Panel title="Use of the portal by CSC" hint="Share of each CSC’s client users who were active.">
          <HBars items={rates.map((c) => ({ label: c.name, value: c.pct ?? 0, display: `${c.pct}%`, sub: `${c.active} of ${c.users} users · ${plural(c.clients, 'client')}` }))} empty="No CSC has client users yet." />
        </Panel>
        <Panel title="How clients are spread" hint="Clients by the share of their own users who were active.">
          <HBars
            tone="bad"
            items={[
              { label: 'Nobody active', value: buckets.nobody, display: String(buckets.nobody) },
              { label: 'A quarter or fewer', value: buckets.quarter, display: String(buckets.quarter) },
              { label: 'Up to half', value: buckets.half, display: String(buckets.half) },
              { label: 'More than half', value: buckets.most, display: String(buckets.most) },
            ]}
            empty="No clients."
          />
        </Panel>
        <Panel title="Most active clients" hint="Most users active in the period.">
          <HBars tone="good" items={best.map((b) => ({ label: b.label, value: b.count, display: `${b.count} active` }))} empty="Nobody was active." />
        </Panel>
      </div>

      <ClientsDrill rows={rows} detailEnd={detailEnd} />
    </div>
  );
}

function CertificatesWhy({ report, period, label, from, to }: { report: CstReport; period: CstPeriod; label: string; from: string; to: string }) {
  const tenantIds = useMemo(() => flattenRtos(report).map((r) => r.tenant_id), [report]);
  const certs = useCertificatesBetween(from, to, tenantIds);
  const list = useMemo(() => certs.data ?? [], [certs.data]);
  const delta = certificateDelta(period, report.totals.certificates, report.totals.prior_certificates);
  const series = useMemo(() => bucketByTime(list.map((c) => c.issuedAt), from, to), [list, from, to]);
  const byCsc = topCounts(report.csc, (c) => c.csc_name, (c) => c.certificates);
  const total = report.totals.certificates;
  const deltaText = !delta ? '' : delta.direction === 'flat' ? ' That is the same as the period before.' : ` That is ${Math.abs(delta.delta)} ${delta.direction === 'up' ? 'more' : 'fewer'} than the period before.`;
  return (
    <div className="space-y-3">
      <p className="text-base font-semibold leading-snug">
        {plural(total, 'certificate')} {total === 1 ? 'was' : 'were'} issued in {label}.{deltaText}
      </p>
      {certs.isLoading ? (
        loading
      ) : certs.error ? (
        <p className="text-sm text-destructive" role="alert">The certificate list could not be loaded.</p>
      ) : (
        <>
          <Panel title="When they were issued" hint={series.length > 12 && series[0].key.length === 7 ? 'By month.' : 'By day.'}>
            <Columns buckets={series} label="Certificates issued" />
          </Panel>
          <div className="grid gap-3 lg:grid-cols-3">
            <Panel title="By course">
              <HBars items={countBy(list, (c) => c.course).slice(0, 8).map((c) => ({ label: c.label, value: c.count, display: String(c.count) }))} empty="None." />
            </Panel>
            <Panel title="By client">
              <HBars items={countBy(list, (c) => c.client).slice(0, 8).map((c) => ({ label: c.label, value: c.count, display: String(c.count) }))} empty="None." />
            </Panel>
            <Panel title="By CSC" hint="Certificates earned by each CSC’s clients.">
              <HBars items={byCsc.map((c) => ({ label: c.label, value: c.count, display: String(c.count) }))} empty="None." />
            </Panel>
          </div>
          <Panel title="Who earned them">
            <RowTable head={['Learner', 'Course', 'Client', 'Issued']} empty="No certificates were issued in this period." rows={list.map((c) => [c.learner, c.course, c.client, shortDate(sydneyDate(new Date(c.issuedAt)))])} />
          </Panel>
        </>
      )}
    </div>
  );
}

function NeverWhy({ report }: { report: CstReport }) {
  const rows = useMemo(() => flattenRtos(report), [report]);
  const tenantIds = useMemo(() => rows.map((r) => r.tenant_id), [rows]);
  const people = useNeverSignedInPeople(tenantIds);
  const [all, setAll] = useState(false);
  const never = report.totals.never_signed_in;
  const clientsWith = rows.filter((r) => r.never_signed_in > 0).length;
  const byCsc = topCounts(report.csc, (c) => c.csc_name, (c) => c.never_signed_in);
  const byClient = topCounts(rows, (r) => r.tenant_name, (r) => r.never_signed_in, 10);
  const waiting = useMemo(() => [...(people.data ?? [])].sort((a, b) => (a.addedOn ?? '9999').localeCompare(b.addedOn ?? '9999')), [people.data]);
  const shown = all ? waiting : waiting.slice(0, 10);
  const today = Date.now();
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-4">
        <Ring pct={percent(never, report.totals.client_users)} size={88} stroke={10} tone="bad" label={`${formatPercent(never, report.totals.client_users)} of users have never signed in`}>
          {formatPercent(never, report.totals.client_users)}
        </Ring>
        <p className="min-w-[16rem] flex-1 text-base font-semibold leading-snug">
          {never} of {report.totals.client_users} client users have been invited but have never signed in, across {plural(clientsWith, 'client')}. Each one is a person the client paid for who has not started.
        </p>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="By CSC" hint="Never signed in, across each CSC’s clients.">
          <HBars tone="bad" items={byCsc.map((c) => ({ label: c.label, value: c.count, display: String(c.count) }))} empty="Everyone has signed in." />
        </Panel>
        <Panel title="Clients with the most" hint="The ten with the most people who have never signed in.">
          <HBars tone="bad" items={byClient.map((c) => ({ label: c.label, value: c.count, display: String(c.count) }))} empty="Everyone has signed in." />
        </Panel>
      </div>
      <Panel title="The people, longest wait first" hint="As of today. Chase them, or remove them if they have left.">
        {people.isLoading ? (
          loading
        ) : people.error ? (
          <p className="text-sm text-destructive" role="alert">The list could not be loaded.</p>
        ) : (
          <>
            <RowTable
              head={['Person', 'Client', 'Added', 'Waiting']}
              empty="Nobody is waiting to sign in."
              rows={shown.map((p) => [p.name, p.client, p.addedOn ? shortDate(sydneyDate(new Date(p.addedOn))) : '–', p.addedOn ? `${Math.max(0, Math.floor((today - new Date(p.addedOn).getTime()) / 86_400_000))} days` : '–'])}
            />
            {waiting.length > 10 && (
              <button type="button" onClick={() => setAll((a) => !a)} className="text-sm font-semibold text-primary underline-offset-2 hover:underline">
                {all ? 'Show fewer' : `Show all ${waiting.length}`}
              </button>
            )}
          </>
        )}
      </Panel>
    </div>
  );
}

function AcademyWhy({ report, label, academy }: { report: CstReport; label: string; academy: WhyPanelProps['academy'] }) {
  const rows = useMemo(() => flattenRtos(report), [report]);
  const a = academy.data;
  const perClient = useMemo(() => (a ? rows.map((r) => ({ r, ...(a.byTenant[r.tenant_id] ?? { enrolled: 0, completed: 0 }) })) : []), [rows, a]);
  const using = perClient.filter((c) => c.enrolled + c.completed > 0);
  const idle = perClient.filter((c) => c.enrolled + c.completed === 0);
  if (academy.isLoading) return loading;
  if (academy.error || !a) return <p className="text-sm text-destructive" role="alert">Academy activity could not be loaded.</p>;
  return (
    <div className="space-y-3">
      <p className="text-base font-semibold leading-snug">
        In {label}, {plural(a.enrolled, 'enrolment')} {a.enrolled === 1 ? 'was' : 'were'} made and {plural(a.completed, 'course')} {a.completed === 1 ? 'was' : 'were'} finished, across {using.length} of {rows.length} Live Clients.
      </p>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        <StatTile label="Enrolments" value={a.enrolled} />
        <StatTile label="Chosen by the learner" value={a.selfEnrolled} />
        <StatTile label="Added automatically" value={a.automatic} />
        <StatTile label="Courses finished" value={a.completed} tone="text-green-700 dark:text-green-400" />
        <StatTile label="Clients using the Academy" value={`${using.length} of ${rows.length}`} />
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        <Panel title="How people got on a course" hint="Chosen by the learner is the real appetite; automatic ones are put there for them.">
          <HBars
            items={[
              { label: 'Chosen by the learner', value: a.selfEnrolled, display: String(a.selfEnrolled) },
              { label: 'Added automatically', value: a.automatic, display: String(a.automatic) },
              { label: 'Added another way', value: a.other, display: String(a.other) },
            ]}
            empty="No enrolments."
          />
        </Panel>
        <Panel title="Busiest courses" hint="Darker part is finished.">
          <HBars items={a.topCourses.map((c) => ({ label: c.title, value: c.enrolled, part: Math.min(c.completed, c.enrolled), display: `${c.enrolled} enrolled · ${c.completed} finished` }))} empty="No Academy activity in this period." />
        </Panel>
        <Panel title="Enrolled, but nobody finished" hint="Courses with three or more enrolments and no completion.">
          <HBars tone="bad" items={a.stalled.map((c) => ({ label: c.title, value: c.enrolled, display: `${c.enrolled} enrolled` }))} empty="Every course with three or more enrolments has had a completion." />
        </Panel>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Clients using the Academy most" hint="Darker part is finished.">
          <HBars
            tone="good"
            items={[...using].sort((x, y) => y.enrolled + y.completed - (x.enrolled + x.completed) || x.r.tenant_name.localeCompare(y.r.tenant_name)).slice(0, 8).map((c) => ({ label: c.r.tenant_name, value: Math.max(c.enrolled, c.completed), part: c.completed, display: `${c.enrolled} enrolled · ${c.completed} finished` }))}
            empty="No client used the Academy in this period."
          />
        </Panel>
        <Panel title="Live Clients with no Academy activity" hint={`${idle.length} of ${rows.length}. These are the ones to ask why.`}>
          {idle.length === 0 ? (
            <p className="text-sm text-muted-foreground">Every Live Client used the Academy.</p>
          ) : (
            <ul className="flex max-h-48 flex-wrap gap-1.5 overflow-y-auto">
              {idle.map((c) => (
                <li key={c.r.tenant_id} className="rounded-full border bg-muted/40 px-2.5 py-0.5 text-xs">{c.r.tenant_name}</li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
      <p className="text-xs text-muted-foreground">Enrolments are counted on the day they were made and completions on the day the course was finished, for Live Clients only.</p>
    </div>
  );
}

const TITLE: Record<WhyKey, string> = {
  portal: 'Why use of the portal is where it is',
  certificates: 'What is behind the certificates',
  never: 'Who has never signed in',
  academy: 'What is happening in the Academy',
};

/** The section under the cards: it changes with the card chosen and slides in, so the person sees the reason for the number. */
export function CstWhyPanel({ which, report, period, label, academy }: WhyPanelProps) {
  const { from, to } = useMemo(() => periodDates(report), [report]);
  const today = sydneyDate();
  return (
    <section key={which} id="cst-why" aria-label={TITLE[which]} className="space-y-3 rounded-xl border bg-card p-4 duration-300 animate-in fade-in slide-in-from-bottom-3 motion-reduce:animate-none">
      <h2 className="text-xl font-bold">{TITLE[which]}</h2>
      {which === 'portal' && <PortalWhy report={report} detailEnd={to > today ? today : to} />}
      {which === 'certificates' && <CertificatesWhy report={report} period={period} label={label} from={from} to={to} />}
      {which === 'never' && <NeverWhy report={report} />}
      {which === 'academy' && <AcademyWhy report={report} label={label} academy={academy} />}
    </section>
  );
}
