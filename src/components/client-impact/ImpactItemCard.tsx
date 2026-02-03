import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, AlertTriangle, Clock, Shield } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import type { ClientImpactItem, ItemSection, ItemStatus } from '@/types/clientImpact';
import { ITEM_STATUS_CONFIG } from '@/types/clientImpact';

interface ImpactItemCardProps {
  item: ClientImpactItem;
}

const SECTION_ICONS: Record<ItemSection, React.ReactNode> = {
  improvements: <CheckCircle2 className="h-4 w-4 text-primary" />,
  risks: <Shield className="h-4 w-4 text-destructive" />,
  process_enhancements: <Clock className="h-4 w-4 text-accent-foreground" />,
  forward_focus: <AlertTriangle className="h-4 w-4 text-muted-foreground" />,
};

export function ImpactItemCard({ item }: ImpactItemCardProps) {
  const statusConfig = item.status ? ITEM_STATUS_CONFIG[item.status] : null;
  const icon = SECTION_ICONS[item.section];
  
  return (
    <Card className="border-l-4 border-l-primary/30">
      <CardContent className="p-4 space-y-2">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 shrink-0">{icon}</div>
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-start justify-between gap-2">
              <h4 className="font-medium text-sm">{item.title}</h4>
              {statusConfig && (
                <Badge variant="outline" className={cn('shrink-0 text-xs', statusConfig.color)}>
                  {statusConfig.label}
                </Badge>
              )}
            </div>
            
            {item.description && (
              <p className="text-sm text-muted-foreground">{item.description}</p>
            )}
            
            {item.client_benefit && (
              <p className="text-xs text-primary font-medium">
                Impact: {item.client_benefit}
              </p>
            )}
            
            <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1">
              {item.category && (
                <Badge variant="secondary" className="text-xs">
                  {item.category}
                </Badge>
              )}
              {item.completed_date && (
                <span>Completed: {format(new Date(item.completed_date), 'MMM d, yyyy')}</span>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
