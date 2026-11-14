import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Purple-to-Fuchsia hero. The heading colour is forced with the `!` modifier
 * because the global `h1` and `.light h1` rules (specificity 0,1,1) otherwise
 * beat `text-white` and render Acai on the gradient in light mode.
 */
export function TicketHero({
  title, subtitle, actions, className,
}: { title: string; subtitle?: string; actions?: ReactNode; className?: string }) {
  return (
    <header
      className={cn(
        'flex flex-col gap-4 bg-gradient-to-br from-brand-purple to-brand-fuchsia px-4 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-8 sm:py-9',
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="font-display text-3xl font-normal tracking-wide !text-white md:text-4xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-white/90">{subtitle}</p>}
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </header>
  );
}
