import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { ClientPackageDashboardRow } from '@/hooks/use-client-package-dashboard';

const MAP: Record<ClientPackageDashboardRow['status_pill'], { label: string; className: string }> = {
  on_track: { label: 'On track',  className: 'bg-green-100 text-green-800 hover:bg-green-100 border-green-200 dark:bg-green-500/15 dark:hover:bg-green-500/20 dark:text-green-300 dark:border-green-500/30' },
  drifting: { label: 'Drifting',  className: 'bg-amber-100 text-amber-900 hover:bg-amber-100 border-amber-200 dark:bg-amber-500/15 dark:hover:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/30' },
  stuck:    { label: 'Stuck',     className: 'bg-red-100 text-red-800 hover:bg-red-100 border-red-200 dark:bg-red-500/15 dark:hover:bg-red-500/20 dark:text-red-300 dark:border-red-500/30' },
  on_hold:  { label: 'On hold',   className: 'bg-muted text-foreground hover:bg-muted border-border' },
  complete: { label: 'Complete',  className: 'bg-muted text-foreground hover:bg-muted border-border' },
};

export function PackageStatusPill({ status }: { status: ClientPackageDashboardRow['status_pill'] }) {
  const m = MAP[status] ?? MAP.on_track;
  return (
    <Badge variant="outline" className={cn('text-xs font-medium', m.className)}>
      {m.label}
    </Badge>
  );
}
