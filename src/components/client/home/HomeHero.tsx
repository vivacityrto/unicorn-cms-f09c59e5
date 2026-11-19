import { Bot, CalendarPlus, Mail } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { HomeTotals } from './homeInsights';

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('') || '?';

const onBrand = 'border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white';

export interface HomeHeroProps {
  greeting: string;
  name: string | null | undefined;
  tenure: string;
  totals: HomeTotals | null;
  attentionCount: number;
  csc: { name: string | null; email: string | null; roleLabel: string; avatarUrl: string | null; assigned: boolean };
  onMessage?: () => void;
  onAsk?: () => void;
}

/** The welcome banner: who you are, the one-line state of play, and who to call. */
export function HomeHero({ greeting, name, tenure, totals, attentionCount, csc, onMessage, onAsk }: HomeHeroProps) {
  const chips: string[] = [];
  if (totals && totals.packages > 0) chips.push(`${totals.packages} active ${totals.packages === 1 ? 'package' : 'packages'}`);
  if (totals && totals.openTasks > 0) chips.push(`${totals.openTasks} open ${totals.openTasks === 1 ? 'task' : 'tasks'}`);
  if (attentionCount > 0) chips.push(`${attentionCount} need${attentionCount === 1 ? 's' : ''} attention`);

  return (
    <section aria-label="Welcome" className="brand-surface overflow-hidden rounded-2xl bg-gradient-to-r from-[#44235F] to-[#7130A0] p-5 text-white sm:p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold sm:text-3xl">
            {greeting}
            {name ? `, ${name}` : ''}
          </h1>
          <p className="mt-1 text-sm text-white/80">{tenure}</p>
          {chips.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2" aria-label="Where things stand">
              {chips.map((c) => (
                <li key={c} className="rounded-full bg-white/15 px-3 py-1 text-xs font-medium">
                  {c}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-col gap-3 rounded-xl bg-white/10 p-4 sm:flex-row sm:items-center lg:min-w-[22rem]">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar className="h-12 w-12 border-2 border-white/40">
              {csc.avatarUrl ? <AvatarImage src={csc.avatarUrl} alt={csc.name ?? 'Your consultant'} /> : null}
              <AvatarFallback className="bg-white/20 text-white">{initials(csc.name ?? 'Not assigned')}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="text-xs uppercase tracking-wide text-white/75">Your {csc.roleLabel}</div>
              <div className="truncate font-semibold">{csc.assigned ? csc.name ?? 'Not yet assigned' : 'Not yet assigned'}</div>
              {csc.assigned && csc.email ? <div className="truncate text-xs text-white/75">{csc.email}</div> : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 sm:ml-auto">
            {onMessage && (
              <Button size="sm" variant="outline" className={onBrand} onClick={onMessage} disabled={!csc.assigned} title={csc.assigned ? undefined : 'Your CSC assignment is pending. Contact info@vivacity.com.au'}>
                <Mail className="mr-1.5 h-4 w-4" /> Message
              </Button>
            )}
            {csc.assigned ? (
              <Link to="/client/calendar" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), onBrand)}>
                <CalendarPlus className="mr-1.5 h-4 w-4" /> Book consult
              </Link>
            ) : (
              <Button size="sm" variant="outline" className={onBrand} disabled title="Your CSC assignment is pending. Contact info@vivacity.com.au">
                <CalendarPlus className="mr-1.5 h-4 w-4" /> Book consult
              </Button>
            )}
            {onAsk && (
              <Button size="sm" variant="outline" className={onBrand} onClick={onAsk}>
                <Bot className="mr-1.5 h-4 w-4" /> Ask Viv
              </Button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
