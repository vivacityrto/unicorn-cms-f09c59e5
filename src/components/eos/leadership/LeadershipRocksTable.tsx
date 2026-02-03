import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { AlertTriangle, ExternalLink } from 'lucide-react';
import type { LeadershipRockStatus } from '@/hooks/useLeadershipDashboard';

interface LeadershipRocksTableProps {
  rockStatus: LeadershipRockStatus;
}

const statusStyles: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  'on_track': { label: 'On Track', variant: 'default' },
  'On_Track': { label: 'On Track', variant: 'default' },
  'at_risk': { label: 'At Risk', variant: 'secondary' },
  'At_Risk': { label: 'At Risk', variant: 'secondary' },
  'off_track': { label: 'Off Track', variant: 'destructive' },
  'Off_Track': { label: 'Off Track', variant: 'destructive' },
  'complete': { label: 'Complete', variant: 'outline' },
  'Complete': { label: 'Complete', variant: 'outline' },
};

export function LeadershipRocksTable({ rockStatus }: LeadershipRocksTableProps) {
  if (rockStatus.rocks.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Quarterly Rocks Overview</CardTitle>
          <CardDescription>All current quarter Rocks and their status</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            No Rocks set for this quarter
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div>
          <CardTitle>Quarterly Rocks Overview</CardTitle>
          <CardDescription>
            {rockStatus.totalRocks} Rocks · {rockStatus.onTrack} On Track · {rockStatus.offTrack + rockStatus.atRisk} Need Attention
          </CardDescription>
        </div>
        <Link 
          to="/eos/rocks"
          className="text-sm text-primary hover:underline flex items-center gap-1"
        >
          View All
          <ExternalLink className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {rockStatus.rocks.map((rock) => {
            const style = statusStyles[rock.status] || { label: rock.status, variant: 'outline' as const };
            const isProblematic = rock.status.toLowerCase().includes('off') || rock.status.toLowerCase().includes('at_risk');
            
            return (
              <Link
                key={rock.id}
                to={`/eos/rocks?rock=${rock.id}`}
                className={cn(
                  'flex items-center justify-between p-3 rounded-lg border transition-colors hover:bg-muted/50',
                  isProblematic && 'border-destructive/30 bg-destructive/5'
                )}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{rock.title}</span>
                    {rock.linkedRisksCount > 0 && (
                      <span className="flex items-center gap-1 text-xs text-amber-600">
                        <AlertTriangle className="h-3 w-3" />
                        {rock.linkedRisksCount}
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground mt-0.5">
                    {rock.ownerName} · Updated {format(new Date(rock.updatedAt), 'MMM d')}
                  </div>
                </div>
                <Badge variant={style.variant}>
                  {style.label}
                </Badge>
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
