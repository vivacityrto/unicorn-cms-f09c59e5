import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, AlertCircle, Circle, CheckCircle2, Archive } from 'lucide-react';
import { useEosIssues } from '@/hooks/useEos';
import { format } from 'date-fns';
import { DashboardLayout } from '@/components/DashboardLayout';

export default function EosIssues() {
  return (
    <DashboardLayout>
      <IssuesContent />
    </DashboardLayout>
  );
}

function IssuesContent() {
  const { issues, isLoading } = useEosIssues();
  const [filter, setFilter] = useState<'all' | string>('all');

  // Use exact enum values as keys - no transformation
  const getStatusConfig = (status: string) => {
    const configs: Record<string, { icon: any; color: string; bg: string; label: string }> = {
      'Open': { icon: Circle, color: 'text-blue-600', bg: 'bg-blue-50', label: 'Open' },
      'Discussing': { icon: AlertCircle, color: 'text-yellow-600', bg: 'bg-yellow-50', label: 'Discussing' },
      'In Review': { icon: AlertCircle, color: 'text-purple-600', bg: 'bg-purple-50', label: 'In Review' },
      'Actioning': { icon: AlertCircle, color: 'text-orange-600', bg: 'bg-orange-50', label: 'Actioning' },
      'Solved': { icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50', label: 'Solved' },
      'Archived': { icon: Archive, color: 'text-gray-600', bg: 'bg-gray-50', label: 'Archived' },
      'Escalated': { icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-50', label: 'Escalated' },
      'Closed': { icon: CheckCircle2, color: 'text-gray-600', bg: 'bg-gray-50', label: 'Closed' },
    };
    return configs[status] || configs['Open'];
  };

  const getPriorityBadge = (priority: number | string) => {
    const priorityNum = typeof priority === 'string'
      ? (priority === 'high' ? 8 : priority === 'medium' ? 5 : 3)
      : priority;
    
    if (priorityNum >= 8) return <Badge variant="destructive">High</Badge>;
    if (priorityNum >= 5) return <Badge variant="default">Medium</Badge>;
    return <Badge variant="secondary">Low</Badge>;
  };

  const filteredIssues = issues?.filter(issue => 
    filter === 'all' ? true : issue.status === filter
  );

  // Use exact enum values for filtering - no transformation
  const stats = {
    total: issues?.length || 0,
    open: issues?.filter(i => i.status === 'Open').length || 0,
    discussing: issues?.filter(i => i.status === 'Discussing').length || 0,
    solved: issues?.filter(i => i.status === 'Solved').length || 0,
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading issues...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <AlertCircle className="w-8 h-8" />
            Issues List
          </h1>
          <p className="text-muted-foreground mt-2">
            Identify, Discuss, Solve (IDS) - Keep track of all organizational issues
          </p>
        </div>
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          Add Issue
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setFilter('all')}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Issues</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <AlertCircle className="w-8 h-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setFilter('open')}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Open</p>
                <p className="text-2xl font-bold text-blue-600">{stats.open}</p>
              </div>
              <Circle className="w-8 h-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setFilter('discussing')}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Discussing</p>
                <p className="text-2xl font-bold text-yellow-600">{stats.discussing}</p>
              </div>
              <AlertCircle className="w-8 h-8 text-yellow-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setFilter('solved')}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Solved</p>
                <p className="text-2xl font-bold text-green-600">{stats.solved}</p>
              </div>
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Active Filter */}
      {filter !== 'all' && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Filtered by:</span>
          <Badge variant="outline" className="gap-1">
            {filter}
            <button onClick={() => setFilter('all')} className="ml-1 hover:text-destructive">
              ×
            </button>
          </Badge>
        </div>
      )}

      {/* Issues List */}
      <div className="grid gap-4">
        {filteredIssues && filteredIssues.length > 0 ? (
          filteredIssues.map((issue) => {
            const statusConfig = getStatusConfig(issue.status);
            const StatusIcon = statusConfig.icon;
            
            return (
              <Card key={issue.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1 flex items-start gap-3">
                      <div className={`${statusConfig.bg} p-2 rounded-lg`}>
                        <StatusIcon className={`w-5 h-5 ${statusConfig.color}`} />
                      </div>
                      <div className="flex-1">
                        <CardTitle className="text-lg mb-2">{issue.title}</CardTitle>
                        {issue.description && (
                          <p className="text-sm text-muted-foreground">{issue.description}</p>
                        )}
                        <div className="flex items-center gap-3 mt-3 text-sm text-muted-foreground">
                          <span>Created {format(new Date(issue.created_at), 'MMM d, yyyy')}</span>
                          {issue.resolved_at && (
                            <>
                              <span>•</span>
                              <span>Solved {format(new Date(issue.resolved_at), 'MMM d, yyyy')}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 items-end">
                      <Badge variant="outline">{statusConfig.label}</Badge>
                      {getPriorityBadge(issue.priority)}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm">Edit</Button>
                    <Button variant="ghost" size="sm">View Details</Button>
                    {issue.status === 'open' && (
                      <Button size="sm">Mark as Discussing</Button>
                    )}
                    {issue.status === 'discussing' && (
                      <Button size="sm">Mark as Solved</Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })
        ) : (
          <Card>
            <CardContent className="p-12 text-center">
              <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No issues yet</h3>
              <p className="text-muted-foreground mb-4">
                Start by identifying organizational issues to discuss and solve
              </p>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Create Your First Issue
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
