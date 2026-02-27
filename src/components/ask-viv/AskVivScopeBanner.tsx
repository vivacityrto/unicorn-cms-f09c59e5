import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Building2, 
  Package, 
  Layers, 
  AlertTriangle, 
  Check, 
  Settings2,
  Info
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface ScopeLockItem {
  id: string | null;
  label: string | null;
  inferred: boolean;
}

export interface ScopeLock {
  tenant_id: string;
  client: ScopeLockItem;
  package: ScopeLockItem;
  phase: ScopeLockItem;
  derived_at: string;
  inference_notes: string[];
}

interface AskVivScopeBannerProps {
  scopeLock: ScopeLock;
  onConfirmScope?: () => void;
  onChangeScope?: () => void;
  isConfirmed?: boolean;
  className?: string;
}

/**
 * AskVivScopeBanner - Displays the exact scope used for a response
 * Shows warning and confirm action when scope was inferred
 */
export function AskVivScopeBanner({
  scopeLock,
  onConfirmScope,
  onChangeScope,
  isConfirmed = false,
  className,
}: AskVivScopeBannerProps) {
  const hasInferred = 
    scopeLock.client.inferred || 
    scopeLock.package.inferred || 
    scopeLock.phase.inferred;

  const inferredParts: string[] = [];
  if (scopeLock.client.inferred) inferredParts.push("Client");
  if (scopeLock.package.inferred) inferredParts.push("Package");
  if (scopeLock.phase.inferred) inferredParts.push("Stage");

  return (
    <div
      className={cn(
        "rounded-lg border p-2.5 text-xs space-y-2",
        hasInferred && !isConfirmed
          ? "bg-warning/5 border-warning/30"
          : "bg-muted/30 border-border/50",
        className
      )}
    >
      {/* Scope line */}
      <div className="flex flex-wrap items-center gap-1.5 text-muted-foreground">
        <span className="font-medium text-foreground/80">Answer scoped to:</span>
        
        {/* Client */}
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge 
                variant="outline" 
                className={cn(
                  "text-[10px] gap-1 py-0.5 cursor-default",
                  scopeLock.client.inferred && !isConfirmed && "border-warning/50 bg-warning/10"
                )}
              >
                <Building2 className="h-2.5 w-2.5" />
                {scopeLock.client.label ?? "Not specified"}
                {scopeLock.client.inferred && !isConfirmed && (
                  <Info className="h-2.5 w-2.5 text-warning" />
                )}
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              {scopeLock.client.inferred ? "Inferred from tenant" : "Explicitly provided"}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Package */}
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge 
                variant="outline" 
                className={cn(
                  "text-[10px] gap-1 py-0.5 cursor-default",
                  scopeLock.package.inferred && !isConfirmed && "border-warning/50 bg-warning/10"
                )}
              >
                <Package className="h-2.5 w-2.5" />
                {scopeLock.package.label ?? "Not specified"}
                {scopeLock.package.inferred && !isConfirmed && (
                  <Info className="h-2.5 w-2.5 text-warning" />
                )}
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              {scopeLock.package.inferred ? "Inferred from active packages" : (scopeLock.package.id ? "Explicitly provided" : "Not specified")}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Phase */}
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge 
                variant="outline" 
                className={cn(
                  "text-[10px] gap-1 py-0.5 cursor-default",
                  scopeLock.phase.inferred && !isConfirmed && "border-warning/50 bg-warning/10"
                )}
              >
                <Layers className="h-2.5 w-2.5" />
                {scopeLock.phase.label ?? "Not specified"}
                {scopeLock.phase.inferred && !isConfirmed && (
                  <Info className="h-2.5 w-2.5 text-warning" />
                )}
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              {scopeLock.phase.inferred ? "Inferred from active stages" : (scopeLock.phase.id ? "Explicitly provided" : "Not specified")}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Inferred warning + actions */}
      {hasInferred && !isConfirmed && (
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-warning">
            <AlertTriangle className="h-3 w-3" />
            <span className="font-medium">
              Inferred scope. Confirm?
            </span>
            <span className="text-muted-foreground">
              ({inferredParts.join(", ")} inferred)
            </span>
          </div>
          <div className="flex items-center gap-1">
            {onConfirmScope && (
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-[10px] px-2 gap-1 border-warning/50 hover:bg-warning/10"
                onClick={onConfirmScope}
              >
                <Check className="h-3 w-3" />
                Confirm scope
              </Button>
            )}
            {onChangeScope && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-[10px] px-2 gap-1"
                onClick={onChangeScope}
              >
                <Settings2 className="h-3 w-3" />
                Change
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Confirmed state */}
      {hasInferred && isConfirmed && (
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Check className="h-3 w-3 text-[hsl(var(--success,142_76%_36%))]" />
          <span>Scope confirmed for this session.</span>
          {onChangeScope && (
            <Button
              variant="ghost"
              size="sm"
              className="h-5 text-[10px] px-1.5 gap-1"
              onClick={onChangeScope}
            >
              <Settings2 className="h-2.5 w-2.5" />
              Change
            </Button>
          )}
        </div>
      )}

      {/* Inference notes */}
      {scopeLock.inference_notes.length > 0 && (
        <div className="text-muted-foreground/70 text-[10px]">
          {scopeLock.inference_notes.map((note, idx) => (
            <div key={idx}>• {note}</div>
          ))}
        </div>
      )}
    </div>
  );
}
