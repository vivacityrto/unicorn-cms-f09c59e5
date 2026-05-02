import { useMemo } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  CartesianGrid,
} from 'recharts';
import { format, parseISO, differenceInMonths } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { formatHours } from './formatters';
import type { ClientPackageHoursTimelinePoint } from '@/hooks/use-client-package-hours-timeline';

interface Props {
  points: ClientPackageHoursTimelinePoint[];
  hoursTotal: number;             // dashboard.hours_total
  hoursUsed: number;              // dashboard.hours_used (latest cumulative)
  startDate: string | null;       // dashboard.start_date — ISO date
  endDate: string | null;         // dashboard.end_date — ISO date or null for ongoing
  isLoading: boolean;
  isError: boolean;
}

interface ChartPoint {
  /** Date as 'YYYY-MM-DD' */
  date: string;
  /** Numeric (epoch ms) for proper time-axis sorting and today-line placement */
  ts: number;
  actual?: number;
  ideal?: number;
}

function SectionHeading() {
  return (
    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      Hours over time
    </h4>
  );
}

/** Linear interpolation of ideal hours at an arbitrary date between start and end. */
function interpolateIdeal(
  ts: number,
  startTs: number,
  endTs: number,
  hoursTotal: number,
): number | null {
  if (endTs <= startTs) return null;
  if (ts < startTs || ts > endTs) return null;
  const fraction = (ts - startTs) / (endTs - startTs);
  return Math.max(0, Math.min(hoursTotal, fraction * hoursTotal));
}

interface TooltipPayloadItem {
  dataKey: string;
  value: number | undefined;
  payload: ChartPoint;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  hasIdeal: boolean;
  startTs: number;
  endTs: number;
  hoursTotal: number;
}

function CustomTooltip({
  active,
  payload,
  hasIdeal,
  startTs,
  endTs,
  hoursTotal,
}: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0].payload;
  const actual = payload.find((p) => p.dataKey === 'actual')?.value;
  const ideal = hasIdeal
    ? interpolateIdeal(point.ts, startTs, endTs, hoursTotal)
    : null;

  let delta: { text: string; tone: 'ahead' | 'behind' | 'pace' } | null = null;
  if (actual !== undefined && ideal !== null) {
    const diff = actual - ideal;
    if (diff < -0.5) {
      delta = { text: `${formatHours(Math.abs(diff))} ahead of schedule`, tone: 'ahead' };
    } else if (diff > 0.5) {
      delta = { text: `${formatHours(diff)} behind schedule`, tone: 'behind' };
    } else {
      delta = { text: 'On pace', tone: 'pace' };
    }
  }

  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
      <div className="font-medium text-foreground">
        {format(parseISO(point.date), 'd MMM yyyy')}
      </div>
      {actual !== undefined && (
        <div className="mt-1 text-muted-foreground">
          Actual:{' '}
          <span className="font-medium text-foreground tabular-nums">
            {formatHours(actual)}
          </span>
        </div>
      )}
      {ideal !== null && (
        <div className="text-muted-foreground">
          Ideal:{' '}
          <span className="font-medium text-foreground tabular-nums">
            {formatHours(ideal)}
          </span>
        </div>
      )}
      {delta && (
        <div
          className={
            delta.tone === 'ahead'
              ? 'mt-1 text-emerald-600 font-medium'
              : delta.tone === 'behind'
              ? 'mt-1 text-amber-600 font-medium'
              : 'mt-1 text-muted-foreground'
          }
        >
          {delta.text}
        </div>
      )}
    </div>
  );
}

