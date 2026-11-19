import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** A circular gauge. `value` is 0 to 100; `tone` picks the arc colour from the theme. */
export function Ring({
  value,
  tone = 'primary',
  size = 64,
  stroke = 7,
  label,
  children,
  className,
}: {
  value: number;
  tone?: 'primary' | 'good' | 'warn' | 'bad';
  size?: number;
  stroke?: number;
  label: string;
  children?: ReactNode;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const arc = {
    primary: 'stroke-primary',
    good: 'stroke-emerald-500',
    warn: 'stroke-amber-500',
    bad: 'stroke-destructive',
  }[tone];
  return (
    <div className={cn('relative shrink-0', className)} style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-muted" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - clamped / 100)}
          className={cn(arc, 'transition-[stroke-dashoffset] duration-500')}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-sm font-bold tabular-nums text-foreground">{children}</div>
    </div>
  );
}

/** Horizontal bar with optional marker ticks (for example the 75% and 95% hour thresholds). */
export function Bar({ value, tone = 'primary', ticks = [], label }: { value: number; tone?: 'primary' | 'good' | 'warn' | 'bad'; ticks?: number[]; label: string }) {
  const clamped = Math.max(0, Math.min(100, value));
  const fill = { primary: 'bg-primary', good: 'bg-emerald-500', warn: 'bg-amber-500', bad: 'bg-destructive' }[tone];
  return (
    <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-muted" role="img" aria-label={label}>
      <div className={cn('h-full rounded-full transition-[width] duration-500', fill)} style={{ width: `${clamped}%` }} />
      {ticks.map((t) => (
        <span key={t} className="absolute top-0 h-full w-px bg-background/80" style={{ left: `${t}%` }} aria-hidden />
      ))}
    </div>
  );
}
