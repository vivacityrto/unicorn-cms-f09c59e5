import { useMemo, useState } from 'react';
import { Award, BookOpen, ChevronDown, Mail } from 'lucide-react';
import { cn } from '@/lib/utils';
import { lastActiveText } from '@/features/eos-cst/cstReport';
import type { CstClientRow } from '@/features/eos-scorecard/cstBreakdown';
import {
  PERSON_STATUS_LABEL,
  personNote,
  personStatus,
  summarisePeople,
  type ClientPerson,
  type PersonStatus,
} from '@/features/eos-scorecard/clientDetail';
import { shortDate, sydneyDate } from '@/features/eos-scorecard/scorecardView';
import { useClientDetail } from '@/features/eos-scorecard/useClientDetail';

const day = (iso: string | null) => (iso ? shortDate(sydneyDate(new Date(iso))) : '–');

const STATUS_CHIP: Record<PersonStatus, string> = {
  active: 'bg-green-100 text-green-900 dark:bg-green-950/50 dark:text-green-200',
  quiet: 'bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200',
  never: 'bg-red-100 text-red-900 dark:bg-red-950/50 dark:text-red-200',
};

function Tile({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-lg bg-muted/50 p-3">
      <p className={cn('text-2xl font-bold tabular-nums', tone)}>{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="break-words text-sm">{children}</dd>
    </div>
  );
}

function PersonRow({ person }: { person: ClientPerson }) {
  const [open, setOpen] = useState(false);
  const status = personStatus(person);
  const id = `person-${person.userId}`;
  return (
    <li className="rounded-lg border bg-background">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="grid w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 gap-y-0.5 px-3 py-2.5 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">
            {person.name}
            {person.primaryContact && <span className="ml-2 rounded-full bg-primary/15 px-2 py-px text-[11px] font-semibold text-primary">Main contact</span>}
          </span>
          <span className="block truncate text-xs text-muted-foreground">{person.jobTitle ?? person.role ?? 'Client user'}</span>
        </span>
        <span className="hidden text-right text-xs text-muted-foreground sm:block">
          Last active
          <span className="block font-semibold text-foreground">{status === 'never' ? 'Never' : lastActiveText(person.lastActiveAt ?? person.lastSignInAt)}</span>
        </span>
        <span className="flex items-center gap-2">
          <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', STATUS_CHIP[status])}>{PERSON_STATUS_LABEL[status]}</span>
          <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform motion-reduce:transition-none', open && 'rotate-180')} aria-hidden />
        </span>
      </button>

      {open && (
        <div id={id} className="space-y-3 border-t px-3 py-3 duration-150 animate-in fade-in slide-in-from-top-1 motion-reduce:animate-none">
          <p className="text-sm">{personNote(person)}</p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 md:grid-cols-4">
            <Fact label="Email">
              {person.email ? (
                <a className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline" href={`mailto:${person.email}`}>
                  <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span className="min-w-0 break-all">{person.email}</span>
                </a>
              ) : (
                '–'
              )}
            </Fact>
            <Fact label="Added">{day(person.addedAt)}</Fact>
            <Fact label="Last signed in">{person.lastSignInAt ? day(person.lastSignInAt) : 'Never'}</Fact>
            <Fact label="Last did something">{person.lastActiveAt ? day(person.lastActiveAt) : 'Never'}</Fact>
          </dl>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <Tile label="Pages viewed, 28 days" value={person.pages} />
            <Tile label="Sign-ins, 28 days" value={person.logins} />
            <Tile label="Messages, 28 days" value={person.messages} />
            <Tile label="Lessons finished, 28 days" value={person.lessons} />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <h5 className="flex items-center gap-1.5 text-sm font-semibold"><BookOpen className="h-4 w-4" aria-hidden />Courses ({person.courses.length})</h5>
              {person.courses.length === 0 ? (
                <p className="text-sm text-muted-foreground">Not enrolled in any course.</p>
              ) : (
                <ul className="space-y-1">
                  {person.courses.map((c, i) => (
                    <li key={`${c.title}-${i}`} className="flex items-start justify-between gap-2 text-sm">
                      <span className="min-w-0 break-words">{c.title}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {c.completedAt ? `Finished ${day(c.completedAt)}` : `Enrolled ${day(c.enrolledAt)}`}
                        {c.chosenByLearner ? ' · chose it' : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="space-y-1">
              <h5 className="flex items-center gap-1.5 text-sm font-semibold"><Award className="h-4 w-4" aria-hidden />Certificates ({person.certificates.length})</h5>
              {person.certificates.length === 0 ? (
                <p className="text-sm text-muted-foreground">No certificates yet.</p>
              ) : (
                <ul className="space-y-1">
                  {person.certificates.map((c, i) => (
                    <li key={`${c.course}-${i}`} className="flex items-start justify-between gap-2 text-sm">
                      <span className="min-w-0 break-words">{c.course}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {day(c.issuedAt)}
                        {c.thisWeek ? ' · this week' : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </li>
  );
}

type Filter = 'all' | PersonStatus;

/** The mini page for one client: who they are, how many are active, and each person to open up in place. */
export function ClientDetailPanel({ row, weekEnding }: { row: CstClientRow; weekEnding: string }) {
  const detail = useClientDetail(row.tenantId, weekEnding);
  const [filter, setFilter] = useState<Filter>('all');
  const people = useMemo(() => detail.data ?? [], [detail.data]);
  const summary = useMemo(() => summarisePeople(people), [people]);
  const shown = useMemo(() => (filter === 'all' ? people : people.filter((p) => personStatus(p) === filter)), [people, filter]);
  const options: { value: Filter; label: string; n: number }[] = [
    { value: 'all', label: 'Everyone', n: summary.total },
    { value: 'active', label: 'Active', n: summary.active },
    { value: 'quiet', label: 'Quiet', n: summary.quiet },
    { value: 'never', label: 'Never signed in', n: summary.never },
  ];

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-xl font-bold">{row.name}</h3>
        <p className="text-sm text-muted-foreground">
          CSC: {row.cscName} · Last active {row.lastActiveAt === undefined ? '–' : lastActiveText(row.lastActiveAt)}
        </p>
      </div>

      {detail.isLoading ? (
        <div className="space-y-2" aria-busy="true">
          <div className="h-16 animate-pulse rounded-lg bg-muted/50" />
          <div className="h-32 animate-pulse rounded-lg bg-muted/50" />
        </div>
      ) : detail.error ? (
        <p className="text-sm text-destructive" role="alert">The people at this client could not be loaded. Close the report and open it again.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
            <Tile label="People" value={summary.total} />
            <Tile label="Active, 28 days" value={summary.active} tone="text-green-700 dark:text-green-400" />
            <Tile label="Quiet" value={summary.quiet} tone="text-amber-700 dark:text-amber-400" />
            <Tile label="Never signed in" value={summary.never} tone="text-red-700 dark:text-red-400" />
            <Tile label="Certificates this week" value={summary.certificatesThisWeek} />
          </div>

          <div role="group" aria-label="Which people" className="inline-flex flex-wrap gap-1 rounded-lg bg-muted p-1">
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

          {shown.length === 0 ? (
            <p className="text-sm text-muted-foreground">{people.length === 0 ? 'Nobody is set up at this client yet.' : 'Nobody in this view.'}</p>
          ) : (
            <ul className="space-y-2" aria-label="People at this client">
              {shown.map((p) => (
                <PersonRow key={p.userId} person={p} />
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">Active means they did something in the 28 days ending the week under review. Courses and certificates are as of today.</p>
        </>
      )}
    </div>
  );
}