export function PackageBurndownChart({
  points,
  hoursTotal,
  hoursUsed,
  startDate,
  endDate,
  isLoading,
  isError,
}: Props) {
  const hasIdeal = !!startDate && !!endDate && hoursTotal > 0;

  const { chartData, startTs, endTs, xMin, xMax, yMax, dateSpanMonths, todayWithinRange } =
    useMemo(() => {
      const sTs = startDate ? parseISO(startDate).getTime() : 0;
      const eTs = endDate ? parseISO(endDate).getTime() : 0;

      // Build a map keyed by date so ideal endpoints and actual points coexist on
      // the same x-coord without duplicate entries breaking recharts.
      const byDate = new Map<string, ChartPoint>();

      const upsert = (date: string, patch: Partial<ChartPoint>) => {
        const existing = byDate.get(date);
        if (existing) {
          Object.assign(existing, patch);
        } else {
          byDate.set(date, {
            date,
            ts: parseISO(date).getTime(),
            ...patch,
          });
        }
      };

      if (hasIdeal && startDate && endDate) {
        upsert(startDate, { ideal: 0 });
        upsert(endDate, { ideal: hoursTotal });
      }

      points.forEach((p) => {
        upsert(p.activity_date, { actual: Number(p.cumulative_hours_used) });
      });

      const sorted = Array.from(byDate.values()).sort((a, b) => a.ts - b.ts);

      const minTs = sorted.length > 0 ? sorted[0].ts : 0;
      const maxTs = sorted.length > 0 ? sorted[sorted.length - 1].ts : 0;

      const yMaxComputed = Math.ceil(Math.max(hoursTotal, hoursUsed, 1) * 1.1);
      const span = sorted.length > 1
        ? differenceInMonths(new Date(maxTs), new Date(minTs))
        : 0;

      const nowTs = Date.now();
      const todayInRange = sorted.length > 0 && nowTs >= minTs && nowTs <= maxTs;

      return {
        chartData: sorted,
        startTs: sTs,
        endTs: eTs,
        xMin: minTs,
        xMax: maxTs,
        yMax: yMaxComputed,
        dateSpanMonths: span,
        todayWithinRange: todayInRange,
      };
    }, [points, startDate, endDate, hoursTotal, hoursUsed, hasIdeal]);

  if (isLoading) {
    return (
      <div className="space-y-2">
        <SectionHeading />
        <Skeleton className="h-[180px] w-full rounded" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-2">
        <SectionHeading />
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
          Couldn't load hours timeline.
        </div>
      </div>
    );
  }

  // Empty state — hide the entire section per spec.
  if (points.length === 0) return null;

  const xTickFormatter = (ts: number) => {
    if (!ts) return '';
    return format(new Date(ts), dateSpanMonths > 6 ? 'MMM yyyy' : 'd MMM');
  };

  return (
    <div className="space-y-2">
      <SectionHeading />
      <div className="h-[180px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 8, right: 12, bottom: 4, left: -8 }}
          >
            <CartesianGrid
              vertical={false}
              stroke="hsl(var(--border))"
              strokeOpacity={0.4}
            />
            <XAxis
              dataKey="ts"
              type="number"
              scale="time"
              domain={[xMin, xMax]}
              tickFormatter={xTickFormatter}
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
              axisLine={{ stroke: 'hsl(var(--border))' }}
              tickLine={false}
              minTickGap={32}
            />
            <YAxis
              domain={[0, yMax]}
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
              axisLine={false}
              tickLine={false}
              width={32}
              allowDecimals={false}
            />
            <Tooltip
              content={
                <CustomTooltip
                  hasIdeal={hasIdeal}
                  startTs={startTs}
                  endTs={endTs}
                  hoursTotal={hoursTotal}
                />
              }
              cursor={{ stroke: 'hsl(var(--border))', strokeDasharray: '3 3' }}
            />
            {hasIdeal && (
              <Line
                type="linear"
                dataKey="ideal"
                stroke="rgb(148 163 184)" /* slate-400 */
                strokeWidth={1.5}
                strokeDasharray="4 4"
                dot={false}
                activeDot={false}
                connectNulls
                isAnimationActive={false}
              />
            )}
            <Line
              type="stepAfter"
              dataKey="actual"
              stroke="rgb(16 185 129)" /* emerald-500 */
              strokeWidth={2}
              dot={{ r: 3, fill: 'rgb(16 185 129)' }}
              activeDot={{ r: 4 }}
              connectNulls
              isAnimationActive={false}
            />
            {todayWithinRange && (
              <ReferenceLine
                x={Date.now()}
                stroke="#ED1878"
                strokeWidth={1}
                strokeDasharray="3 3"
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
