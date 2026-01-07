import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Brain, CheckCircle2, AlertTriangle, XCircle, Clock, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export type AIStatus = 'pending' | 'auto_approved' | 'needs_review' | 'rejected' | null;

interface AIConfidenceBadgeProps {
  aiStatus: AIStatus;
  overallConfidence?: number | null;
  categoryConfidence?: number | null;
  descriptionConfidence?: number | null;
  reasoning?: string | null;
  compact?: boolean;
  showConfidenceValues?: boolean;
}

export function AIConfidenceBadge({
  aiStatus,
  overallConfidence,
  categoryConfidence,
  descriptionConfidence,
  reasoning,
  compact = false,
  showConfidenceValues = false
}: AIConfidenceBadgeProps) {
  if (!aiStatus || aiStatus === 'pending') {
    if (compact) return null;
    return (
      <Badge variant="outline" className="text-xs border-muted-foreground/30 text-muted-foreground gap-1">
        <Clock className="h-3 w-3" />
        {!compact && 'AI Pending'}
      </Badge>
    );
  }

  const config = {
    auto_approved: {
      icon: CheckCircle2,
      label: 'Auto-approved',
      className: 'border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-400',
      iconClassName: 'text-green-600 dark:text-green-400'
    },
    needs_review: {
      icon: AlertTriangle,
      label: 'Needs Review',
      className: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400',
      iconClassName: 'text-amber-600 dark:text-amber-400'
    },
    rejected: {
      icon: XCircle,
      label: 'AI Rejected',
      className: 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400',
      iconClassName: 'text-red-600 dark:text-red-400'
    }
  };

  const statusConfig = config[aiStatus];
  if (!statusConfig) return null;

  const Icon = statusConfig.icon;
  
  const tooltipContent = (
    <div className="space-y-2 text-xs max-w-xs">
      <div className="font-medium flex items-center gap-1">
        <Brain className="h-3 w-3" />
        AI Analysis
      </div>
      {overallConfidence !== null && overallConfidence !== undefined && (
        <div className="space-y-1">
          <div className="flex justify-between">
            <span>Overall:</span>
            <span className="font-medium">{overallConfidence.toFixed(0)}%</span>
          </div>
          {categoryConfidence !== null && categoryConfidence !== undefined && (
            <div className="flex justify-between text-muted-foreground">
              <span>Category:</span>
              <span>{categoryConfidence.toFixed(0)}%</span>
            </div>
          )}
          {descriptionConfidence !== null && descriptionConfidence !== undefined && (
            <div className="flex justify-between text-muted-foreground">
              <span>Description:</span>
              <span>{descriptionConfidence.toFixed(0)}%</span>
            </div>
          )}
        </div>
      )}
      {reasoning && (
        <p className="text-muted-foreground border-t pt-1">{reasoning}</p>
      )}
    </div>
  );

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge 
            variant="outline" 
            className={cn('text-xs gap-1 cursor-help', statusConfig.className)}
          >
            <Icon className={cn('h-3 w-3', statusConfig.iconClassName)} />
            {!compact && statusConfig.label}
            {showConfidenceValues && overallConfidence !== null && overallConfidence !== undefined && (
              <span className="ml-1">{overallConfidence.toFixed(0)}%</span>
            )}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" align="center">
          {tooltipContent}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Confidence progress bar component
interface ConfidenceBarProps {
  value: number;
  label?: string;
  size?: 'sm' | 'md';
}

export function ConfidenceBar({ value, label, size = 'md' }: ConfidenceBarProps) {
  const getColor = (val: number) => {
    if (val >= 90) return 'bg-green-500';
    if (val >= 70) return 'bg-amber-500';
    return 'bg-red-500';
  };

  return (
    <div className="space-y-1">
      {label && (
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">{label}</span>
          <span className="font-medium">{value.toFixed(0)}%</span>
        </div>
      )}
      <div className={cn(
        'w-full bg-muted rounded-full overflow-hidden',
        size === 'sm' ? 'h-1.5' : 'h-2'
      )}>
        <div 
          className={cn('h-full transition-all', getColor(value))}
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
    </div>
  );
}
