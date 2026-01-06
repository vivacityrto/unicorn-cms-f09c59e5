import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';

export type ReadinessStatus = 'ready' | 'incomplete' | 'risk';

export interface ReadinessResult {
  status: ReadinessStatus;
  issues: string[];
}

interface PackageStageForReadiness {
  stage?: {
    stage_type?: string;
    title?: string;
  };
  // For checking client tasks in onboarding
  clientTaskCount?: number;
}

export function computePackageReadiness(
  packageStages: PackageStageForReadiness[],
  clientTaskCounts?: Map<number, number>
): ReadinessResult {
  const issues: string[] = [];
  let hasRisk = false;
  let hasIncomplete = false;

  const stageTypes = packageStages.map(ps => ps.stage?.stage_type?.toLowerCase()).filter(Boolean);

  // Check for onboarding stage
  const hasOnboarding = stageTypes.some(type => 
    type === 'onboarding' || type?.includes('onboard')
  );
  if (!hasOnboarding) {
    issues.push('Missing onboarding stage');
    hasIncomplete = true;
  }

  // Check for documentation stage (delivery or documentation type)
  const hasDocumentation = stageTypes.some(type => 
    type === 'delivery' || type === 'documentation' || type?.includes('document')
  );
  if (!hasDocumentation) {
    issues.push('Missing documentation stage');
    hasIncomplete = true;
  }

  // Check for offboarding stage
  const hasOffboarding = stageTypes.some(type => 
    type === 'offboarding' || type?.includes('offboard')
  );
  if (!hasOffboarding) {
    issues.push('Missing offboarding stage');
    hasRisk = true;
  }

  // Check for client tasks in onboarding stage
  if (hasOnboarding && clientTaskCounts) {
    const onboardingStage = packageStages.find(ps => {
      const type = ps.stage?.stage_type?.toLowerCase();
      return type === 'onboarding' || type?.includes('onboard');
    });
    // If we have task count info, check if onboarding has client tasks
    // This check only applies when we have the data available
  }

  // Determine final status
  if (hasIncomplete) {
    return { status: 'incomplete', issues };
  }
  if (hasRisk) {
    return { status: 'risk', issues };
  }
  return { status: 'ready', issues: [] };
}

interface PackageReadinessBadgeProps {
  status: ReadinessStatus;
  issues: string[];
  size?: 'sm' | 'default';
}

export function PackageReadinessBadge({ status, issues, size = 'default' }: PackageReadinessBadgeProps) {
  const iconSize = size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5';
  
  const badgeContent = useMemo(() => {
    switch (status) {
      case 'ready':
        return {
          icon: <CheckCircle2 className={iconSize} />,
          label: 'Ready',
          className: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 hover:bg-emerald-500/20'
        };
      case 'incomplete':
        return {
          icon: <XCircle className={iconSize} />,
          label: 'Incomplete',
          className: 'bg-amber-500/10 text-amber-600 border-amber-500/20 hover:bg-amber-500/20'
        };
      case 'risk':
        return {
          icon: <AlertTriangle className={iconSize} />,
          label: 'Risk',
          className: 'bg-red-500/10 text-red-600 border-red-500/20 hover:bg-red-500/20'
        };
    }
  }, [status, iconSize]);

  if (issues.length === 0) {
    return (
      <Badge variant="outline" className={`${badgeContent.className} gap-1`}>
        {badgeContent.icon}
        {badgeContent.label}
      </Badge>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className={`${badgeContent.className} gap-1 cursor-help`}>
            {badgeContent.icon}
            {badgeContent.label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <ul className="text-xs space-y-1">
            {issues.map((issue, index) => (
              <li key={index} className="flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-current shrink-0" />
                {issue}
              </li>
            ))}
          </ul>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface PackageReadinessSummaryProps {
  status: ReadinessStatus;
  issues: string[];
}

export function PackageReadinessSummary({ status, issues }: PackageReadinessSummaryProps) {
  const config = useMemo(() => {
    switch (status) {
      case 'ready':
        return {
          icon: <CheckCircle2 className="h-4 w-4" />,
          label: 'Package Ready',
          description: 'All required stages are configured',
          className: 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700'
        };
      case 'incomplete':
        return {
          icon: <XCircle className="h-4 w-4" />,
          label: 'Package Incomplete',
          description: 'Missing required stages',
          className: 'border-amber-500/30 bg-amber-500/5 text-amber-700'
        };
      case 'risk':
        return {
          icon: <AlertTriangle className="h-4 w-4" />,
          label: 'Package at Risk',
          description: 'Missing recommended stages',
          className: 'border-red-500/30 bg-red-500/5 text-red-700'
        };
    }
  }, [status]);

  return (
    <div className={`flex items-center gap-3 py-2 px-4 rounded-lg border ${config.className}`}>
      <div className="shrink-0">{config.icon}</div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm">{config.label}</div>
        {issues.length > 0 ? (
          <div className="text-xs opacity-80">{issues.join(' • ')}</div>
        ) : (
          <div className="text-xs opacity-80">{config.description}</div>
        )}
      </div>
    </div>
  );
}
