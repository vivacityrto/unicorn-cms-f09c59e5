import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Zap, AlertTriangle, Clock } from 'lucide-react';
import type { FocusItem } from '@/hooks/useDashboardTriage';
import { cn } from '@/lib/utils';

interface Props {
  items: FocusItem[];
  onAction: (item: FocusItem) => void;
}

const severityStyles: Record<string, string> = {
  critical: 'border-l-destructive bg-destructive/5',
  high: 'border-l-orange-500 bg-orange-500/5',
  moderate: 'border-l-amber-500 bg-amber-500/5',
};

const severityBadge: Record<string, { class: string; label: string }> = {
  critical: { class: 'bg-destructive text-destructive-foreground', label: 'Critical' },
  high: { class: 'bg-orange-500 text-white', label: 'High' },
  moderate: { class: 'bg-amber-500 text-white', label: 'Moderate' },
};

export function TodaysFocusSection({ items, onAction }: Props) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <div className="h-8 w-8 rounded-lg bg-destructive/10 flex items-center justify-center">
          <Zap className="h-4 w-4 text-destructive" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-foreground uppercase tracking-wide">Today's Focus</h2>
          <p className="text-xs text-muted-foreground">{items.length} items require attention</p>
        </div>
      </div>

      <div className="grid gap-2">
        {items.map(item => {
          const sev = severityBadge[item.severity] || severityBadge.moderate;
          return (
            <Card
              key={item.id}
              className={cn(
                'border-l-4 transition-all hover:shadow-md',
                severityStyles[item.severity] || severityStyles.moderate
              )}
            >
              <CardContent className="p-3 flex items-center gap-3">
                <Badge className={cn('text-[10px] shrink-0', sev.class)}>{sev.label}</Badge>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">{item.tenantName}</p>
                  <p className="text-xs text-muted-foreground truncate">{item.reason}</p>
                </div>
                {item.age && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                    <Clock className="h-3 w-3" />
                    <span>{item.age}</span>
                  </div>
                )}
                <Button
                  size="sm"
                  variant="default"
                  className="shrink-0 h-7 text-xs"
                  onClick={() => onAction(item)}
                >
                  {item.actionLabel}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
