import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertCircle, GripVertical, Plus } from 'lucide-react';
import { ClientBadge } from './ClientBadge';
import type { EosIssue } from '@/types/eos';

interface IssuesQueueProps {
  issues: EosIssue[];
  onSelectIssue: (issue: EosIssue) => void;
  onCreateIssue: () => void;
  isFacilitator: boolean;
}

export function IssuesQueue({ issues, onSelectIssue, onCreateIssue, isFacilitator }: IssuesQueueProps) {
  const [filter, setFilter] = useState<'all' | string>('all');

  const getPriorityColor = (priority?: number | string) => {
    const priorityStr = typeof priority === 'number' 
      ? (priority >= 8 ? 'high' : priority >= 5 ? 'medium' : 'low')
      : priority;
    
    switch (priorityStr) {
      case 'high': return 'bg-red-100 text-red-800 border-red-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low': return 'bg-blue-100 text-blue-800 border-blue-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
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
                  {issue.priority && (
                    <Badge className={`text-xs ${getPriorityColor(issue.priority)}`}>
                      {issue.priority}
                    </Badge>
                  )}
                  <ClientBadge clientId={issue.client_id} />
                </div>
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
