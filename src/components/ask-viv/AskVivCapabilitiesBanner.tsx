import { BookOpen, Shield, Info, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { AskVivMode } from "@/hooks/useAskViv";

interface AskVivCapabilitiesBannerProps {
  mode: AskVivMode;
  className?: string;
}

const modeConfig = {
  knowledge: {
    icon: BookOpen,
    label: "Knowledge Assistant",
    description: "Internal knowledge only",
    badges: ["Procedures", "Policies", "No client data"],
    color: "from-primary/5 to-primary/10",
    borderColor: "border-primary/20",
  },
  compliance: {
    icon: Shield,
    label: "Compliance Assistant",
    description: "Tenant data + internal knowledge. Read-only.",
    badges: ["Tenant data", "Read-only", "Audit logged"],
    color: "from-blue-500/5 to-blue-500/10",
    borderColor: "border-blue-500/20",
  },
};

/**
 * AskVivCapabilitiesBanner - Shows current mode capabilities
 */
export function AskVivCapabilitiesBanner({ mode, className }: AskVivCapabilitiesBannerProps) {
  const config = modeConfig[mode];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        "px-3 py-2 rounded-lg border flex items-start gap-2",
        `bg-gradient-to-r ${config.color}`,
        config.borderColor,
        className
      )}
    >
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-foreground">
            {config.description}
          </span>
        </div>
        <div className="flex flex-wrap gap-1 mt-1">
          {config.badges.map((badge) => (
            <Badge
              key={badge}
              variant="outline"
              className="text-[10px] py-0 px-1.5 h-4"
            >
              {badge}
            </Badge>
          ))}
        </div>
      </div>
      {mode === "compliance" && (
        <span title="Read-only mode">
          <Eye className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        </span>
      )}
    </div>
  );
}
