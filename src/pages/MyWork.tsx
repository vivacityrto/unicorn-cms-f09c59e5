import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, formatDistanceToNow } from 'date-fns';
import { 
  CheckCircle2, 
  Briefcase,
  ExternalLink,
  RefreshCw,
  Filter,
  AlertTriangle,
  Clock,
  Plus
} from 'lucide-react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue 
} from '@/components/ui/select';
import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow 
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { useMyWork, MyWorkItem } from '@/hooks/useMyWork';
import { CreateActionDialog } from '@/components/client/CreateActionDialog';
import { cn } from '@/lib/utils';

const priorityColors: Record<string, string> = {
  urgent: 'bg-red-500/10 text-red-600 border-red-600',
  high: 'bg-orange-500/10 text-orange-600 border-orange-600',
  normal: 'bg-blue-500/10 text-blue-600 border-blue-600',
  low: 'bg-gray-500/10 text-gray-600 border-gray-600'
};

const statusColors: Record<string, string> = {
  open: 'bg-yellow-500/10 text-yellow-600 border-yellow-600',
  in_progress: 'bg-blue-500/10 text-blue-600 border-blue-600',
  blocked: 'bg-red-500/10 text-red-600 border-red-600',
  done: 'bg-green-500/10 text-green-600 border-green-600',
  cancelled: 'bg-gray-500/10 text-gray-600 border-gray-600'
};

const statusOptions = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'done', label: 'Done' }
];

export default function MyWork() {
  const navigate = useNavigate();
  const { items, overdueItems, dueSoonItems, allOpenItems, loading, refresh, setStatus } = useMyWork();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');

  const filteredItems = allOpenItems.filter(item => {
    if (statusFilter !== 'all' && item.status !== statusFilter) return false;
    if (priorityFilter !== 'all' && item.priority !== priorityFilter) return false;
    return true;
  });

  const getDueDateDisplay = (item: MyWorkItem) => {
    if (!item.due_date) return <span className="text-muted-foreground text-xs">No due date</span>;
    const date = new Date(item.due_date);
    const isOverdue = item.is_overdue;
    const isToday = new Date().toDateString() === date.toDateString();
    
    return (
      <div className={cn(
        "flex items-center gap-1 text-xs",
        isOverdue && "text-red-600 font-medium",
        isToday && !isOverdue && "text-orange-600 font-medium",
        !isOverdue && !isToday && "text-muted-foreground"
      )}>
        {isOverdue && <AlertTriangle className="h-3 w-3" />}
        {isToday && !isOverdue && <Clock className="h-3 w-3" />}
        {isOverdue ? (
          <>Overdue {formatDistanceToNow(date, { addSuffix: false })}</>
        ) : isToday ? (
          'Due today'
        ) : (
          format(date, 'MMM d, yyyy')
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="p-6 space-y-6">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-background">
        {/* Header */}
        <div className="border-b bg-card">
          <div className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center">
                  <Briefcase className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold">My Work</h1>
                  <p className="text-sm text-muted-foreground">
                    Your action items across all clients
                  </p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => refresh()} className="gap-1.5">
                <RefreshCw className="h-3.5 w-3.5" />
                Refresh
              </Button>
            </div>
          </div>
        </div>

      <div className="p-6 space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className={cn(overdueItems.length > 0 && "border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20")}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <AlertTriangle className={cn("h-4 w-4", overdueItems.length > 0 ? "text-red-600" : "text-muted-foreground")} />
                Overdue
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={cn("text-3xl font-bold", overdueItems.length > 0 && "text-red-600")}>
                {overdueItems.length}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Clock className="h-4 w-4 text-orange-600" />
                Due This Week
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{dueSoonItems.length}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-primary" />
                Total Open
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{allOpenItems.length}</div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="blocked">Blocked</SelectItem>
            </SelectContent>
          </Select>

          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priorities</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>

          {(statusFilter !== 'all' || priorityFilter !== 'all') && (
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => { setStatusFilter('all'); setPriorityFilter('all'); }}
            >
              Clear filters
            </Button>
          )}
        </div>

        {/* Table */}
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]"></TableHead>
                <TableHead>Task</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[80px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12">
                    <Briefcase className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
                    <p className="text-muted-foreground">No action items assigned to you.</p>
                  </TableCell>
                </TableRow>
              ) : (
                filteredItems.map(item => (
                  <TableRow 
                    key={item.action_item_id}
                    className={cn(item.is_overdue && "bg-red-50/50 dark:bg-red-950/10")}
                  >
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setStatus(item.action_item_id, 'done', item.client_id, item.tenant_id)}
                      >
                        <CheckCircle2 className="h-4 w-4 text-muted-foreground hover:text-green-600" />
                      </Button>
                    </TableCell>
                    <TableCell>
                      <div>
                        <span className="font-medium">{item.title}</span>
                        {item.description && (
                          <p className="text-xs text-muted-foreground truncate max-w-[300px]">
                            {item.description}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <button
                        onClick={() => navigate(`/tenant/${item.tenant_id}`)}
                        className="text-sm text-primary hover:underline"
                      >
                        {item.client_name}
                      </button>
                    </TableCell>
                    <TableCell>{getDueDateDisplay(item)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("text-xs", priorityColors[item.priority])}>
                        {item.priority}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={item.status}
                        onValueChange={(value) => setStatus(item.action_item_id, value, item.client_id, item.tenant_id)}
                      >
                        <SelectTrigger className="h-7 w-[110px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {statusOptions.map(opt => (
                            <SelectItem key={opt.value} value={opt.value} className="text-xs">
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => navigate(`/tenant/${item.tenant_id}?tab=actions`)}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      </div>
    </div>
    </DashboardLayout>
  );
}
