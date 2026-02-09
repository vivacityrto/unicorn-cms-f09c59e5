import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Clock, AlertTriangle, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type FreshnessStatus = "fresh" | "aging" | "stale";

export interface FreshnessData {
  last_activity_at: string | null;
  days_since_activity: number | null;
  status: FreshnessStatus;
  derived_at: string;
}

interface AskVivFreshnessChipProps {
  freshness: FreshnessData;
  className?: string;
}

/**
 * AskVivFreshnessChip - Shows data freshness warning when data is aging or stale
 * Only displays for non-fresh data
 */
export function AskVivFreshnessChip({ freshness, className }: AskVivFreshnessChipProps) {
  // Don't show anything for fresh data
  if (freshness.status === "fresh") {
    return null;
  }

  const isStale = freshness.status === "stale";
  const daysText = freshness.days_since_activity !== null 
    ? `${freshness.days_since_activity} days ago`
    : "unknown";

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={cn(
              "text-[10px] gap-1 py-0.5 cursor-default",
              isStale
                ? "border-destructive/50 bg-destructive/10 text-destructive"
                : "border-warning/50 bg-warning/10 text-warning",
              className
            )}
          >
            {isStale ? (
              <AlertCircle className="h-2.5 w-2.5" />
            ) : (
              <AlertTriangle className="h-2.5 w-2.5" />
            )}
            <Clock className="h-2.5 w-2.5" />
            <span>
              {isStale ? "Stale" : "Aging"}: Data last updated {daysText}
            </span>
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs max-w-xs">
          <p className="font-medium mb-1">
            {isStale ? "Stale Data Warning" : "Aging Data Notice"}
          </p>
          <p className="text-muted-foreground">
            Confidence is reduced when data is not current.
            {isStale && " High confidence is not available for stale data."}
          </p>
          {freshness.last_activity_at && (
            <p className="text-muted-foreground mt-1">
              Last activity: {formatDate(freshness.last_activity_at)}
            </p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}
