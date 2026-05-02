import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { formatHours, formatWorkType } from './formatters';
import type { ClientPackageHoursByTypeRow } from '@/hooks/use-client-package-hours-by-type';

interface Props {
  rows: ClientPackageHoursByTypeRow[];
  isLoading: boolean;
  isError: boolean;
}

// Visual differentiation only — not semantic. "Other" always uses slate.
const PALETTE = [
  'bg-emerald-500',
  'bg-blue-500',
  'bg-violet-500',
  'bg-amber-500',
  'bg-slate-500',
];
const OTHER_COLOR = 'bg-slate-400';

interface DisplayRow {
  key: string;
  work_type: string;
  work_sub_type: string | null;
  hours: number;
  pct_of_total: number;
  colorClass: string;
}

function buildDisplayRows(rows: ClientPackageHoursByTypeRow[]): DisplayRow[] {
  if (rows.length <= 5) {
    return rows.map((r, i) => ({
      key: `${r.work_type}::${r.work_sub_type ?? ''}`,
      work_type: r.work_type,
      work_sub_type: r.work_sub_type,
      hours: Number(r.hours) || 0,
      pct_of_total: Number(r.pct_of_total) || 0,
      colorClass: PALETTE[i % PALETTE.length],
    }));
  }

  const top: DisplayRow[] = rows.slice(0, 5).map((r, i) => ({
    key: `${r.work_type}::${r.work_sub_type ?? ''}`,
    work_type: r.work_type,
    work_sub_type: r.work_sub_type,
    hours: Number(r.hours) || 0,
    pct_of_total: Number(r.pct_of_total) || 0,
    colorClass: PALETTE[i % PALETTE.length],
  }));

  const rest = rows.slice(5);
  const restHours = rest.reduce((sum, r) => sum + (Number(r.hours) || 0), 0);
  const restPct = rest.reduce((sum, r) => sum + (Number(r.pct_of_total) || 0), 0);

  top.push({
    key: '__other__',
    work_type: `Other (${rest.length} categories)`,
    work_sub_type: null,
    hours: Math.round(restHours * 100) / 100,
    pct_of_total: restPct,
    colorClass: OTHER_COLOR,
  });

  return top;
}

function SectionHeading() {
  return (
    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      Where your hours went
    </h4>
  );
}

export function PackageHoursBreakdown({ rows, isLoading, isError }: Props) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        <SectionHeading />
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-6 w-full rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-2">
        <SectionHeading />
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
          Couldn't load hours breakdown.
        </div>
      </div>
    );
  }

  // Empty state — hide the entire section per spec.
  if (rows.length === 0) return null;

  const display = buildDisplayRows(rows);

  return (
    <div className="space-y-2">
      <SectionHeading />
      <ul className="space-y-2">
        {display.map((row) => {
          const pctNum = Math.round(row.pct_of_total * 100);
          const widthPct = Math.min(100, Math.max(0, row.pct_of_total * 100));
          return (
            <li
              key={row.key}
              className="flex flex-col md:flex-row md:items-center gap-1 md:gap-3"
            >
              {/* Label column */}
              <div className="md:w-2/5 md:flex-shrink-0 min-w-0">
                <span className="text-sm font-medium text-foreground truncate block">
                  {row.key === '__other__' ? row.work_type : formatWorkType(row.work_type)}
                  {row.work_sub_type && (
                    <span className="text-muted-foreground font-normal">
                      {' · '}
                      {formatWorkType(row.work_sub_type)}
                    </span>
                  )}
                </span>
              </div>

              {/* Bar column */}
              <div className="flex-1 min-w-0">
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn('h-full rounded-full', row.colorClass)}
                    style={{ width: `${widthPct}%` }}
                  />
                </div>
              </div>

              {/* Value column */}
              <div className="md:w-20 md:flex-shrink-0 md:text-right text-xs tabular-nums">
                <span className="text-foreground font-medium">
                  {formatHours(row.hours)}
                </span>
                <span className="text-muted-foreground"> · {pctNum}%</span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
