import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, formatDistanceToNow } from 'date-fns';
import { 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  ExternalLink,
  Briefcase,
  ChevronRight
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue 
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useMyWork, MyWorkItem } from '@/hooks/useMyWork';
import { cn } from '@/lib/utils';

const priorityColors: Record<string, string> = {
  urgent: 'bg-red-500/10 text-red-600 border-red-600',
  high: 'bg-orange-500/10 text-orange-600 border-orange-600',
  normal: 'bg-blue-500/10 text-blue-600 border-blue-600',
  low: 'bg-gray-500/10 text-gray-600 border-gray-600'
};

const statusOptions = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'done', label: 'Done' }
];

function ActionItemRow({ 
  item, 
  onStatusChange 
}: { 
  item: MyWorkItem; 
  onStatusChange: (id: string, status: string, clientId: string, tenantId: number) => void;
}) {
  const navigate = useNavigate();

  const getDueDateDisplay = () => {
    if (!item.due_date) return null;
    const date = new Date(item.due_date);
    const isOverdue = item.is_overdue;
    const isToday = new Date().toDateString() === date.toDateString();
    
    return (
      <span className={cn(
        "text-xs",
        isOverdue && "text-red-600 font-medium",
        isToday && !isOverdue && "text-orange-600 font-medium",
        !isOverdue && !isToday && "text-muted-foreground"
      )}>
        {isOverdue ? (
          <>Overdue {formatDistanceToNow(date, { addSuffix: false })}</>
        ) : isToday ? (
          'Due today'
        ) : (
          format(date, 'MMM d')
        )}
      </span>
    );
  };

  return (
    <div className={cn(
      "flex items-center gap-3 p-3 rounded-lg border transition-colors hover:bg-muted/50",
      item.is_overdue && "border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20"
    )}>
      {/* Quick done button */}
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0"
        onClick={() => onStatusChange(item.action_item_id, 'done', item.client_id, item.tenant_id)}
      >
        <CheckCircle2 className="h-4 w-4 text-muted-foreground hover:text-green-600" />
      </Button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm truncate">{item.title}</span>
          <Badge 
            variant="outline" 
            className={cn("text-[10px] px-1.5 py-0", priorityColors[item.priority])}
          >
            {item.priority}
          </Badge>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <button
            onClick={() => navigate(`/tenant/${item.tenant_id}`)}
            className="text-xs text-primary hover:underline truncate max-w-[150px]"
          >
            {item.client_name}
          </button>
          {getDueDateDisplay()}
        </div>
      </div>

      {/* Status dropdown */}
      <Select
        value={item.status}
        onValueChange={(value) => onStatusChange(item.action_item_id, value, item.client_id, item.tenant_id)}
      >
        <SelectTrigger className="h-7 w-[100px] text-xs">
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

      {/* Jump to client */}
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0"
        onClick={() => navigate(`/tenant/${item.tenant_id}?tab=actions`)}
      >
        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
      </Button>
    </div>
  );
}

export function MyWorkWidget() {
  const navigate = useNavigate();
  const { overdueItems, dueSoonItems, allOpenItems, loading, setStatus } = useMyWork();
  const [activeTab, setActiveTab] = useState('overdue');

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-24" />
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </CardContent>
      </Card>
    );
  }

  const getItems = () => {
    switch (activeTab) {
      case 'overdue': return overdueItems;
      case 'due_soon': return dueSoonItems;
      case 'all': return allOpenItems;
      default: return [];
    }
  };

  const currentItems = getItems();

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">My Work</CardTitle>
            {overdueItems.length > 0 && (
              <Badge variant="destructive" className="text-[10px] px-1.5">
                {overdueItems.length} overdue
              </Badge>
            )}
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            className="text-xs gap-1"
            onClick={() => navigate('/my-work')}
          >
            View all
            <ChevronRight className="h-3 w-3" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full h-8 mb-3">
            <TabsTrigger value="overdue" className="flex-1 text-xs gap-1">
              <AlertTriangle className="h-3 w-3" />
              Overdue ({overdueItems.length})
            </TabsTrigger>
            <TabsTrigger value="due_soon" className="flex-1 text-xs gap-1">
              <Clock className="h-3 w-3" />
              Due Soon ({dueSoonItems.length})
            </TabsTrigger>
            <TabsTrigger value="all" className="flex-1 text-xs">
              All Open ({allOpenItems.length})
            </TabsTrigger>
          </TabsList>

          <div className="space-y-2 max-h-[320px] overflow-y-auto">
            {currentItems.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Briefcase className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No action items assigned to you.</p>
              </div>
            ) : (
              currentItems.slice(0, 5).map(item => (
                <ActionItemRow 
                  key={item.action_item_id} 
                  item={item} 
                  onStatusChange={setStatus}
                />
              ))
            )}
            {currentItems.length > 5 && (
              <Button 
                variant="ghost" 
                className="w-full text-xs" 
                onClick={() => navigate('/my-work')}
              >
                View {currentItems.length - 5} more items
              </Button>
            )}
          </div>
        </Tabs>
      </CardContent>
    </Card>
  );
}
