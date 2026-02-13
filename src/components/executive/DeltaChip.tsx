/**
 * DeltaChip – Unicorn 2.0
 *
 * Compact inline delta indicator for 7-day trends.
 * Positive compliance = Purple, Negative = Macaron.
 * Positive predictive (risk up) = Fuchsia, Negative (risk down) = Aqua.
 */

import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface DeltaChipProps {
  value: number;
  type?: 'compliance' | 'predictive' | 'stale';
  className?: string;
}

export function DeltaChip({ value, type = 'compliance', className }: DeltaChipProps) {
  if (value === 0) return null;

  const isPositive = value > 0;

  // For compliance: positive is good (purple), negative is bad (macaron)
  // For predictive risk: positive means risk increased (fuchsia = bad), negative means improved (aqua = good)
  // For stale: positive means more stale (bad), negative means less stale (good)
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

  return (
    <span className={cn('inline-flex items-center gap-0.5 text-xs font-medium', colorClass, className)}>
      <Icon className="w-3 h-3" />
      {isPositive ? '+' : ''}{value}
    </span>
  );
}
