import { Building2, UserCircle, Users, type LucideIcon } from 'lucide-react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';
import type { RockLevel } from '@/types/eos';

const LEVELS: { value: RockLevel; label: string; blurb: string; icon: LucideIcon }[] = [
  { value: 'company', label: 'Company', blurb: 'A priority for the whole business this quarter.', icon: Building2 },
  { value: 'team', label: 'Team', blurb: 'What a team commits to, in support of a Company Rock.', icon: Users },
  { value: 'individual', label: 'Individual', blurb: 'One person’s commitment, serving a Company or Team Rock.', icon: UserCircle },
];

interface LevelPickerProps {
  value: RockLevel;
  onChange: (level: RockLevel) => void;
  /** Why the level cannot change, shown instead of the choices. */
  lockedReason?: string;
}

export function LevelPicker({ value, onChange, lockedReason }: LevelPickerProps) {
  if (lockedReason) {
    const current = LEVELS.find(l => l.value === value);
    return (
      <div className="rounded-md border bg-muted/30 p-3 text-sm">
        <span className="font-medium">{current?.label} Rock</span>
        <span className="text-muted-foreground"> · {lockedReason}</span>
      </div>
    );
  }
  return (
    <RadioGroup value={value} onValueChange={v => onChange(v as RockLevel)} className="grid gap-2 sm:grid-cols-3" aria-label="Rock level">
      {LEVELS.map(({ value: level, label, blurb, icon: Icon }) => {
        const id = `rock-level-${level}`;
        const selected = value === level;
        return (
          <label
            key={level}
            htmlFor={id}
            className={cn(
              'flex cursor-pointer flex-col gap-1 rounded-md border p-3 text-foreground transition-colors hover:bg-muted/50',
              'focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2',
              selected ? 'border-primary bg-primary/5' : 'border-border',
            )}
          >
            <span className="flex items-center gap-2 text-sm font-semibold normal-case">
              <RadioGroupItem id={id} value={level} className="sr-only" />
              <Icon className={cn('h-4 w-4', selected ? 'text-primary' : 'text-muted-foreground')} aria-hidden="true" />
              {label}
            </span>
            <span className="text-xs normal-case text-muted-foreground">{blurb}</span>
          </label>
        );
      })}
    </RadioGroup>
  );
}
