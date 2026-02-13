/**
 * ComplianceScoreRing – Unicorn 2.0
 *
 * Compact circular score indicator for dashboards and list views.
 */

import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface ComplianceScoreRingProps {
  score: number;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  className?: string;
}

const SIZES = {
  sm: { svg: 'h-10 w-10', text: 'text-xs', stroke: 2.5 },
  md: { svg: 'h-14 w-14', text: 'text-sm', stroke: 3 },
  lg: { svg: 'h-20 w-20', text: 'text-xl', stroke: 3 },
};

function scoreStroke(value: number): string {
  if (value >= 80) return 'stroke-primary';
  if (value >= 60) return 'stroke-brand-macaron';
  return 'stroke-destructive';
}

function scoreText(value: number): string {
  if (value >= 80) return 'text-primary';
  if (value >= 60) return 'text-brand-macaron-700';
  return 'text-destructive';
}

function scoreLabel(value: number): string {
  if (value >= 90) return 'Excellent';
  if (value >= 80) return 'Good';
  if (value >= 60) return 'Needs Attention';
  if (value >= 40) return 'At Risk';
  return 'Critical';
}

export function ComplianceScoreRing({ score, size = 'md', showLabel, className }: ComplianceScoreRingProps) {
  const s = SIZES[size];

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={cn('inline-flex flex-col items-center gap-1', className)}>
          <div className="relative flex items-center justify-center">
            <svg className={cn(s.svg, '-rotate-90')} viewBox="0 0 36 36">
              <path
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                className="stroke-muted"
                strokeWidth={s.stroke}
              />
              <path
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                className={scoreStroke(score)}
                strokeWidth={s.stroke}
                strokeDasharray={`${score}, 100`}
                strokeLinecap="round"
              />
            </svg>
            <span className={cn('absolute font-bold', s.text, scoreText(score))}>
              {score}
            </span>
          </div>
          {showLabel && (
            <span className={cn('text-xs font-medium', scoreText(score))}>
              {scoreLabel(score)}
            </span>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent>
        Compliance Score: {score}/100 – {scoreLabel(score)}
      </TooltipContent>
    </Tooltip>
  );
}
