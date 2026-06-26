import { TICKET_TYPES, TicketTypeKey } from './ticketTypeConfig';
import { cn } from '@/lib/utils';

interface Props {
  selected: TicketTypeKey | null;
  onSelect: (key: TicketTypeKey) => void;
}

export function TicketTypePicker({ selected, onSelect }: Props) {
  return (
    <div className="space-y-2">
      {TICKET_TYPES.map((t) => {
        const isSelected = selected === t.key;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onSelect(t.key)}
            className={cn(
              'w-full flex items-start gap-3 p-4 rounded-lg border text-left transition-colors',
              isSelected
                ? 'border-[#23C0DD] bg-[#23C0DD]/10'
                : 'border-border hover:border-muted-foreground/40 hover:bg-muted/40'
            )}
          >
            <div
              className={cn(
                'mt-0.5 h-4 w-4 rounded-full border-2 flex items-center justify-center shrink-0',
                isSelected ? 'border-[#23C0DD]' : 'border-muted-foreground/40'
              )}
            >
              {isSelected && <div className="h-2 w-2 rounded-full bg-[#23C0DD]" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm">
                <span className="mr-1.5">{t.emoji}</span>
                {t.label}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">{t.description}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
