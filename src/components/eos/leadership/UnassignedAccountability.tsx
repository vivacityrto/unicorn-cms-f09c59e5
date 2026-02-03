import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Mountain, AlertCircle, Lightbulb } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import type { UnassignedAccountabilityItem } from '@/hooks/useLeadershipDashboard';

interface UnassignedAccountabilityProps {
  items: UnassignedAccountabilityItem[];
}

const typeConfig = {
  rock: { icon: Mountain, label: 'Rock', color: 'text-primary', link: '/eos/rocks' },
  risk: { icon: AlertCircle, label: 'Risk', color: 'text-destructive', link: '/eos/risks-opportunities' },
  opportunity: { icon: Lightbulb, label: 'Opportunity', color: 'text-amber-500', link: '/eos/risks-opportunities' },
  metric: { icon: AlertTriangle, label: 'Metric', color: 'text-blue-500', link: '/eos/scorecard' },
};

export function UnassignedAccountability({ items }: UnassignedAccountabilityProps) {
  if (items.length === 0) {
    return (
      <Card className="border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
            <AlertTriangle className="h-4 w-4" />
            Unassigned Accountability
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">
            <div className="text-emerald-600 dark:text-emerald-400 font-medium">
              ✓ All items have seat ownership
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Full accountability alignment achieved
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm flex items-center gap-2 text-amber-700 dark:text-amber-300">
              <AlertTriangle className="h-4 w-4" />
              Unassigned Accountability
            </CardTitle>
            <CardDescription className="mt-1">
              {items.length} item{items.length !== 1 ? 's' : ''} without seat ownership
            </CardDescription>
          </div>
          <Badge variant="secondary" className="bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
            Needs Attention
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 max-h-[200px] overflow-y-auto">
          {items.map((item) => {
            const config = typeConfig[item.type];
            const Icon = config.icon;
            
            return (
              <Link
                key={item.id}
                to={`${config.link}?item=${item.id}`}
                className="flex items-center gap-3 p-2.5 rounded-lg border bg-background/80 hover:bg-muted/50 transition-colors"
              >
                <Icon className={cn('h-4 w-4 shrink-0', config.color)} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{item.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {config.label} · Owner: {item.ownerName}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground shrink-0">
                  {item.ageInDays}d old
                </div>
              </Link>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground mt-3 italic">
          These items need to be linked to an Accountability Chart seat
        </p>
      </CardContent>
    </Card>
  );
}
