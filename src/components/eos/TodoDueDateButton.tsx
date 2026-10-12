import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface TodoDueDateButtonProps {
  /** Current due date as `yyyy-MM-dd`, or null when not set. */
  dueDate: string | null;
  /** Called with the new due date as `yyyy-MM-dd`. */
  onChange: (dueDate: string) => void | Promise<void>;
  disabled?: boolean;
}

/**
 * Click-to-re-date control for a to-do row in the live To-Do List. The wrapper stops
 * click propagation because the row itself toggles done / not done on click (and React
 * events bubble out of the popover portal too).
 */
export function TodoDueDateButton({ dueDate, onChange, disabled }: TodoDueDateButtonProps) {
  const [open, setOpen] = useState(false);
  const selected = dueDate ? parseISO(dueDate) : undefined;

  return (
    <span onClick={(e) => e.stopPropagation()}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            aria-label="Change due date"
            className="inline-flex items-center gap-1 rounded px-1 underline decoration-dotted underline-offset-2 hover:bg-muted disabled:opacity-50"
          >
            <CalendarIcon className="h-3 w-3" />
            {selected ? format(selected, 'dd/MM/yyyy') : 'Not set'}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selected}
            defaultMonth={selected}
            onSelect={async (date) => {
              if (!date) return;
              setOpen(false);
              await onChange(format(date, 'yyyy-MM-dd'));
            }}
            initialFocus
          />
        </PopoverContent>
      </Popover>
    </span>
  );
}
