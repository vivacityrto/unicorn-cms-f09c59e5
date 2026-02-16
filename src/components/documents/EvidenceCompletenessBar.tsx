import { useEvidenceCompleteness } from '@/hooks/useEvidenceCategories';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { AlertTriangle, CheckCircle2, FileText } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface EvidenceCompletenessBarProps {
  tenantId: number;
  stageInstanceId?: number;
  compact?: boolean;
}

export function EvidenceCompletenessBar({ tenantId, stageInstanceId, compact }: EvidenceCompletenessBarProps) {
  const { data, isLoading } = useEvidenceCompleteness(tenantId, stageInstanceId);

  if (isLoading || !data || data.total === 0) return null;

  const pct = Math.round((data.uploaded / data.total) * 100);
  const hasMandatoryGaps = data.mandatory_missing > 0;

  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1.5">
              {hasMandatoryGaps ? (
                <AlertTriangle className="h-4 w-4 text-amber-500" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              )}
              <span className="text-xs font-medium">
                {data.uploaded}/{data.total}
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>{data.uploaded} of {data.total} evidence categories uploaded</p>
            {hasMandatoryGaps && (
              <p className="text-amber-400 font-medium">{data.mandatory_missing} mandatory categories missing</p>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <div className="space-y-2 p-3 border rounded-lg bg-card">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <FileText className="h-4 w-4" />
          Evidence Completeness
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold">{pct}%</span>
          {hasMandatoryGaps && (
            <Badge variant="destructive" className="text-[10px] px-1.5 py-0 gap-1">
              <AlertTriangle className="h-3 w-3" />
              {data.mandatory_missing} mandatory gaps
            </Badge>
          )}
        </div>
      </div>
      <Progress value={pct} className="h-2" />
      <p className="text-xs text-muted-foreground">
        {data.uploaded} of {data.total} categories uploaded
        {hasMandatoryGaps && ' · Stage completion blocked until mandatory evidence is provided'}
      </p>
    </div>
  );
}
