import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Inbox } from "lucide-react";
import { useTeamInbox } from "@/hooks/useTeamInbox";
import { InboxFilters } from "@/components/inbox/InboxFilters";
import { InboxItemRow } from "@/components/inbox/InboxItemRow";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import type { InboxItem, InboxFilterType } from "@/types/inbox";

export default function TeamInboxPage() {
  const [filter, setFilter] = useState<InboxFilterType>("all");
  const [actionOnly, setActionOnly] = useState(false);
  const { items, isLoading } = useTeamInbox({ filter, actionRequiredOnly: actionOnly });
  const navigate = useNavigate();

  const handleClick = (item: InboxItem) => {
    if (item.item_type === "message" || item.item_type === "announcement") {
      navigate(`/communications?thread=${item.source_id}`);
    } else if (item.item_type === "task") {
      // Navigate to the appropriate task source
      if (item.item_source === "staff_task_instances") {
        navigate(`/tasks?task=${item.source_id}`);
      } else if (item.item_source === "ops_work_items") {
        navigate(`/tasks?ops=${item.source_id}`);
      } else {
        navigate(`/tenant/${item.tenant_id}?tab=tasks`);
      }
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Inbox className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-semibold text-foreground">Team Inbox</h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch id="action-only" checked={actionOnly} onCheckedChange={setActionOnly} />
            <Label htmlFor="action-only" className="text-xs">Action required</Label>
          </div>
          <InboxFilters activeFilter={filter} onFilterChange={setFilter} showRock />
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Loading inbox…</div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            {filter === "all" ? "No items requiring attention" : `No ${filter} items`}
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
