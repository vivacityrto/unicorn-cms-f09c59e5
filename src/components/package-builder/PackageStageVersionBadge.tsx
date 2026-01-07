import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ArrowUp, Check, RefreshCw } from 'lucide-react';
import { usePackageStageVersion } from '@/hooks/useStageVersions';

interface PackageStageVersionBadgeProps {
  packageId: number;
  stageId: number;
  onReviewUpdate?: () => void;
}

export function PackageStageVersionBadge({
  packageId,
  stageId,
  onReviewUpdate,
}: PackageStageVersionBadgeProps) {
  const { 
    currentVersion, 
    latestVersion, 
    hasUpdateAvailable,
    isLoading,
  } = usePackageStageVersion(packageId, stageId);

  if (isLoading) {
    return <Badge variant="outline" className="animate-pulse">Loading...</Badge>;
  }

  if (!currentVersion) {
    return (
      <Badge variant="secondary" className="gap-1">
        No version
      </Badge>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge 
              variant={hasUpdateAvailable ? 'outline' : 'secondary'}
              className={hasUpdateAvailable ? 'border-amber-500/30 text-amber-600' : ''}
            >
              {hasUpdateAvailable ? (
                <ArrowUp className="h-3 w-3 mr-1" />
              ) : (
                <Check className="h-3 w-3 mr-1" />
              )}
              v{currentVersion.version_number}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            {hasUpdateAvailable 
              ? `Update available: v${currentVersion.version_number} → v${latestVersion?.version_number}`
              : 'Using latest version'
            }
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {hasUpdateAvailable && onReviewUpdate && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={onReviewUpdate}
        >
          <RefreshCw className="h-3 w-3 mr-1" />
          Review
        </Button>
      )}
    </div>
  );
}
