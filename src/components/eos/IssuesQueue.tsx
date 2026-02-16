import { useState, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { AlertCircle, GripVertical, Plus } from 'lucide-react';
import { ClientBadge } from './ClientBadge';
import { useOwnerProfiles } from '@/hooks/useOwnerProfiles';
import { formatDistanceToNow } from 'date-fns';
import type { EosIssue } from '@/types/eos';

interface IssuesQueueProps {
  issues: EosIssue[];
  onSelectIssue: (issue: EosIssue) => void;
  onCreateIssue: () => void;
  isFacilitator: boolean;
  currentMeetingId?: string;
}

export function IssuesQueue({ issues, onSelectIssue, onCreateIssue, isFacilitator, currentMeetingId }: IssuesQueueProps) {
  const [filter, setFilter] = useState<'all' | string>('all');

  // Batch-resolve raiser UUIDs for display
  const raiserUuids = useMemo(
    () => (issues ?? []).map(i => i.raised_by || i.created_by || ''),
    [issues]
  );
  const { data: raiserProfiles } = useOwnerProfiles(raiserUuids);

  // Priority is stored as integer: 3=High, 2=Medium, 1=Low
  // Also supports legacy string values: 'high', 'medium', 'low'
  const getPriorityColor = (priority?: number | string) => {
    if (priority === undefined) return 'bg-muted text-muted-foreground border-border';
    // Handle both number and string priority values
    const priorityNum = typeof priority === 'string' 
      ? (priority === 'high' ? 3 : priority === 'medium' ? 2 : 1)
      : priority;
    if (priorityNum >= 3) return 'bg-red-100 text-red-800 border-red-200';
    if (priorityNum >= 2) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    return 'bg-blue-100 text-blue-800 border-blue-200';
  };

  const getPriorityLabel = (priority?: number | string) => {
    if (priority === undefined) return '';
    if (typeof priority === 'string') return priority.charAt(0).toUpperCase() + priority.slice(1);
    if (priority >= 3) return 'High';
    if (priority >= 2) return 'Medium';
    return 'Low';
  };

  const filteredIssues = issues?.filter(issue => 
    filter === 'all' || issue.client_id === filter
  ) || [];

  const uniqueClients = Array.from(new Set(issues?.map(i => i.client_id).filter(Boolean)));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2">
          <AlertCircle className="h-5 w-5" />
          Issues Queue ({filteredIssues.length})
        </h3>
        <Button size="sm" onClick={onCreateIssue}>
          <Plus className="h-4 w-4 mr-1" />
          Add
        </Button>
      </div>

      {/* Filter by client */}
      {uniqueClients.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          <Badge
            variant={filter === 'all' ? 'default' : 'outline'}
            className="cursor-pointer"
            onClick={() => setFilter('all')}
          >
            All
          </Badge>
          {uniqueClients.map((clientId) => (
            <Badge
              key={clientId}
              variant={filter === clientId ? 'default' : 'outline'}
              className="cursor-pointer"
              onClick={() => setFilter(clientId!)}
            >
              Client {clientId?.slice(0, 8)}
            </Badge>
          ))}
        </div>
      )}

      {/* Issues list */}
      <div className="space-y-2 max-h-[500px] overflow-y-auto">
        {filteredIssues.map((issue) => (
          <Card
            key={issue.id}
            className="p-3 hover:shadow-md transition-shadow cursor-pointer"
            onClick={() => onSelectIssue(issue)}
          >
            <div className="flex items-start gap-3">
              {isFacilitator && (
                <GripVertical className="h-5 w-5 text-muted-foreground flex-shrink-0 cursor-grab" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <p className="font-medium text-sm">{issue.title}</p>
                  {issue.priority !== undefined && (
                    <Badge className={`text-xs ${getPriorityColor(issue.priority)}`}>
                      {getPriorityLabel(issue.priority)}
                    </Badge>
                  )}
                  {/* Source indicator */}
                  {currentMeetingId && (
                    issue.meeting_id === currentMeetingId ? (
                      <Badge variant="outline" className="text-xs">This Meeting</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs bg-amber-50 text-amber-700 border-amber-200">Backlog</Badge>
                    )
                  )}
                  <ClientBadge clientId={issue.client_id} />
                </div>
                {/* Raiser + timestamp row */}
                {(() => {
                  const raiserId = issue.raised_by || issue.created_by;
                  const profile = raiserId ? raiserProfiles?.[raiserId] : null;
                  const name = profile?.first_name || 'Unknown';
                  const initials = name.charAt(0).toUpperCase();
                  return (
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Avatar className="h-4 w-4 text-[8px]">
                        <AvatarFallback className="text-[8px]">{initials}</AvatarFallback>
                      </Avatar>
                      <span className="text-xs text-muted-foreground">
                        Raised by {name}
                        {issue.created_at && (
                          <> · {formatDistanceToNow(new Date(issue.created_at), { addSuffix: true })}</>
                        )}
                      </span>
                    </div>
                  );
                })()}
                {issue.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {issue.description}
                  </p>
                )}
              </div>
              <Badge variant="secondary" className="text-xs">
                {issue.status}
              </Badge>
            </div>
          </Card>
        ))}

        {filteredIssues.length === 0 && (
          <Card className="p-6 text-center">
            <AlertCircle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              No issues in queue
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
