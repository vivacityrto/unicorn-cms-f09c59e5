/**
 * Ask Viv Blocked Intent Banner
 * 
 * Shows a compact banner when an intent is blocked early,
 * with clickable chips for safe rephrase suggestions.
 */

import React from "react";
import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface BlockedIntentInfo {
  intent: "decision_request" | "out_of_scope";
  message: string;
  rephrases: readonly string[];
}

interface AskVivBlockedIntentBannerProps {
  blockedInfo: BlockedIntentInfo;
  onRephraseClick?: (rephrase: string) => void;
  className?: string;
}

/**
 * Get banner message based on intent type
 */
function getBannerMessage(intent: BlockedIntentInfo["intent"]): string {
  switch (intent) {
    case "decision_request":
      return "Decision requests are blocked.";
    case "out_of_scope":
      return "This question is outside Ask Viv's scope.";
    default:
      return "This request cannot be processed.";
  }
}

export function AskVivBlockedIntentBanner({
  blockedInfo,
  onRephraseClick,
  className,
}: AskVivBlockedIntentBannerProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-destructive/30 bg-destructive/10 p-3",
        className
      )}
    >
      {/* Banner header */}
      <div className="flex items-center gap-2 text-sm font-medium text-destructive">
        <AlertTriangle className="h-4 w-4 flex-shrink-0" />
        <span>{blockedInfo.message || getBannerMessage(blockedInfo.intent)}</span>
      </div>

      {/* Safe rephrase suggestions */}
      {blockedInfo.rephrases.length > 0 && (
        <div className="mt-3">
          <p className="mb-2 text-xs text-muted-foreground">
            Try asking:
          </p>
          <div className="flex flex-wrap gap-2">
            {blockedInfo.rephrases.map((rephrase, index) => (
              <Badge
                key={index}
                variant="outline"
                className={cn(
                  "cursor-pointer text-xs font-normal transition-colors",
                  "border-border bg-background text-foreground hover:bg-accent"
                )}
                onClick={() => onRephraseClick?.(rephrase)}
              >
                {rephrase}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default AskVivBlockedIntentBanner;
