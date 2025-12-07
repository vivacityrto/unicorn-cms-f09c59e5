import { useEosIssues } from '@/hooks/useEos';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { TableSkeleton } from '@/components/ui/loading-skeleton';
import { ClientBadge } from '../ClientBadge';
import { format } from 'date-fns';

export function ClientIssuesList() {
  const { issues, isLoading } = useEosIssues();

  if (isLoading) {
    return <TableSkeleton rows={3} />;
  }

  if (!issues || issues.length === 0) {
    return (
      <EmptyState
        icon={AlertCircle}
        title="No issues tracked yet"
        description="Your team will identify and track issues here using the IDS process"
      />
    );
  }

  const getStatusConfig = (status: string) => {
    const configs: Record<string, { icon: any; variant: any; label: string }> = {
      open: { icon: AlertCircle, variant: 'default', label: 'Open' },
      discussing: { icon: AlertCircle, variant: 'secondary', label: 'Discussing' },
      solved: { icon: CheckCircle2, variant: 'default', label: 'Solved' },
      archived: { icon: CheckCircle2, variant: 'outline', label: 'Archived' },
    };
    return configs[status?.toLowerCase() || 'open'] || configs.open;
  };

  return (
    <div className="grid gap-4">
      {issues.map((issue) => {
        const statusConfig = getStatusConfig(issue.status);
        const StatusIcon = statusConfig.icon;
        
        return (
          <Card key={issue.id} className="hover:shadow-card-hover transition-shadow">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3 flex-1">
                  <div className="p-2 rounded-lg bg-muted">
                    <StatusIcon className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <CardTitle className="text-lg flex items-center gap-2 flex-wrap">
                      {issue.title}
                      <ClientBadge clientId={issue.client_id} />
                    </CardTitle>
                    {issue.description && (
                      <p className="text-sm text-muted-foreground mt-2">
                        {issue.description}
                      </p>
                    )}
                  </div>
                </div>
                <Badge variant={statusConfig.variant}>
                  {statusConfig.label}
                </Badge>
              </div>
            </CardHeader>
            {issue.solution && (
              <CardContent>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Solution:</p>
                  <p className="text-sm text-muted-foreground">{issue.solution}</p>
                  {issue.solved_at && (
                    <p className="text-xs text-muted-foreground">
                      Solved on {format(new Date(issue.solved_at), 'MMM d, yyyy')}
                    </p>
                  )}
                </div>
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}
