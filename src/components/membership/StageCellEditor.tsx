import { Circle, CircleDot, CircleCheck, CirclePause, CircleX, SkipForward } from 'lucide-react';
import { cn } from '@/lib/utils';

// Stage state values matching the database
type StageState = 'not_started' | 'in_progress' | 'blocked' | 'waiting' | 'complete' | 'skipped';

const STATE_OPTIONS: { value: StageState; label: string; icon: React.ReactNode; dotColor: string }[] = [
  { value: 'not_started', label: 'Not Started', icon: <Circle className="h-3 w-3" />, dotColor: 'bg-muted-foreground/30' },
  { value: 'in_progress', label: 'Active', icon: <CircleDot className="h-3 w-3" />, dotColor: 'bg-blue-500' },
  { value: 'blocked', label: 'Blocked', icon: <CirclePause className="h-3 w-3" />, dotColor: 'bg-red-500' },
  { value: 'waiting', label: 'Waiting', icon: <CircleX className="h-3 w-3" />, dotColor: 'bg-amber-500' },
  { value: 'complete', label: 'Complete', icon: <CircleCheck className="h-3 w-3" />, dotColor: 'bg-green-500' },
  { value: 'skipped', label: 'Skipped', icon: <SkipForward className="h-3 w-3" />, dotColor: 'bg-gray-400' },
];

// Compact status indicator (read-only)
export function StageStatusDot({ state }: { state: StageState }) {
  const option = STATE_OPTIONS.find(opt => opt.value === state) || STATE_OPTIONS[0];
  return (
    <span 
      className={cn('inline-block h-2.5 w-2.5 rounded-full', option.dotColor)} 
      title={option.label}
    />
  );
}
