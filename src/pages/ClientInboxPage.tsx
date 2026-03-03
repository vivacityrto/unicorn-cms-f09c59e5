import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Inbox } from "lucide-react";
import { useClientInbox } from "@/hooks/useClientInbox";
import { InboxFilters } from "@/components/inbox/InboxFilters";
import { InboxItemRow } from "@/components/inbox/InboxItemRow";
import type { InboxItem, InboxFilterType } from "@/types/inbox";

export default function ClientInboxPage() {
  const [searchParams] = useSearchParams();
  const initialType = (searchParams.get("type") as InboxFilterType) || "all";
  const [filter, setFilter] = useState<InboxFilterType>(initialType);
  const { items, isLoading } = useClientInbox(filter);
  const navigate = useNavigate();

  const handleClick = (item: InboxItem) => {
    if (item.item_type === "message" || item.item_type === "announcement") {
      navigate(`/client/communications?thread=${item.source_id}`);
    } else if (item.item_type === "task") {
      navigate(`/client/tasks?task=${item.source_id}`);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Inbox className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-semibold text-foreground">Inbox</h1>
        </div>
        <InboxFilters activeFilter={filter} onFilterChange={setFilter} />
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Loading inbox…</div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            {filter === "all" ? "You're all caught up!" : `No ${filter} items`}
          </div>
        ) : (
          items.map((item) => (
            <InboxItemRow key={item.inbox_id} item={item} onClick={handleClick} />
          ))
        )}
      </div>
    </div>
  );
}
