import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  AlertTriangle, 
  Flame, 
  Clock, 
  TrendingUp,
  ExternalLink,
  Briefcase
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

export interface IDSSummary {
  newThisWeek: number;
  escalatedCount: number;
  criticalImpact: number;
  stuckOver14Days: number;
  recentItems: {
    id: string;
    title: string;
    type: 'risk' | 'opportunity';
    impact: string;
    status: string;
    isEscalated: boolean;
    isStuck: boolean;
    ageInDays: number;
    seatName: string | null;
    ownerName: string;
  }[];
}

interface IDSMasterPanelProps {
  summary: IDSSummary;
}

export function IDSMasterPanel({ summary }: IDSMasterPanelProps) {
  const tiles = [
    { 
      label: 'New This Week', 
      value: summary.newThisWeek, 
      icon: TrendingUp,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50 dark:bg-blue-950/30',
    },
    { 
      label: 'Escalated', 
      value: summary.escalatedCount, 
      icon: Flame,
      color: 'text-destructive',
      bgColor: summary.escalatedCount > 0 ? 'bg-destructive/10' : 'bg-muted',
    },
    { 
      label: 'Critical Impact', 
      value: summary.criticalImpact, 
      icon: AlertTriangle,
      color: 'text-orange-600',
      bgColor: summary.criticalImpact > 0 ? 'bg-orange-50 dark:bg-orange-950/30' : 'bg-muted',
    },
    { 
      label: 'Stuck >14 Days', 
      value: summary.stuckOver14Days, 
      icon: Clock,
      color: 'text-amber-600',
      bgColor: summary.stuckOver14Days > 0 ? 'bg-amber-50 dark:bg-amber-950/30' : 'bg-muted',
    },
  ];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div>
          <CardTitle>IDS Master Register</CardTitle>
          <CardDescription>Risks & Opportunities requiring attention</CardDescription>
        </div>
        <Link 
          to="/eos/risks-opportunities"
          className="text-sm text-primary hover:underline flex items-center gap-1"
        >
          View All
          <ExternalLink className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary Tiles */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {tiles.map((tile) => (
            <div 
              key={tile.label}
              className={cn('p-3 rounded-lg border', tile.bgColor)}
            >
              <div className="flex items-center gap-2 mb-1">
                <tile.icon className={cn('h-4 w-4', tile.color)} />
                <span className="text-xs text-muted-foreground">{tile.label}</span>
              </div>
              <div className={cn('text-2xl font-bold', tile.value > 0 && tile.color)}>
                {tile.value}
              </div>
            </div>
          ))}
        </div>

        {/* Recent Items */}
        {summary.recentItems.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">Attention Required</h4>
            {summary.recentItems.slice(0, 5).map((item) => (
              <Link
                key={item.id}
                to={`/eos/risks-opportunities?item=${item.id}`}
                className={cn(
                  'flex items-center gap-3 p-3 rounded-lg border transition-colors hover:bg-muted/50',
                  item.isEscalated && 'border-destructive/50 bg-destructive/5',
                  item.isStuck && !item.isEscalated && 'border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20'
                )}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {item.isEscalated && <Flame className="h-3.5 w-3.5 text-destructive shrink-0" />}
                    {item.isStuck && !item.isEscalated && <Clock className="h-3.5 w-3.5 text-amber-600 shrink-0" />}
                    <span className="font-medium text-sm truncate">{item.title}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                    {item.seatName ? (
                      <span className="flex items-center gap-1">
                        <Briefcase className="h-3 w-3" />
                        {item.seatName}
                      </span>
                    ) : (
                      <span className="text-amber-600">No seat</span>
                    )}
                    <span>·</span>
                    <span>{item.ownerName}</span>
                    {item.ageInDays > 0 && (
                      <>
                        <span>·</span>
                        <span>{item.ageInDays}d old</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge 
                    variant={item.type === 'risk' ? 'destructive' : 'secondary'} 
                    className="text-xs"
                  >
                    {item.type === 'risk' ? 'Risk' : 'Opp'}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {item.impact}
                  </Badge>
                </div>
              </Link>
            ))}
          </div>
        )}

        {summary.recentItems.length === 0 && (
          <div className="text-center py-6 text-muted-foreground">
            <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No issues requiring immediate attention</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
