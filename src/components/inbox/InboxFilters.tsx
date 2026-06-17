import { cn } from "@/lib/utils";
import type { InboxFilterType } from "@/types/inbox";

const filters: { value: InboxFilterType; label: string }[] = [
  { value: "all", label: "All" },
  { value: "message", label: "Messages" },
  { value: "task", label: "Tasks" },
  { value: "announcement", label: "Announcements" },
];

interface InboxFiltersProps {
  activeFilter: InboxFilterType;
  onFilterChange: (filter: InboxFilterType) => void;
  showRock?: boolean;
  showTickets?: boolean;
}

export function InboxFilters({ activeFilter, onFilterChange, showRock, showTickets }: InboxFiltersProps) {
  let items = filters;
  if (showRock) items = [...items, { value: "rock" as InboxFilterType, label: "Rocks" }];
  if (showTickets) items = [...items, { value: "ticket" as InboxFilterType, label: "Tickets" }];

  return (
    <div className="flex gap-1.5 flex-wrap">
      {items.map((f) => (
        <button
          key={f.value}
          onClick={() => onFilterChange(f.value)}
          className={cn(
            "px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
            activeFilter === f.value
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          )}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}
