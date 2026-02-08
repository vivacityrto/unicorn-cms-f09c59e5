import { Building2, Package, Layers, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface AskVivContext {
  tenant_id: number | null;
  tenant_name?: string;
  client_id?: number | null;
  client_name?: string;
  package_id?: number | null;
  package_name?: string;
  phase_id?: number | null;
  phase_name?: string;
}

interface AskVivContextChipsProps {
  context: AskVivContext;
  onClearContext?: () => void;
  className?: string;
}

/**
 * AskVivContextChips - Displays current context for Compliance Assistant
 * Shows tenant, client, package, and phase context when available
 */
export function AskVivContextChips({ 
  context, 
  onClearContext,
  className 
}: AskVivContextChipsProps) {
  const hasContext = context.tenant_id || context.client_id || context.package_id || context.phase_id;

  if (!hasContext) {
    return null;
  }

  return (
    <div className={cn("flex flex-wrap gap-1.5 items-center", className)}>
      {context.tenant_name && (
        <Badge variant="secondary" className="text-xs gap-1 py-0.5">
          <Building2 className="h-3 w-3" />
          {context.tenant_name}
        </Badge>
      )}
      
      {context.client_name && (
        <Badge variant="outline" className="text-xs gap-1 py-0.5">
          <Building2 className="h-3 w-3" />
          {context.client_name}
        </Badge>
      )}
      
      {context.package_name && (
        <Badge variant="outline" className="text-xs gap-1 py-0.5">
          <Package className="h-3 w-3" />
          {context.package_name}
        </Badge>
      )}
      
      {context.phase_name && (
        <Badge variant="outline" className="text-xs gap-1 py-0.5">
          <Layers className="h-3 w-3" />
          {context.phase_name}
        </Badge>
      )}
      
      {onClearContext && (
        <button
          onClick={onClearContext}
          className="h-5 w-5 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title="Clear context"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
