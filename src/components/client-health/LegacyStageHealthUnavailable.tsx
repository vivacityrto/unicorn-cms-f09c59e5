import { AlertTriangle } from 'lucide-react';

export const LEGACY_STAGE_HEALTH_MESSAGE = 'Unavailable — data repair in progress';

export function LegacyStageHealthUnavailable({ compact = false }: { compact?: boolean }) {
  return (
    <div
      role="status"
      aria-label={LEGACY_STAGE_HEALTH_MESSAGE}
      className={compact
        ? 'inline-flex items-center gap-1 text-xs text-muted-foreground'
        : 'flex items-start gap-2 rounded-md border border-amber-300/60 bg-amber-50/60 p-3 text-sm text-amber-950 dark:border-amber-700/60 dark:bg-amber-950/20 dark:text-amber-100'}
    >
      <AlertTriangle className={compact ? 'h-3.5 w-3.5 shrink-0' : 'mt-0.5 h-4 w-4 shrink-0'} aria-hidden="true" />
      <span>{LEGACY_STAGE_HEALTH_MESSAGE}</span>
    </div>
  );
}
