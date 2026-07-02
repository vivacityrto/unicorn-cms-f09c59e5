import { MessageSquare, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { format, formatDistanceToNowStrict } from "date-fns";
import { topicToBadge } from "./topicBadge";

export interface ThreadListItem {
  id: string;
  tenant_id: number;
  tenant_name?: string;
  topic: string;
  subject: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_sender_type?: string | null;
  isUnread?: boolean;
}

interface Props {
  items: ThreadListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  scopeLabel: string;
  search: string;
  onSearchChange: (v: string) => void;
  className?: string;
}

function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = Date.now();
  const diff = now - d.getTime();
  if (diff < 60_000) return "now";
  if (diff < 24 * 60 * 60_000) return formatDistanceToNowStrict(d, { addSuffix: false });
  if (diff < 7 * 24 * 60 * 60_000) return format(d, "EEE");
  return format(d, "d MMM");
}

export function ThreadList({
  items,
  selectedId,
  onSelect,
  scopeLabel,
  search,
  onSearchChange,
  className,
}: Props) {
  return (
    <div className={cn("flex min-w-0 max-w-full flex-col border rounded-lg border-border bg-card overflow-hidden", className)}>
      <div className="min-w-0 px-3 pt-3 pb-2 border-b border-border space-y-2">
        <p className="truncate text-sm font-semibold text-foreground">{scopeLabel}</p>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search threads..."
            className="h-9 pl-8 text-sm"
          />
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        {items.length === 0 ? (
          <div className="p-6 text-center text-muted-foreground">
            <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No conversations found.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {items.map((conv) => {
              const badge = topicToBadge(conv.topic);
              const isSelected = selectedId === conv.id;
              const preview = conv.last_message_preview || "No messages yet";
              const previewPrefix = conv.last_sender_type === "staff" ? "You: " : "";
              return (
                <button
                  key={conv.id}
                  type="button"
                  onClick={() => onSelect(conv.id)}
                  className={cn(
                    "block w-full min-w-0 max-w-full overflow-hidden text-left px-3 py-2.5 border-l-2 border-transparent hover:bg-muted/50 transition-colors",
                    isSelected && "bg-muted border-l-primary"
                  )}
                >
                  <div className="flex min-w-0 items-center gap-1.5 mb-0.5 overflow-hidden">
                    <Badge variant={badge.variant} className="text-[10px] px-1.5 py-0 h-4 flex-shrink-0">
                      {badge.label}
                    </Badge>
                    <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                      {conv.tenant_name}
                    </span>
                    <span className="ml-auto text-[11px] text-muted-foreground flex-shrink-0 flex items-center gap-1.5">
                      {relativeTime(conv.last_message_at)}
                      {conv.isUnread && (
                        <span className="h-2 w-2 rounded-full bg-primary" aria-label="Unread" />
                      )}
                    </span>
                  </div>
                  <p
                    className={cn(
                      "min-w-0 max-w-full overflow-hidden text-sm text-foreground whitespace-normal break-words [overflow-wrap:anywhere]",
                      conv.isUnread ? "font-semibold" : "font-medium"
                    )}
                  >
                    {conv.subject || badge.label}
                  </p>
                  <p className="min-w-0 max-w-full overflow-hidden text-xs text-muted-foreground whitespace-normal break-words [overflow-wrap:anywhere] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3]">
                    {previewPrefix}
                    {preview}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
