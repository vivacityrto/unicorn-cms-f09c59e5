import { Link } from 'react-router-dom';
import { Activity, Award, ChevronRight, UserX, Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCstReport } from '@/features/eos-cst/useCstReport';
import { certificateDelta, formatPercent, percent } from '@/features/eos-cst/cstReport';

interface SignalProps {
  label: string;
  value: string;
  detail: string;
  icon: React.ElementType;
  tone: 'good' | 'bad' | 'neutral';
}

function Signal({ label, value, detail, icon: Icon, tone }: SignalProps) {
  const tones = {
    good: 'text-green-700 dark:text-green-400',
    bad: 'text-destructive',
    neutral: 'text-foreground',
  };
  return (
    <div className="rounded-lg border bg-card p-4 flex flex-col gap-1.5 min-w-0">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        <span className="truncate">{label}</span>
      </div>
      <div className={cn('text-3xl font-bold leading-none tabular-nums', tones[tone])}>{value}</div>
      <p className="text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

/**
 * Four headline CST numbers for Live Client RTOs: activity over the last
 * 28 days, plus certificates issued this month against last month.
 * Definitions: docs/kb/reference/cst-scorecard-metric-dictionary-2026-11-17.md
 */
export function CstSignalCards() {
  const activity = useCstReport('days28');
  const month = useCstReport('month');

  if (activity.isLoading || month.isLoading) {
    return (
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4" aria-busy="true">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-[104px] rounded-lg border bg-muted/40 animate-pulse" />
        ))}
      </div>
    );
  }

  if (activity.error || month.error || !activity.data || !month.data) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
        CST numbers could not be loaded. {(activity.error ?? month.error)?.message ?? 'Try again shortly.'}
      </div>
    );
  }

  const a = activity.data.totals;
  const m = month.data.totals;
  const rate = percent(a.active_users, a.client_users);
  const rtoRate = percent(a.rtos_active, a.rtos_with_users);
  const delta = certificateDelta('month', m.certificates, m.prior_certificates);

  return (
    <section className="space-y-2" aria-label="CST headline numbers">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">CST: Live Clients</h2>
        <Link to="/eos/cst-report" className="text-sm text-primary hover:underline inline-flex items-center gap-1">
          Open the CST report <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <Signal
          label="Client activity (28 days)"
          value={formatPercent(a.active_users, a.client_users)}
          detail={`${a.active_users} of ${a.client_users} client users were active`}
          icon={Activity}
          tone={rate === null ? 'neutral' : rate >= 50 ? 'good' : 'bad'}
        />
        <Signal
          label="RTOs with activity"
          value={`${a.rtos_active} of ${a.rtos_with_users}`}
          detail={`${formatPercent(a.rtos_active, a.rtos_with_users)} of Live RTOs with users. ${a.rtos_with_users - a.rtos_active} had none`}
          icon={Building2}
          tone={rtoRate === null ? 'neutral' : rtoRate >= 60 ? 'good' : 'bad'}
        />
        <Signal
          label="Certificates issued (month)"
          value={String(m.certificates)}
          detail={
            delta
              ? `${m.prior_certificates} last month (${delta.delta > 0 ? '+' : ''}${delta.delta})`
              : 'No prior month to compare'
          }
          icon={Award}
          tone={delta?.direction === 'down' ? 'bad' : 'neutral'}
        />
        <Signal
          label="Users never signed in"
          value={String(a.never_signed_in)}
          detail={`${formatPercent(a.never_signed_in, a.client_users)} of ${a.client_users} client users`}
          icon={UserX}
          tone={a.never_signed_in > 0 ? 'bad' : 'good'}
        />
      </div>
    </section>
  );
}
