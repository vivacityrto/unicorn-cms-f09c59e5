/**
 * AskVivExplainSourcesToggle
 * 
 * Toggle switch to enable/disable "Explain sources" panel visibility.
 * Only visible for Vivacity internal roles in compliance mode.
 */

import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface AskVivExplainSourcesToggleProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  className?: string;
}

export function AskVivExplainSourcesToggle({
  enabled,
  onToggle,
  className,
}: AskVivExplainSourcesToggleProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Switch
        id="explain-sources-toggle"
        checked={enabled}
        onCheckedChange={onToggle}
        aria-label="Toggle explain sources panel"
      />
      <Label
        htmlFor="explain-sources-toggle"
        className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer"
      >
        {enabled ? (
          <Eye className="h-3.5 w-3.5" />
        ) : (
          <EyeOff className="h-3.5 w-3.5" />
        )}
        <span>Explain sources</span>
      </Label>
    </div>
  );
}
