import { useState } from 'react';
import { Pencil } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface RiskLevelBadgeProps {
  riskLevel: string | null | undefined;
  onUpdate: (newLevel: string) => Promise<void>;
  disabled?: boolean;
}

const RISK_LEVELS = [
  { value: 'low', label: 'Low', className: 'bg-green-500/10 text-green-600 border-green-600' },
  { value: 'medium', label: 'Medium', className: 'bg-yellow-500/10 text-yellow-600 border-yellow-600' },
  { value: 'high', label: 'High', className: 'bg-orange-500/10 text-orange-600 border-orange-600' },
  { value: 'critical', label: 'Critical', className: 'bg-red-500/10 text-red-600 border-red-600' },
];

export function RiskLevelBadge({ riskLevel, onUpdate, disabled }: RiskLevelBadgeProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const currentLevel = RISK_LEVELS.find(l => l.value === riskLevel) || RISK_LEVELS[0];

  const handleSelect = async (value: string) => {
    if (value === riskLevel) return;
    setIsUpdating(true);
    try {
      await onUpdate(value);
    } finally {
      setIsUpdating(false);
    }
  };

  if (!riskLevel && !disabled) {
    // Show a placeholder badge that can be clicked to set risk level
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild disabled={disabled || isUpdating}>
          <button
            className="inline-flex items-center rounded-full border border-dashed px-2.5 py-0.5 text-xs font-semibold transition-colors cursor-pointer hover:bg-muted/50 text-muted-foreground"
          >
            Set Risk Level
            <Pencil className="h-3 w-3 ml-1" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="z-50 bg-popover">
          {RISK_LEVELS.map((level) => (
            <DropdownMenuItem
              key={level.value}
              onClick={() => handleSelect(level.value)}
              className="cursor-pointer"
            >
              <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border", level.className)}>
                {level.label}
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  if (!riskLevel) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled || isUpdating}>
        <button
          className={cn(
            "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors cursor-pointer",
            currentLevel.className
          )}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          {currentLevel.label} Risk
          {isHovered && <Pencil className="h-3 w-3 ml-1" />}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="z-50 bg-popover">
        {RISK_LEVELS.map((level) => (
          <DropdownMenuItem
            key={level.value}
            onClick={() => handleSelect(level.value)}
            className={cn("cursor-pointer", level.value === riskLevel && "bg-muted")}
          >
            <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border", level.className)}>
              {level.label}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
