import { format, formatDistanceStrict } from 'date-fns';
import { Archive } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { ClientPackageDashboardRow } from '@/hooks/use-client-package-dashboard';

interface Props {
  dashboard: ClientPackageDashboardRow;
}

/**
 * Compact one-line row representing a completed (historical) package.
 *
 * Only renders identity + period + a muted "Completed" pill — never the active
 * stat tiles, stepper, hours, action row, etc. Closed packages render here
 * instead of as full PackageCards so they stop reading as broken-looking
 * dashboards (0:00 hours, 100d-stale activity, empty "What's next").
 *
 * Non-interactive in v1: no hover state, no click handler. A future
 * "click to expand and see what was delivered" enhancement would belong here.
 */
export function HistoricalPackageRow({ dashboard }: Props) {
  const {
    package_name,
    package_type,
    start_date,
    end_date,
  } = dashboard;

  const start = start_date ? new Date(start_date) : null;
  const end = end_date ? new Date(end_date) : null;
  const startValid = start && !Number.isNaN(start.getTime());
  const endValid = end && !Number.isNaN(end.getTime());

  // Same dedup rule as PackageCard: don't double up the tier badge when it
  // restates the package name (e.g. some legacy rows use the type as the name).
  const showTierBadge =
    !!package_type &&
    package_type.trim().length > 0 &&
    package_type !== package_name;

  let periodText: string | null = null;
  if (startValid && endValid) {
    periodText = `${format(start as Date, 'd MMM yyyy')} → ${format(end as Date, 'd MMM yyyy')}`;
  } else if (startValid) {
    periodText = `Started ${format(start as Date, 'd MMM yyyy')}`;
  }

  const durationText =
    startValid && endValid
      ? formatDistanceStrict(end as Date, start as Date)
      : null;

  return (
    <div className="flex items-center gap-3 p-3 rounded-md border bg-card/50">
      <Archive className="h-4 w-4 shrink-0 text-muted-foreground" />

      <span className="text-sm font-medium text-foreground truncate">
        {package_name ?? 'Package'}
      </span>

      {showTierBadge && (
        <Badge variant="secondary" className="text-xs shrink-0">
          {package_type}
        </Badge>
      )}

      {periodText && (
        <span className="text-sm text-muted-foreground truncate">
          {periodText}
        </span>
      )}

      {durationText && (
        <span className="ml-auto text-xs text-muted-foreground shrink-0">
          {durationText}
        </span>
      )}

      <Badge
        variant="outline"
        className={`text-xs shrink-0 text-muted-foreground ${durationText ? '' : 'ml-auto'}`}
      >
        Completed
      </Badge>
    </div>
  );
}
