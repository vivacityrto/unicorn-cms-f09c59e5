import { MessageSquare, CheckSquare, Megaphone, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { InboxItem } from "@/types/inbox";
import { formatDistanceToNow, isPast, isWithinInterval, addDays } from "date-fns";

const TYPE_CONFIG = {
  message: { icon: MessageSquare, label: "Message", className: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  task: { icon: CheckSquare, label: "Task", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200" },
  announcement: { icon: Megaphone, label: "Announcement", className: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200" },
  rock: { icon: Target, label: "Rock", className: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200" },
} as const;

interface InboxItemRowProps {
  item: InboxItem;
  onClick: (item: InboxItem) => void;
}

export function InboxItemRow({ item, onClick }: InboxItemRowProps) {
  const config = TYPE_CONFIG[item.item_type] || TYPE_CONFIG.message;
  const Icon = config.icon;

  const isOverdue = item.due_at && isPast(new Date(item.due_at)) && item.status !== "complete";
  const isDueSoon = item.due_at && !isOverdue && isWithinInterval(new Date(item.due_at), {
    start: new Date(),
    end: addDays(new Date(), 2),
  });

  return (
    <button
      onClick={() => onClick(item)}
      className={cn(
        "w-full flex items-start gap-3 px-4 py-3 text-left transition-colors border-b border-border hover:bg-muted/50",
        item.unread && "bg-primary/5",
        item.action_required && "border-l-2 border-l-destructive"
      )}
    >
      {/* Unread dot */}
      <div className="pt-1.5 w-2 flex-shrink-0">
        {item.unread && (
          <div className="h-2 w-2 rounded-full bg-primary" />
        )}
      </div>

      {/* Icon */}
      <div className="pt-0.5 flex-shrink-0">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="secondary" className={cn("text-[10px] px-1.5 py-0", config.className)}>
            {config.label}
          </Badge>
          <span className={cn("text-sm truncate", item.unread ? "font-semibold text-foreground" : "text-foreground")}>
            {item.title || "Untitled"}
          </span>
        </div>

        {item.preview && (
          <p className="text-xs text-muted-foreground truncate">{item.preview}</p>
        )}

        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          {item.status && item.item_type === "task" && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {item.status.replace(/_/g, " ")}
            </Badge>
          )}
          {item.due_at && (
            <span className={cn(
              isOverdue && "text-destructive font-medium",
              isDueSoon && "text-warning font-medium"
            )}>
              {isOverdue ? "Overdue" : isDueSoon ? "Due soon" : ""}{" "}
              {formatDistanceToNow(new Date(item.due_at), { addSuffix: true })}
            </span>
          )}
          <span>{formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}</span>
        </div>
      </div>
    </button>
  );
}
