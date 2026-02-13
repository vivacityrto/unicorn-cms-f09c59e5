/**
 * SparklineMini – Unicorn 2.0
 *
 * Lightweight SVG sparkline for 30-day trends.
 * Brand colours only. Confidence-aware. Respects reduced motion.
 */

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { DeltaConfidence } from '@/hooks/useExecutiveHealth';

export type SparklineKind = 'compliance' | 'predictive';

interface SparklineMiniProps {
  values: number[];
  confidence: DeltaConfidence;
  kind?: SparklineKind;
  height?: 24 | 32;
  width?: number;
  className?: string;
}

// Brand colours (HSL values from design system)
const STROKE_COMPLIANCE = 'hsl(275, 55%, 41%)';   // Purple #7130A0
const STROKE_PREDICTIVE_STABLE = 'hsl(190, 74%, 50%)'; // Aqua #23C0DD
const STROKE_PREDICTIVE_HOT = 'hsl(333, 86%, 51%)';    // Fuchsia #ED1878

const prefersReducedMotion = typeof window !== 'undefined'
  ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
  : false;

function getStrokeColor(kind: SparklineKind, values: number[]): string {
  if (kind === 'compliance') return STROKE_COMPLIANCE;
  // Predictive: fuchsia when last value >= 75, else aqua
  const last = values[values.length - 1] ?? 0;
  return last >= 75 ? STROKE_PREDICTIVE_HOT : STROKE_PREDICTIVE_STABLE;
}

function getOpacity(confidence: DeltaConfidence): number {
  switch (confidence) {
    case 'high': return 1;
    case 'medium': return 0.7;
    case 'low': return 0.4;
    default: return 0;
  }
}

function buildTooltipText(values: number[], confidence: DeltaConfidence, kind: SparklineKind): string {
  if (values.length === 0) return 'No data';
  const first = values[0];
  const last = values[values.length - 1];
  const change = last - first;
  const sign = change > 0 ? '+' : '';
  const label = kind === 'compliance' ? 'Compliance' : 'Risk';
  const confLabel = confidence.charAt(0).toUpperCase() + confidence.slice(1);
  return `${label} 30d · ${values.length} points · ${first}→${last} (${sign}${change}) · ${confLabel} density`;
}

export function SparklineMini({
  values,
  confidence,
  kind = 'compliance',
  height = 24,
  width = 80,
  className,
}: SparklineMiniProps) {
  const strokeColor = getStrokeColor(kind, values);
  const opacity = getOpacity(confidence);

  const polylinePoints = useMemo(() => {
    if (values.length < 2) return '';
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const padding = 2;
    const drawW = width - padding * 2;
    const drawH = height - padding * 2;

    return values
      .map((v, i) => {
        const x = padding + (i / (values.length - 1)) * drawW;
        const y = padding + drawH - ((v - min) / range) * drawH;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }, [values, width, height]);

  const tooltipText = buildTooltipText(values, confidence, kind);

  // No data placeholder (after hooks)
  if (confidence === 'none' || values.length === 0) {
    return (
      <span className={cn('inline-flex items-center text-[10px] text-muted-foreground italic', className)}>
        No data
      </span>
    );
  }

  const sparkline = (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn('inline-block', className)}
      role="img"
      aria-label={tooltipText}
    >
      <polyline
        points={polylinePoints}
        fill="none"
        stroke={strokeColor}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={opacity}
        strokeDasharray={prefersReducedMotion ? 'none' : undefined}
      />
    </svg>
  );

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>{sparkline}</TooltipTrigger>
        <TooltipContent side="top" className="text-xs max-w-[260px]">
          {tooltipText}
          {confidence === 'low' && (
            <span className="block text-muted-foreground mt-0.5">Low density — interpret with caution.</span>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
