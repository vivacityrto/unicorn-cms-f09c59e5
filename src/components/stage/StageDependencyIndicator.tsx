import { Link2, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useStageDependencyCheck } from '@/hooks/useStageDependencies';

interface StageDependencyIndicatorProps {
  stageId: number;
}

export function StageDependencyIndicator({ stageId }: StageDependencyIndicatorProps) {
  const { result, isLoading } = useStageDependencyCheck(stageId);

  if (isLoading) {
    return <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />;
  }

  if (!result?.has_dependencies) {
    return null;
  }

  const dependencyCount = result.resolved_dependencies.length;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge 
            variant="outline" 
            className="text-xs gap-1 cursor-help bg-blue-500/10 text-blue-600 border-blue-500/20"
          >
            <Link2 className="h-3 w-3" />
            {dependencyCount}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <p className="font-medium text-xs mb-1">Depends on {dependencyCount} stage{dependencyCount !== 1 ? 's' : ''}:</p>
          <ul className="text-xs space-y-0.5">
            {result.resolved_dependencies.map((dep) => (
              <li key={dep.stage_key} className="flex items-center gap-1">
                <span className="w-1 h-1 rounded-full bg-current shrink-0" />
                {dep.name}
                {dep.version_label && (
                  <span className="text-muted-foreground">({dep.version_label})</span>
                )}
              </li>
            ))}
          </ul>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
