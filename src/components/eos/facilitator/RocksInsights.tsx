import { AlertTriangle, TrendingDown, User, Clock, Lightbulb } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useFacilitatorMode } from '@/contexts/FacilitatorModeContext';
import { differenceInDays, isPast } from 'date-fns';

interface Rock {
  id: string;
  title: string;
  status: string;
  due_date: string;
  owner_user_id?: string | null;
  quarter_number: number;
  quarter_year: number;
}

interface RocksInsightsProps {
  rocks: Rock[];
}

interface RockInsight {
  rock: Rock;
  type: 'overdue' | 'no_owner' | 'off_track' | 'repeated_off_track';
  message: string;
}

/**
 * Facilitator-only insights panel for Rocks.
 * Highlights:
 * - Overdue rocks
 * - Rocks with no owner
 * - Rocks repeatedly off-track
 */
export function RocksInsights({ rocks }: RocksInsightsProps) {
  const { isFacilitatorMode } = useFacilitatorMode();

  if (!isFacilitatorMode || !rocks?.length) {
    return null;
  }

  const insights: RockInsight[] = [];

  rocks.forEach((rock) => {
    // Check for overdue
    if (rock.due_date && isPast(new Date(rock.due_date)) && rock.status?.toLowerCase() !== 'complete') {
      const daysOverdue = differenceInDays(new Date(), new Date(rock.due_date));
      insights.push({
        rock,
        type: 'overdue',
        message: `Overdue by ${daysOverdue} day${daysOverdue !== 1 ? 's' : ''}`,
      });
    }

    // Check for no owner
    if (!rock.owner_user_id) {
      insights.push({
        rock,
        type: 'no_owner',
        message: 'No owner assigned',
      });
    }

    // Check for off-track status
    const statusLower = rock.status?.toLowerCase() || '';
    if (statusLower === 'off_track' || statusLower === 'off-track') {
      insights.push({
        rock,
        type: 'off_track',
        message: 'Currently off-track - may need escalation',
      });
    }
  });

  if (insights.length === 0) {
    return null;
  }

  const getIcon = (type: RockInsight['type']) => {
    switch (type) {
      case 'overdue':
        return <Clock className="h-4 w-4 text-amber-500" />;
      case 'no_owner':
        return <User className="h-4 w-4 text-blue-500" />;
      case 'off_track':
      case 'repeated_off_track':
        return <TrendingDown className="h-4 w-4 text-red-500" />;
    }
  };

  const getBadgeVariant = (type: RockInsight['type']): "default" | "secondary" | "destructive" | "outline" => {
    switch (type) {
      case 'overdue':
        return 'secondary';
      case 'no_owner':
        return 'outline';
      case 'off_track':
      case 'repeated_off_track':
        return 'destructive';
    }
  };

  return (
    <Card className="border-amber-200/50 bg-amber-50/30 dark:bg-amber-950/10 dark:border-amber-800/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-amber-600" />
          Facilitator Insights
          <Badge variant="secondary" className="text-xs">{insights.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {insights.slice(0, 5).map((insight, idx) => (
          <div
            key={`${insight.rock.id}-${insight.type}-${idx}`}
            className="flex items-start gap-3 p-2 rounded-md bg-background/50 border border-border/50"
          >
            {getIcon(insight.type)}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{insight.rock.title}</p>
              <p className="text-xs text-muted-foreground">{insight.message}</p>
            </div>
            <Badge variant={getBadgeVariant(insight.type)} className="text-xs flex-shrink-0">
              {insight.type.replace('_', ' ')}
            </Badge>
          </div>
        ))}
        {insights.length > 5 && (
          <p className="text-xs text-muted-foreground text-center">
            +{insights.length - 5} more items need attention
          </p>
        )}
      </CardContent>
    </Card>
  );
}
