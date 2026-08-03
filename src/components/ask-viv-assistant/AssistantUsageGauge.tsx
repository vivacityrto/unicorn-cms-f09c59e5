import { AlertTriangle, Infinity as InfinityIcon } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useAskVivAssistantUsage } from "@/hooks/useAskVivAssistantUsage";

const NEAR_LIMIT_THRESHOLD = 85;

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}

interface AssistantUsageGaugeProps {
  /** Narrower layout for the floating widget header vs the full page header. */
  compact?: boolean;
  className?: string;
}

/**
 * Shared daily-usage gauge shown on both Ask Viv Assistant surfaces (floating
 * widget + full page) — same data source (useAskVivAssistantUsage), same
 * near-limit warning threshold, so the two never disagree about how close a
 * user is to today's cap.
 */
export function AssistantUsageGauge({ compact, className }: AssistantUsageGaugeProps) {
  const { usage, isLoading } = useAskVivAssistantUsage();

  if (isLoading || !usage) return null;

  if (usage.unlimited) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="secondary" className={cn("gap-1 font-normal", className)}>
              <InfinityIcon className="h-3 w-3" />
              {!compact && "Unlimited"}
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            Your account is exempt from the daily usage cap.
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  const nearLimit = usage.percentUsed >= NEAR_LIMIT_THRESHOLD;
  const atLimit = usage.percentUsed >= 100;
  const indicatorClassName = atLimit
    ? "bg-destructive"
    : nearLimit
      ? "bg-amber-500"
      : undefined;

  const label = `${formatTokens(usage.usedTokens)} / ${formatTokens(usage.capTokens)} tokens used today`;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn("flex items-center gap-1.5", compact ? "w-20" : "w-40", className)}>
            {nearLimit && (
              <AlertTriangle className={cn("h-3.5 w-3.5 flex-shrink-0", atLimit ? "text-destructive" : "text-amber-500")} />
            )}
            <Progress
              value={usage.percentUsed}
              indicatorClassName={indicatorClassName}
              className="h-1.5"
            />
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p>{label}</p>
          {atLimit ? (
            <p className="text-destructive">Today's usage limit reached — resets tomorrow.</p>
          ) : nearLimit ? (
            <p>Approaching today's usage limit.</p>
          ) : null}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
