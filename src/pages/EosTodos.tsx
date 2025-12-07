import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, ListTodo, Clock, CheckCircle, XCircle } from 'lucide-react';
import { useEosTodos } from '@/hooks/useEos';
import { format } from 'date-fns';
import { DashboardLayout } from '@/components/DashboardLayout';

export default function EosTodos() {
  return (
    <DashboardLayout>
      <TodosContent />
    </DashboardLayout>
  );
}

function TodosContent() {
  const { todos, isLoading, updateTodo } = useEosTodos();
  const [filter, setFilter] = useState<'all' | string>('all');

  const handleToggleComplete = (id: string, currentStatus: string) => {
    const newStatus = currentStatus?.toLowerCase() === 'complete' ? 'Open' : 'Complete';
    updateTodo.mutate({ 
      id, 
      status: newStatus,
      completed_at: newStatus === 'Complete' ? new Date().toISOString() : ''
    });
  };

  const getStatusBadge = (status: string) => {
    const statusLower = status?.toLowerCase() || 'open';
    const configs: Record<string, { variant: any; label: string; icon: any }> = {
      open: { variant: 'outline' as const, label: 'Pending', icon: Clock },
      pending: { variant: 'outline' as const, label: 'Pending', icon: Clock },
      in_progress: { variant: 'default' as const, label: 'In Progress', icon: Clock },
      complete: { variant: 'secondary' as const, label: 'Complete', icon: CheckCircle },
      cancelled: { variant: 'destructive' as const, label: 'Cancelled', icon: XCircle },
    };
    
    const config = configs[statusLower] || configs.open;
    const Icon = config.icon;
    
    return (
      <Badge variant={config.variant} className="gap-1">
        <Icon className="w-3 h-3" />
        {config.label}
      </Badge>
    );
  };

  const filteredTodos = todos?.filter(todo => 
    filter === 'all' ? true : todo.status === filter
  );

  const stats = {
    total: todos?.length || 0,
    pending: todos?.filter(t => t.status?.toLowerCase() === 'open' || t.status?.toLowerCase() === 'pending').length || 0,
    in_progress: todos?.filter(t => t.status?.toLowerCase() === 'in_progress').length || 0,
    complete: todos?.filter(t => t.status?.toLowerCase() === 'complete').length || 0,
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading to-dos...</p>
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
            <ListTodo className="w-8 h-8" />
            To-Do List
          </h1>
          <p className="text-muted-foreground mt-2">
            Track action items and deliverables from meetings and issues
          </p>
        </div>
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          Add To-Do
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setFilter('all')}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total To-Dos</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <ListTodo className="w-8 h-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setFilter('pending')}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Pending</p>
                <p className="text-2xl font-bold text-yellow-600">{stats.pending}</p>
              </div>
              <Clock className="w-8 h-8 text-yellow-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setFilter('in_progress')}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">In Progress</p>
                <p className="text-2xl font-bold text-blue-600">{stats.in_progress}</p>
              </div>
              <Clock className="w-8 h-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setFilter('complete')}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Complete</p>
                <p className="text-2xl font-bold text-green-600">{stats.complete}</p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Active Filter */}
      {filter !== 'all' && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Filtered by:</span>
          <Badge variant="outline" className="gap-1">
            {filter.replace('_', ' ')}
            <button onClick={() => setFilter('all')} className="ml-1 hover:text-destructive">
              ×
            </button>
          </Badge>
        </div>
      )}

      {/* To-Dos List */}
      <div className="grid gap-3">
        {filteredTodos && filteredTodos.length > 0 ? (
          filteredTodos.map((todo) => (
            <Card 
              key={todo.id} 
              className={`hover:shadow-md transition-shadow ${
                todo.status === 'complete' ? 'opacity-60' : ''
              }`}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  <Checkbox
                    checked={todo.status?.toLowerCase() === 'complete'}
                    onCheckedChange={() => handleToggleComplete(todo.id, todo.status || 'Open')}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="flex items-start justify-between mb-2">
                      <h3 className={`font-semibold ${
                        todo.status?.toLowerCase() === 'complete' ? 'line-through text-muted-foreground' : ''
                      }`}>
                        {todo.title}
                      </h3>
                      {getStatusBadge(todo.status || 'Open')}
                    </div>
                    
                    {todo.description && (
                      <p className="text-sm text-muted-foreground mb-3">{todo.description}</p>
                    )}
                    
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>Created {format(new Date(todo.created_at), 'MMM d, yyyy')}</span>
                      {todo.due_date && (
                        <>
                          <span>•</span>
                          <span className={
                            new Date(todo.due_date) < new Date() && todo.status?.toLowerCase() !== 'complete'
                              ? 'text-red-600 font-medium'
                              : ''
                          }>
                            Due {format(new Date(todo.due_date), 'MMM d, yyyy')}
                          </span>
                        </>
                      )}
                      {todo.completed_date && (
                        <>
                          <span>•</span>
                          <span>Completed {format(new Date(todo.completed_date), 'MMM d, yyyy')}</span>
                        </>
                      )}
                    </div>

                    <div className="flex gap-2 mt-3">
                      <Button variant="outline" size="sm">Edit</Button>
                      {todo.status?.toLowerCase() === 'open' && (
                        <Button size="sm" variant="secondary">Start</Button>
                      )}
                      {todo.status?.toLowerCase() !== 'complete' && todo.status?.toLowerCase() !== 'cancelled' && (
                        <Button size="sm" variant="ghost">Cancel</Button>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <Card>
            <CardContent className="p-12 text-center">
              <ListTodo className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No to-dos yet</h3>
              <p className="text-muted-foreground mb-4">
                Create action items to track deliverables and commitments
              </p>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Create Your First To-Do
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
