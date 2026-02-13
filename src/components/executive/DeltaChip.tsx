/**
 * DeltaChip – Unicorn 2.0
 *
 * Compact inline delta indicator with confidence marker.
 * High = solid dot, Medium = half dot, Low = outline dot, None = "No baseline".
 */

import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { DeltaConfidence } from '@/hooks/useExecutiveHealth';

interface DeltaChipProps {
  value: number;
  type?: 'compliance' | 'predictive' | 'stale';
  confidence?: DeltaConfidence;
  snapshotsLast7d?: number;
  t7DistanceSeconds?: number | null;
  className?: string;
}

function ConfidenceDot({ confidence }: { confidence: DeltaConfidence }) {
  if (confidence === 'high') {
    return <span className="inline-block w-1.5 h-1.5 rounded-full bg-current opacity-80" />;
  }
  if (confidence === 'medium') {
    return (
      <span className="inline-block w-1.5 h-1.5 rounded-full relative overflow-hidden border border-current opacity-70">
        <span className="absolute inset-0 bg-current" style={{ clipPath: 'inset(50% 0 0 0)' }} />
      </span>
    );
  }
  // low
  return <span className="inline-block w-1.5 h-1.5 rounded-full border border-current opacity-50" />;
}

function formatBaselineDistance(seconds: number | null | undefined): string {
  if (seconds == null) return 'no baseline';
  const days = seconds / 86400;
  if (days < 1) return `${Math.round(seconds / 3600)}h from target`;
  return `${days.toFixed(1)}d from target`;
}

function buildTooltipText(confidence: DeltaConfidence, snapshotsLast7d?: number, t7DistanceSeconds?: number | null): string {
  if (confidence === 'none') return 'No baseline snapshot available.';
  const label = confidence.charAt(0).toUpperCase() + confidence.slice(1);
  const baseline = formatBaselineDistance(t7DistanceSeconds);
  const density = snapshotsLast7d != null ? `${snapshotsLast7d} snapshots last 7d` : '';
  return `${label} confidence. Baseline ${baseline}. ${density}`.trim();
}

export function DeltaChip({ value, type = 'compliance', confidence, snapshotsLast7d, t7DistanceSeconds, className }: DeltaChipProps) {
  if (confidence === 'none') {
    return (
      <span className={cn('inline-flex items-center text-[10px] text-muted-foreground italic', className)}>
        No baseline
      </span>
    );
  }

  if (value === 0) return null;

  const isPositive = value > 0;

  let colorClass: string;
  if (type === 'compliance') {
    colorClass = isPositive
      ? 'text-brand-purple-600 dark:text-brand-purple-400'
      : 'text-brand-macaron-600 dark:text-brand-macaron-400';
  } else if (type === 'predictive') {
    colorClass = isPositive
      ? 'text-brand-fuchsia-600 dark:text-brand-fuchsia-400'
      : 'text-brand-aqua-600 dark:text-brand-aqua-400';
  } else {
    colorClass = isPositive
      ? 'text-brand-macaron-600 dark:text-brand-macaron-400'
      : 'text-brand-purple-600 dark:text-brand-purple-400';
  }

  const Icon = isPositive ? TrendingUp : TrendingDown;
  const showConfidence = !!confidence && (confidence as string) !== 'none';

  const chip = (
    <span className={cn('inline-flex items-center gap-0.5 text-xs font-medium', colorClass, className)}>
      <Icon className="w-3 h-3" />
      {isPositive ? '+' : ''}{value}
      {showConfidence && <ConfidenceDot confidence={confidence} />}
    </span>
  );

  if (showConfidence) {
    return (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>{chip}</TooltipTrigger>
          <TooltipContent side="top" className="text-xs max-w-[240px]">
            {buildTooltipText(confidence, snapshotsLast7d, t7DistanceSeconds)}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return chip;
}
