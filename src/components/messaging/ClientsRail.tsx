import { Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { formatDistanceToNowStrict } from "date-fns";
import { clientAvatarColor, clientInitials } from "@/lib/clientAvatarColor";

export interface ClientRailItem {
  tenantId: number;
  tenantName: string;
  threadCount: number;
  unreadCount: number;
  lastActivity: string | null;
}

interface Props {
  items: ClientRailItem[];
  totalThreads: number;
  totalUnread: number;
  selected: string; // "all" or tenantId as string
  onSelect: (value: string) => void;
  className?: string;
}

export function ClientsRail({
  items,
  totalThreads,
  totalUnread,
  selected,
  onSelect,
  className,
}: Props) {
  return (
    <div className={cn("flex flex-col border rounded-lg border-border bg-card overflow-hidden", className)}>
      <div className="px-3 py-2.5 border-b border-border">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Clients</p>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {/* Pinned: All Conversations */}
          <button
            type="button"
            onClick={() => onSelect("all")}
            data-active={selected === "all"}
            className={cn(
              "w-full flex items-center gap-2.5 px-2 py-2 rounded-md text-left transition-colors",
              "hover:bg-muted",
              selected === "all" && "bg-muted"
            )}
          >
            <div className="h-9 w-9 rounded-md bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
              <Star className="h-4 w-4" fill="currentColor" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">All Conversations</p>
              <p className="text-[11px] text-muted-foreground truncate">
                {totalThreads} {totalThreads === 1 ? "thread" : "threads"}
              </p>
            </div>
            {totalUnread > 0 && (
              <Badge variant="default" className="h-5 min-w-[1.25rem] px-1.5 justify-center">
                {totalUnread}
              </Badge>
            )}
          </button>

          {items.length > 0 && <div className="h-px bg-border my-1" />}

          {items.map((item) => {
            const color = clientAvatarColor(item.tenantId);
            const isActive = selected === String(item.tenantId);
            return (
              <button
                key={item.tenantId}
                type="button"
                onClick={() => onSelect(String(item.tenantId))}
                data-active={isActive}
                className={cn(
                  "w-full flex items-center gap-2.5 px-2 py-2 rounded-md text-left transition-colors",
                  "hover:bg-muted",
                  isActive && "bg-muted"
                )}
              >
                <div
                  className={cn(
                    "h-9 w-9 rounded-md flex items-center justify-center flex-shrink-0 text-xs font-semibold",
                    color.bg,
                    color.text
                  )}
                >
                  {clientInitials(item.tenantName)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{item.tenantName}</p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {item.threadCount} {item.threadCount === 1 ? "thread" : "threads"}
                    {item.lastActivity && (
                      <>
                        {" · "}
                        {formatDistanceToNowStrict(new Date(item.lastActivity), { addSuffix: false })}
                      </>
                    )}
                  </p>
                </div>
                {item.unreadCount > 0 && (
                  <Badge variant="default" className="h-5 min-w-[1.25rem] px-1.5 justify-center">
                    {item.unreadCount}
                  </Badge>
                )}
              </button>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
