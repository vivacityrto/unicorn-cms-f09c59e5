import { useState } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export interface FilterOption {
  value: string;
  label: string;
}

interface SearchableFilterProps {
  /** What is being filtered, singular: "Client", "Team member". Names the control for screen readers. */
  label: string;
  /** The wording when nothing is chosen, such as "Every client". */
  allLabel: string;
  /** The chosen option's value, or "all". */
  value: string;
  onChange: (value: string) => void;
  options: readonly FilterOption[];
  className?: string;
}

/**
 * A filter you can type into: press it, start typing and the long list narrows, pick one. Built for lists of dozens of names
 * (every client, every team member), where a plain dropdown means scrolling. Shows the choice on the button, highlighted, with
 * a small cross to clear it.
 */
export function SearchableFilter({ label, allLabel, value, onChange, options, className }: SearchableFilterProps) {
  const [open, setOpen] = useState(false);
  const chosen = value !== 'all' ? options.find((o) => o.value === value) : undefined;
  const active = !!chosen;

  const pick = (next: string) => {
    onChange(next);
    setOpen(false);
  };

  return (
    <div className={cn('inline-flex min-w-0 items-center', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            role="combobox"
            aria-expanded={open}
            aria-label={label}
            className={cn(
              'inline-flex h-8 min-w-0 max-w-[16rem] items-center gap-1.5 border px-2.5 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              active ? 'rounded-l-md border-r-0 border-primary bg-primary/10 text-foreground' : 'rounded-md bg-card text-muted-foreground hover:text-foreground',
            )}
          >
            <span className="truncate">{chosen ? chosen.label : allLabel}</span>
            <ChevronDown aria-hidden className="h-3.5 w-3.5 shrink-0 opacity-60" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[20rem] p-0">
          <Command>
            <CommandInput placeholder={`Search ${label.toLowerCase()}s…`} aria-label={`Search ${label.toLowerCase()}s`} />
            <CommandList className="max-h-72">
              <CommandEmpty>No {label.toLowerCase()} matches.</CommandEmpty>
              <CommandGroup>
                <CommandItem value="__all__" keywords={[allLabel]} onSelect={() => pick('all')} className="text-[13px]">
                  <Check aria-hidden className={cn('mr-2 h-4 w-4', value === 'all' ? 'opacity-100' : 'opacity-0')} />
                  {allLabel}
                </CommandItem>
                {options.map((o) => (
                  <CommandItem key={o.value} value={o.value} keywords={[o.label]} onSelect={() => pick(o.value)} className="text-[13px]">
                    <Check aria-hidden className={cn('mr-2 h-4 w-4 shrink-0', value === o.value ? 'opacity-100' : 'opacity-0')} />
                    <span className="truncate">{o.label}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {active && (
        <button
          type="button"
          onClick={() => onChange('all')}
          aria-label={`Clear the ${label.toLowerCase()} filter`}
          className="inline-flex h-8 w-7 items-center justify-center rounded-r-md border border-l-0 border-primary bg-primary/10 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X aria-hidden className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
