import { Briefcase, CheckSquare, LifeBuoy, Megaphone, MessageSquare, Sparkles, Target, UserRound, type LucideIcon } from 'lucide-react';
import type { BadgeTone, ThreadKind } from './types';

/** One look per thread type, shared by the list, the header and the bubble so a thread reads the same everywhere. */
export const THREAD_STYLE: Record<ThreadKind, { icon: LucideIcon; tile: string }> = {
  ask_viv: { icon: Sparkles, tile: 'bg-gradient-to-br from-[#7130A0] to-[#ED1878] text-white' },
  csc: { icon: UserRound, tile: 'bg-primary/10 text-primary' },
  support: { icon: LifeBuoy, tile: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300' },
  broadcast: { icon: Megaphone, tile: 'bg-amber-500/15 text-amber-800 dark:text-amber-300' },
  package: { icon: Briefcase, tile: 'bg-primary/10 text-primary' },
  task: { icon: CheckSquare, tile: 'bg-blue-500/15 text-blue-700 dark:text-blue-300' },
  rock: { icon: Target, tile: 'bg-purple-500/15 text-purple-700 dark:text-purple-300' },
  general: { icon: MessageSquare, tile: 'bg-muted text-muted-foreground' },
  direct: { icon: MessageSquare, tile: 'bg-muted text-muted-foreground' },
};

export const BADGE_TONE: Record<BadgeTone, string> = {
  neutral: 'border-border bg-muted text-muted-foreground',
  info: 'border-blue-500/30 bg-blue-500/15 text-blue-700 dark:text-blue-300',
  warning: 'border-amber-500/30 bg-amber-500/15 text-amber-800 dark:text-amber-300',
  success: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  danger: 'border-destructive/30 bg-destructive/10 text-destructive',
};
