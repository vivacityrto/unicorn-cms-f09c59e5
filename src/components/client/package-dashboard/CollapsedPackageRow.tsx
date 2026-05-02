import { ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { ClientPackageDashboardRow } from '@/hooks/use-client-package-dashboard';
import { PackageStatusPill } from './PackageStatusPill';
import { formatHours } from './formatters';

interface Props {
  dashboard: ClientPackageDashboardRow;
  onExpand: () => void;
}

/**
 * One-line collapsed summary of a client package. Click anywhere — or hit
 * Enter/Space when focused — to expand into the full PackageCard.
 *
 * Shown for every non-most-recently-active package on /client/packages when a
 * tenant has more than one package. Mirrors the PackageCard header dedup logic
 * for the tier-pill so we don't double up "Diamond RTO Membership" + "membership".
 */
export function CollapsedPackageRow({ dashboard, onExpand }: Props) {
  const name = dashboard.package_name ?? 'Package';
  const showTier =
    !!dashboard.package_type && dashboard.package_type !== name;

  // Build the secondary summary line, omitting null/zero parts.
  const stagesPart =
    dashboard.stages_total > 0
      ? `${dashboard.stages_complete} / ${dashboard.stages_total} stages`
      : null;

  const hoursPart =
    Number(dashboard.hours_total) > 0
      ? `${formatHours(Number(dashboard.hours_remaining) || 0)} remaining`
      : null;

  const stagePart = dashboard.current_stage_shortname
    ? `Currently in ${dashboard.current_stage_shortname}`
    : null;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onExpand();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-expanded={false}
      aria-label={`Expand ${name}`}
      onClick={onExpand}
      onKeyDown={handleKeyDown}
      className="flex items-center gap-3 p-3 rounded-md border bg-card hover:bg-accent/50 cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />

      <h3 className="font-medium text-foreground truncate">{name}</h3>

      {showTier && (
        <Badge variant="secondary" className="text-xs hidden sm:inline-flex shrink-0">
          {dashboard.package_type}
        </Badge>
      )}

      {(stagesPart || hoursPart || stagePart) && (
        <p className="text-sm text-muted-foreground truncate min-w-0">
          {stagesPart && <span>{stagesPart}</span>}
          {stagesPart && hoursPart && <span> · </span>}
          {hoursPart && <span>{hoursPart}</span>}
          {(stagesPart || hoursPart) && stagePart && (
            <span className="hidden md:inline"> · </span>
          )}
          {stagePart && <span className="hidden md:inline">{stagePart}</span>}
        </p>
      )}

      <div className="ml-auto shrink-0">
        <PackageStatusPill status={dashboard.status_pill} />
      </div>
    </div>
  );
}
