import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { FileSpreadsheet, CheckCircle2, AlertTriangle, XCircle, HelpCircle } from 'lucide-react';
import { useExcelBindingStatus } from '@/hooks/useExcelBindings';

interface ExcelBindingStatusBadgeProps {
  documentId: number;
  compact?: boolean;
}

export function ExcelBindingStatusBadge({ documentId, compact = false }: ExcelBindingStatusBadgeProps) {
  const { status, loading } = useExcelBindingStatus(documentId);

  if (loading) return null;
  if (status === 'none') return null;

  const config = {
    ready: {
      icon: CheckCircle2,
      label: 'Excel Ready',
      tooltip: 'All merge fields and dropdowns are configured',
      className: 'bg-green-100 text-green-700 border-green-200'
    },
    draft: {
      icon: AlertTriangle,
      label: 'Needs Binding',
      tooltip: 'Excel template has fields that need to be configured',
      className: 'bg-amber-100 text-amber-700 border-amber-200'
    },
    error: {
      icon: XCircle,
      label: 'Binding Error',
      tooltip: 'Excel bindings have validation errors',
      className: 'bg-red-100 text-red-700 border-red-200'
    }
  }[status] || {
    icon: HelpCircle,
    label: 'Unknown',
    tooltip: 'Unknown status',
    className: 'bg-muted text-muted-foreground'
  };

  const Icon = config.icon;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge 
            variant="outline" 
            className={`text-xs gap-1 ${config.className} ${compact ? 'px-1.5 py-0' : ''}`}
          >
            <FileSpreadsheet className="h-3 w-3" />
            {!compact && <span>{config.label}</span>}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4" />
            <span>{config.tooltip}</span>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
