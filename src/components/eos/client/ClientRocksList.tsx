import { useEosRocks } from '@/hooks/useEos';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Target } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { TableSkeleton } from '@/components/ui/loading-skeleton';
import { Progress } from '@/components/ui/progress';
import { ClientBadge } from '../ClientBadge';

export function ClientRocksList() {
  const { rocks, isLoading } = useEosRocks();

  if (isLoading) {
    return <TableSkeleton rows={3} />;
  }

  if (!rocks || rocks.length === 0) {
    return (
      <EmptyState
        icon={Target}
        title="No rocks assigned yet"
        description="Your company hasn't assigned any quarterly goals to you yet"
      />
    );
  }

  return (
    <div className="grid gap-4">
      {rocks.map((rock) => (
        <Card key={rock.id} className="hover:shadow-card-hover transition-shadow">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <CardTitle className="text-lg flex items-center gap-2">
                  {rock.title}
                  <ClientBadge clientId={rock.client_id} />
                </CardTitle>
                {rock.description && (
                  <p className="text-sm text-muted-foreground mt-2">
                    {rock.description}
                  </p>
                )}
              </div>
              <Badge variant={rock.status === 'complete' ? 'default' : 'secondary'}>
                {rock.status || 'In Progress'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Progress</span>
              <span className="font-medium">{rock.progress || 0}%</span>
            </div>
            <Progress value={rock.progress || 0} className="h-2" />
            {rock.due_date && (
              <p className="text-xs text-muted-foreground">
                Due: {new Date(rock.due_date).toLocaleDateString()}
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
