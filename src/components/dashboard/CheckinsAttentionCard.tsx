import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ChevronRight, Flag, HeartPulse } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useCheckinsAttention } from "@/hooks/use-checkins-attention";
import { attentionSentence, describeItem, minePackages, type CheckinAttentionItem } from "./checkinsAttention";

const PREVIEW = 6;

function Row({ item }: { item: CheckinAttentionItem }) {
  const parts = describeItem(item);
  return (
    <li>
      <Link
        to={`/tenant/${item.tenant_id}`}
        className="flex items-start gap-3 rounded-lg border bg-card p-3 transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className={cn("mt-0.5 rounded-md p-1.5", item.blocker_count > 0 ? "bg-amber-500/15 text-amber-700 dark:text-amber-300" : "bg-primary/10 text-primary")}>
          {item.blocker_count > 0 ? <Flag className="h-4 w-4" aria-hidden /> : <AlertTriangle className="h-4 w-4" aria-hidden />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <p className="truncate text-sm font-semibold">{item.tenant_name}</p>
            <p className="text-xs text-muted-foreground">{item.manager_name ? `Managed by ${item.manager_name}` : "No package manager"}</p>
          </div>
          <p className="text-xs text-muted-foreground">{item.package_name}</p>
          <ul className="mt-1 space-y-0.5 text-xs text-foreground">
            {parts.map((p) => <li key={p}>{p}</li>)}
          </ul>
          {/* Written by the client for their consultant. Rendered as plain text. */}
          {item.latest_blocker?.comment && <p className="mt-1 line-clamp-2 break-words text-xs text-muted-foreground">{item.latest_blocker.comment}</p>}
        </div>
        <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      </Link>
    </li>
  );
}

/**
 * Clients whose package check-ins need a consultant now: a blocker in the last 30 days, or two low pulses in a row.
 * Two plain flags, no score. Opens on "My clients" (packages this person manages) when they have any, otherwise on all.
 */
export function CheckinsAttentionCard() {
  const { profile } = useAuth();
  const { data, isLoading, isError } = useCheckinsAttention();
  const [scope, setScope] = useState<"mine" | "all" | null>(null);
  const [expanded, setExpanded] = useState(false);

  if (isLoading) return <Skeleton className="h-28 w-full rounded-xl" />;
  if (isError || !data) return null;

  const mine = minePackages(data.items, profile?.user_uuid);
  const active = scope ?? (mine.length > 0 ? "mine" : "all");
  const items = active === "mine" ? mine : data.items;
  const shown = expanded ? items : items.slice(0, PREVIEW);

  return (
    <Card className={cn(items.length > 0 && "border-amber-500/40")}>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base"><HeartPulse className="h-4 w-4 text-primary" aria-hidden />Client check-ins needing attention</CardTitle>
          <div role="group" aria-label="Which clients" className="flex gap-1">
            {(["mine", "all"] as const).map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={active === s}
                onClick={() => { setScope(s); setExpanded(false); }}
                className={cn("rounded-full border px-3 py-1 text-xs font-medium transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", active === s && "border-primary bg-primary/10")}
              >
                {s === "mine" ? `My clients · ${mine.length}` : `All clients · ${data.items.length}`}
              </button>
            ))}
          </div>
        </div>
        <p className={cn("text-sm", items.length > 0 ? "font-medium text-amber-800 dark:text-amber-300" : "text-muted-foreground")} role={items.length > 0 ? "status" : undefined}>{attentionSentence(items)}</p>
      </CardHeader>
      {items.length > 0 && (
        <CardContent>
          <ul className="space-y-2">{shown.map((i) => <Row key={i.package_instance_id} item={i} />)}</ul>
          {items.length > PREVIEW && (
            <Button variant="ghost" size="sm" className="mt-2 w-full text-xs" onClick={() => setExpanded((v) => !v)}>
              {expanded ? "Show fewer" : `Show all ${items.length}`}
            </Button>
          )}
        </CardContent>
      )}
    </Card>
  );
}
