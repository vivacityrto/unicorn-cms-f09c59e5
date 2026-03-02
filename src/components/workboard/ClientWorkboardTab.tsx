import { useState, useEffect } from 'react';
import { useClientWorkboard, ItemStatus, WorkboardItem, WorkboardFilters, STATUS_CONFIG } from '@/hooks/useClientWorkboard';
import { supabase } from '@/integrations/supabase/client';
import { WorkboardListView } from './WorkboardListView';
import { WorkboardBoardView } from './WorkboardBoardView';
import { WorkboardItemDrawer } from './WorkboardItemDrawer';
import { AddWorkboardItemDialog } from './AddWorkboardItemDialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel } from '@/components/ui/dropdown-menu';
import { 
  Plus, Search, Filter, LayoutList, Kanban, 
  RefreshCw, AlertCircle, Clock, CheckCircle2
} from 'lucide-react';

interface ClientWorkboardTabProps {
  tenantId: number;
  clientId: number;
}

interface TeamMember {
  user_uuid: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
}

interface PackageOption {
  id: number;
  name: string;
}

interface StageOption {
  id: number;
  name: string;
}

export function ClientWorkboardTab({ tenantId, clientId }: ClientWorkboardTabProps) {
  const { 
    items, 
    loading, 
    stats, 
    filters, 
    setFilters, 
    refresh, 
    createItem, 
    updateItem, 
    updateStatus, 
    deleteItem 
  } = useClientWorkboard(tenantId, clientId);

  const [view, setView] = useState<'list' | 'board'>('list');
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<WorkboardItem | null>(null);
  
  // Options for dropdowns
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [packages, setPackages] = useState<PackageOption[]>([]);
  const [stages, setStages] = useState<StageOption[]>([]);

  useEffect(() => {
    fetchOptions();
  }, [clientId]);

  const fetchOptions = async () => {
    // Fetch team members
    const { data: users } = await supabase
      .from('users')
      .select('user_uuid, first_name, last_name, avatar_url')
      .in('unicorn_role', ['Super Admin', 'Team Leader', 'Team Member'])
      .order('first_name');
    setTeamMembers(users || []);

    // Fetch packages via package_instances (source of truth)
    const { data: instances } = await supabase
      .from('package_instances')
      .select('package_id')
      .eq('tenant_id', clientId)
      .eq('is_complete', false);
    
    if (instances && instances.length > 0) {
      const packageIds = [...new Set(instances.map(i => i.package_id))] as number[];
      const { data: packageData } = await supabase
        .from('packages')
        .select('id, name')
        .in('id', packageIds);
      setPackages((packageData || []).map(p => ({ id: p.id, name: p.name })));
    } else {
      setPackages([]);
    }

    // Fetch stages
    const { data: stageData } = await supabase
      .from('stages')
      .select('id, name')
      .order('name')
      .limit(100);
    setStages((stageData || []).map(s => ({ id: s.id, name: s.name })));
  };

  // Apply search filter
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters(prev => ({ ...prev, search: searchTerm || undefined }));
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm, setFilters]);

  const handleStatusFilter = (status: ItemStatus, checked: boolean) => {
    const currentStatuses = filters.status || [];
    let newStatuses: ItemStatus[];
    
    if (checked) {
      newStatuses = [...currentStatuses, status];
    } else {
      newStatuses = currentStatuses.filter(s => s !== status);
    }
    
    setFilters(prev => ({ 
      ...prev, 
      status: newStatuses.length > 0 ? newStatuses : undefined 
    }));
  };

  const clearFilters = () => {
    setFilters({});
    setSearchTerm('');
  };

  const hasActiveFilters = filters.status?.length || filters.assignee || filters.itemType || filters.search;

  if (loading && items.length === 0) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-8 w-48" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3, 4].map(i => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CardTitle className="flex items-center gap-2">
                <Kanban className="h-5 w-5" />
                Workboard
              </CardTitle>
              
              {/* Stats badges */}
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">
                  {stats.todo + stats.inProgress} active
                </Badge>
                {stats.overdue > 0 && (
                  <Badge variant="destructive" className="text-xs">
                    <AlertCircle className="h-3 w-3 mr-1" />
                    {stats.overdue} overdue
                  </Badge>
                )}
                {stats.waitingClient > 0 && (
                  <Badge variant="outline" className="text-xs text-amber-600">
                    <Clock className="h-3 w-3 mr-1" />
                    {stats.waitingClient} waiting
                  </Badge>
                )}
                {stats.done > 0 && (
                  <Badge variant="outline" className="text-xs text-green-600">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    {stats.done} done
                  </Badge>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* View toggle */}
              <Tabs value={view} onValueChange={(v) => setView(v as 'list' | 'board')}>
                <TabsList className="h-8">
                  <TabsTrigger value="list" className="h-6 px-2">
                    <LayoutList className="h-3.5 w-3.5" />
                  </TabsTrigger>
                  <TabsTrigger value="board" className="h-6 px-2">
                    <Kanban className="h-3.5 w-3.5" />
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              <Button variant="ghost" size="icon" onClick={refresh} className="h-8 w-8">
                <RefreshCw className="h-4 w-4" />
              </Button>

              <Button size="sm" onClick={() => setIsAddDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-1" />
                Add Item
              </Button>
            </div>
          </div>

          {/* Filter bar */}
          <div className="flex items-center gap-2 mt-4">
            {/* Search */}
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Search items..."
                className="pl-8 h-8"
              />
            </div>

            {/* Status filter */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8">
                  <Filter className="h-3.5 w-3.5 mr-1" />
                  Status
                  {filters.status?.length ? (
                    <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">
                      {filters.status.length}
                    </Badge>
                  ) : null}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>Filter by status</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                  <DropdownMenuCheckboxItem
                    key={key}
                    checked={filters.status?.includes(key as ItemStatus)}
                    onCheckedChange={(checked) => handleStatusFilter(key as ItemStatus, checked)}
                  >
                    <Badge variant="outline" className={`${config.color} text-xs`}>
                      {config.label}
                    </Badge>
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Assignee filter */}
            <Select 
              value={filters.assignee || 'all'} 
              onValueChange={v => setFilters(prev => ({ ...prev, assignee: v === 'all' ? undefined : v }))}
            >
              <SelectTrigger className="w-[140px] h-8">
                <SelectValue placeholder="Assignee" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All assignees</SelectItem>
                {teamMembers.map(m => (
                  <SelectItem key={m.user_uuid} value={m.user_uuid}>
                    {m.first_name} {m.last_name?.[0]}.
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Item type filter */}
            <Select 
              value={filters.itemType || 'all'} 
              onValueChange={v => setFilters(prev => ({ ...prev, itemType: v === 'all' ? undefined : v as 'internal' | 'client' }))}
            >
              <SelectTrigger className="w-[110px] h-8">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="internal">Internal</SelectItem>
                <SelectItem value="client">Client</SelectItem>
              </SelectContent>
            </Select>

            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 text-xs">
                Clear filters
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent>
          {items.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Kanban className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p>No action items yet</p>
              <p className="text-sm mt-1">Create your first action item to get started</p>
              <Button size="sm" className="mt-4" onClick={() => setIsAddDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-1" />
                Add First Item
              </Button>
            </div>
          ) : view === 'list' ? (
            <WorkboardListView
              items={items}
              teamMembers={teamMembers}
              onUpdateItem={updateItem}
              onDeleteItem={deleteItem}
              onOpenDetail={setSelectedItem}
            />
          ) : (
            <WorkboardBoardView
              items={items}
              onUpdateStatus={updateStatus}
              onOpenDetail={setSelectedItem}
            />
          )}
        </CardContent>
      </Card>

      {/* Add Item Dialog */}
      <AddWorkboardItemDialog
        open={isAddDialogOpen}
        onClose={() => setIsAddDialogOpen(false)}
        teamMembers={teamMembers}
        packages={packages}
        stages={stages}
        onCreateItem={createItem}
      />

      {/* Item Detail Drawer */}
      <WorkboardItemDrawer
        item={selectedItem}
        open={!!selectedItem}
        onClose={() => setSelectedItem(null)}
        tenantId={tenantId}
        teamMembers={teamMembers}
        packages={packages}
        stages={stages}
        onUpdateItem={updateItem}
        onDeleteItem={deleteItem}
      />
    </>
  );
}
