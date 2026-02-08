import { cn } from "@/lib/utils";
import { useAskViv, AskVivMode } from "@/hooks/useAskViv";
import { BookOpen, Shield, Lock } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ModeOption {
  id: AskVivMode;
  label: string;
  icon: typeof BookOpen;
  enabled: boolean;
  description: string;
}

const modes: ModeOption[] = [
  {
    id: "knowledge",
    label: "Knowledge",
    icon: BookOpen,
    enabled: true,
    description: "Internal knowledge and procedures",
  },
  {
    id: "compliance",
    label: "Compliance",
    icon: Shield,
    enabled: false,
    description: "Coming soon",
  },
];

/**
 * AskVivModeSelector - Segmented control for switching between assistant modes
 */
export function AskVivModeSelector() {
  const { selectedMode, setMode } = useAskViv();

  const handleModeChange = (mode: ModeOption) => {
    if (mode.enabled) {
      setMode(mode.id);
    }
  };

  return (
    <TooltipProvider>
      <div className="flex items-center gap-1 p-1 bg-muted/50 rounded-lg">
        {modes.map((mode) => {
          const Icon = mode.icon;
          const isSelected = selectedMode === mode.id;
          const isDisabled = !mode.enabled;

          return (
            <Tooltip key={mode.id}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => handleModeChange(mode)}
                  disabled={isDisabled}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                    isSelected && mode.enabled
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                    isDisabled && "opacity-50 cursor-not-allowed"
                  )}
                >
                  {isDisabled ? (
                    <Lock className="h-3.5 w-3.5" />
                  ) : (
                    <Icon className="h-3.5 w-3.5" />
                  )}
                  <span>{mode.label}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>{mode.description}</p>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
