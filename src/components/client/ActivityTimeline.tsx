import { FileText, CheckCircle2, Upload, RefreshCw, Activity } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useClientActivityTimeline, type TimelineEntry } from "@/hooks/useClientActivityTimeline";
import { formatDistanceToNow } from "date-fns";

function iconForAction(action: string) {
  const a = action.toLowerCase();
  if (a.includes("complete") || a.includes("status")) return <CheckCircle2 className="h-4 w-4 text-primary" />;
  if (a.includes("upload")) return <Upload className="h-4 w-4 text-secondary" />;
  if (a.includes("document") || a.includes("release")) return <FileText className="h-4 w-4 text-secondary" />;
  if (a.includes("update") || a.includes("change")) return <RefreshCw className="h-4 w-4 text-muted-foreground" />;
  return <Activity className="h-4 w-4 text-muted-foreground" />;
}

function formatAction(entry: TimelineEntry) {
  const action = entry.action.replace(/_/g, " ");
  const entity = entry.entity_type?.replace(/_/g, " ") ?? "";
  return `${action}${entity ? ` · ${entity}` : ""}`;
}

export function ActivityTimeline() {
  const { data: entries = [], isLoading } = useClientActivityTimeline();

  if (isLoading || entries.length === 0) return null;

  return (
    <Card>
      <CardContent className="p-5">
        <h3 className="font-semibold text-foreground mb-3">Recent activity</h3>
        <div className="space-y-0">
          {entries.map((entry, i) => (
            <div
              key={entry.id}
              className="flex items-start gap-3 py-2.5 border-b last:border-0 border-border/50"
            >
              <div className="mt-0.5">{iconForAction(entry.action)}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground capitalize">{formatAction(entry)}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}
                </p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
