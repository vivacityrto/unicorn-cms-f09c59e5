import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Package2, AlertCircle, CheckCircle2 } from 'lucide-react';

interface PackageInfo {
  id: number;
  name: string;
  slug: string | null;
  membership_state: string;
  current_stage: string | null;
  progress_percent: number;
  has_blocked: boolean;
}

interface ClientPackageBadgesProps {
  packages: PackageInfo[];
  maxVisible?: number;
}

export function ClientPackageBadges({ packages, maxVisible = 3 }: ClientPackageBadgesProps) {
  if (packages.length === 0) {
    return (
      <span className="text-sm text-muted-foreground">No packages</span>
    );
  }

  const visiblePackages = packages.slice(0, maxVisible);
  const hiddenCount = packages.length - maxVisible;

  return (
    <TooltipProvider>
      <div className="flex flex-wrap gap-1">
        {visiblePackages.map((pkg) => (
          <Tooltip key={pkg.id}>
            <TooltipTrigger asChild>
              <Badge
                variant="outline"
                className={`text-xs py-0.5 px-2 cursor-default ${
                  pkg.has_blocked
                    ? 'border-red-500 bg-red-500/10 text-red-600'
                    : pkg.membership_state === 'active'
                    ? 'border-blue-500 bg-blue-500/10 text-blue-600'
                    : 'border-muted-foreground'
                }`}
              >
                {pkg.has_blocked && <AlertCircle className="h-3 w-3 mr-1" />}
                {pkg.progress_percent === 100 && <CheckCircle2 className="h-3 w-3 mr-1" />}
                {pkg.slug || pkg.name.substring(0, 8)}
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs">
              <div className="space-y-1">
                <p className="font-semibold">{pkg.name}</p>
                <p className="text-xs text-muted-foreground">
                  Progress: {pkg.progress_percent}%
                </p>
                {pkg.current_stage && (
                  <p className="text-xs">Phase: {pkg.current_stage}</p>
                )}
                {pkg.has_blocked && (
                  <p className="text-xs text-red-500">Has blocked phases</p>
                )}
              </div>
            </TooltipContent>
          </Tooltip>
        ))}
        
        {hiddenCount > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="secondary" className="text-xs py-0.5 px-2 cursor-default">
                +{hiddenCount} more
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs">
              <div className="space-y-1">
                {packages.slice(maxVisible).map((pkg) => (
                  <div key={pkg.id} className="flex items-center gap-2">
                    <Package2 className="h-3 w-3" />
                    <span className="text-sm">{pkg.name}</span>
                    <span className="text-xs text-muted-foreground">
                      ({pkg.progress_percent}%)
                    </span>
                  </div>
                ))}
              </div>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
}
