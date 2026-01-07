import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { 
  Rocket, 
  ChevronDown, 
  History, 
  Lock, 
  Download,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { StageVersion, CertifiedEditCheck } from '@/hooks/useStageVersions';
import { PublishStageDialog } from './PublishStageDialog';
import { format } from 'date-fns';

interface StageVersionHeaderProps {
  stageId: number;
  stageName: string;
  isCertified: boolean;
  versions: StageVersion[];
  latestPublished: StageVersion | undefined;
  certifiedCheck: CertifiedEditCheck | null;
  onPublish: (notes: string) => void;
  isPublishing: boolean;
  onViewVersion?: (version: StageVersion) => void;
}

export function StageVersionHeader({
  stageId,
  stageName,
  isCertified,
  versions,
  latestPublished,
  certifiedCheck,
  onPublish,
  isPublishing,
  onViewVersion,
}: StageVersionHeaderProps) {
  const [showPublishDialog, setShowPublishDialog] = useState(false);
  
  const currentVersion = latestPublished?.version_number || 0;
  const hasVersions = versions.length > 0;
  const isLocked = certifiedCheck && !certifiedCheck.can_edit;

  const handleExportVersion = (version: StageVersion) => {
    const blob = new Blob([JSON.stringify(version.snapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${stageName.replace(/\s+/g, '-').toLowerCase()}-v${version.version_number}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className="flex items-center gap-3">
        {/* Status Badge */}
        {hasVersions ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="gap-1.5">
                  <CheckCircle2 className="h-3 w-3 text-green-500" />
                  Published v{currentVersion}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                Last published {latestPublished && format(new Date(latestPublished.created_at), 'PPp')}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <Badge variant="secondary" className="gap-1.5">
            Draft
          </Badge>
        )}

        {/* Certified Lock Warning */}
        {isLocked && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="gap-1.5 border-amber-500/30 text-amber-600">
                  <Lock className="h-3 w-3" />
                  Frozen
                </Badge>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p>{certifiedCheck.reason}</p>
                {certifiedCheck.suggestion && (
                  <p className="text-muted-foreground mt-1">{certifiedCheck.suggestion}</p>
                )}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        {/* Version Dropdown */}
        {hasVersions && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1">
                <History className="h-4 w-4" />
                History
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              {versions.slice(0, 10).map((version) => (
                <DropdownMenuItem
                  key={version.id}
                  className="flex items-center justify-between"
                  onClick={() => onViewVersion?.(version)}
                >
                  <div className="flex flex-col">
                    <span className="font-medium">Version {version.version_number}</span>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(version.created_at), 'PP')}
                    </span>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {version.status}
                  </Badge>
                </DropdownMenuItem>
              ))}
              {versions.length > 10 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-muted-foreground">
                    +{versions.length - 10} more versions
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator />
              {latestPublished && (
                <DropdownMenuItem onClick={() => handleExportVersion(latestPublished)}>
                  <Download className="h-4 w-4 mr-2" />
                  Export Latest (JSON)
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* Publish Button */}
        <Button
          size="sm"
          onClick={() => setShowPublishDialog(true)}
          disabled={isLocked}
        >
          <Rocket className="h-4 w-4 mr-2" />
          {hasVersions ? 'Publish Update' : 'Publish'}
        </Button>
      </div>

      <PublishStageDialog
        open={showPublishDialog}
        onOpenChange={setShowPublishDialog}
        stageId={stageId}
        stageName={stageName}
        isCertified={isCertified}
        currentVersion={currentVersion}
        onPublish={(notes) => {
          onPublish(notes);
          setShowPublishDialog(false);
        }}
        isPublishing={isPublishing}
      />
    </>
  );
}
