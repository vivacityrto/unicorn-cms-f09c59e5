import { useState } from 'react';
import { format, differenceInCalendarMonths } from 'date-fns';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { HistoricalPackageRow } from './HistoricalPackageRow';
import type { ClientPackageDashboardRow } from '@/hooks/use-client-package-dashboard';

interface Props {
  packages: ClientPackageDashboardRow[];
  /** Open the section on first render (e.g. tenant has no active packages). */
  defaultExpanded?: boolean;
}

/**
 * Earliest valid start_date across the passed packages, or null when none
 * have a parseable start_date (edge case — shouldn't happen in practice).
 */
function earliestStart(packages: ClientPackageDashboardRow[]): Date | null {
  let earliest: Date | null = null;
  for (const p of packages) {
    if (!p.start_date) continue;
    const d = new Date(p.start_date);
    if (Number.isNaN(d.getTime())) continue;
    if (!earliest || d < earliest) earliest = d;
  }
  return earliest;
}

function formatTenure(memberSince: Date): string {
  const months = Math.max(0, differenceInCalendarMonths(new Date(), memberSince));
  if (months < 12) return `${months} month${months === 1 ? '' : 's'}`;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  const yearLabel = `${years} year${years === 1 ? '' : 's'}`;
  if (rem === 0) return yearLabel;
  return `${yearLabel} ${rem} month${rem === 1 ? '' : 's'}`;
}

/**
 * Collapsible "Package history" section. Defaults collapsed so completed
 * packages don't dominate the page; opens to show one HistoricalPackageRow
 * per package plus a tenure footer ("Member since … · 3 years 2 months").
 *
 * No persistence — pure in-memory expansion. Whole header is a native
 * <button>, so Enter/Space toggling and focus-ring come for free.
 */
export function PackageHistorySection({ packages, defaultExpanded = false }: Props) {
  const [isExpanded, setIsExpanded] = useState<boolean>(defaultExpanded);

  if (packages.length === 0) return null;

  const memberSince = earliestStart(packages);
  const tenureText = memberSince ? formatTenure(memberSince) : null;

  return (
    <section className="rounded-md border bg-card/30">
      <button
        type="button"
        onClick={() => setIsExpanded(v => !v)}
        aria-expanded={isExpanded}
        className="w-full flex items-center justify-between p-4 hover:bg-accent/50 rounded-md text-left"
      >
        <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <span>Package history</span>
          <Badge variant="secondary" className="text-xs">
            {packages.length}
          </Badge>
        </div>
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 space-y-2">
          {packages.map(p => (
            <HistoricalPackageRow key={p.package_instance_id} dashboard={p} />
          ))}
          {memberSince && tenureText && (
            <p className="text-xs text-muted-foreground pt-2">
              Member since {format(memberSince, 'd MMM yyyy')} · {tenureText}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
