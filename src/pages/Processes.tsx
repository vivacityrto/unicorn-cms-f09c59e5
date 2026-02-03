import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/DashboardLayout';
import { useProcesses, Process, ProcessCategory, ProcessStatus, getCategoryLabel, getStatusLabel } from '@/hooks/useProcesses';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { 
  Plus, 
  Search, 
  ChevronDown, 
  Eye, 
  Pencil, 
  Archive, 
  History, 
  MoreHorizontal,
  FileText,
  X,
  Info,
  CheckCircle2,
  ClipboardList,
  Target
} from 'lucide-react';
import { format } from 'date-fns';

const CATEGORIES: ProcessCategory[] = [
  'eos',
  'operations', 
  'compliance', 
  'client_delivery',
  'sales_marketing',
  'finance',
  'hr_people',
  'it_systems',
  'governance',
  'risk_management',
];
const STATUSES: ProcessStatus[] = ['draft', 'under_review', 'approved', 'archived'];

function ProcessGuidancePanel({ onDismiss }: { onDismiss: () => void }) {
  return (
    <Card className="bg-gradient-to-r from-primary/5 to-accent/5 border-primary/20 mb-6">
      <CardContent className="py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
            <div className="space-y-3">
              <p className="font-medium text-foreground">Getting Started with Process Documents</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div className="flex gap-2">
                  <Target className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium">1. Identify</p>
                    <p className="text-muted-foreground">Define critical business and compliance processes. Assign a Process Owner.</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <ClipboardList className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium">2. Document</p>
                    <p className="text-muted-foreground">Capture the agreed steps clearly and simply. Require review and approval.</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium">3. Apply</p>
                    <p className="text-muted-foreground">Train users and track usage. Link processes to tasks and audits.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onDismiss} className="flex-shrink-0">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function getStatusBadgeVariant(status: ProcessStatus): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case 'approved': return 'default';
    case 'under_review': return 'secondary';
    case 'archived': return 'outline';
    default: return 'secondary';
  }
}

export default function Processes() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { processes, isLoading, archiveProcess } = useProcesses();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [showGuidance, setShowGuidance] = useState(true);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [processToArchive, setProcessToArchive] = useState<Process | null>(null);

  const isSuperAdmin = profile?.unicorn_role === 'Super Admin';
  const isAdmin = profile?.unicorn_role === 'Admin';
  const isTeamLeader = profile?.unicorn_role === 'Team Leader';
  const isTeamMember = profile?.unicorn_role === 'Team Member';
  const canCreate = isSuperAdmin || isAdmin || isTeamLeader;
  const canEdit = isSuperAdmin || isAdmin;

  const filteredProcesses = useMemo(() => {
    return processes.filter((process) => {
      // Search filter
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch = !searchQuery || 
        process.title.toLowerCase().includes(searchLower) ||
        process.short_description?.toLowerCase().includes(searchLower) ||
        process.tags?.some(tag => tag.toLowerCase().includes(searchLower)) ||
        (process.owner?.first_name + ' ' + process.owner?.last_name).toLowerCase().includes(searchLower);

      // Status filter
      const matchesStatus = statusFilter === 'all' || process.status === statusFilter;

      // Category filter
      const matchesCategory = categoryFilter === 'all' || process.category === categoryFilter;

      return matchesSearch && matchesStatus && matchesCategory;
    });
  }, [processes, searchQuery, statusFilter, categoryFilter]);

  const handleArchive = (process: Process) => {
    setProcessToArchive(process);
    setArchiveDialogOpen(true);
  };

  const confirmArchive = async () => {
    if (processToArchive) {
      await archiveProcess.mutateAsync(processToArchive.id);
      setArchiveDialogOpen(false);
      setProcessToArchive(null);
    }
  };

  const getOwnerName = (process: Process) => {
    if (!process.owner) return '—';
    const { first_name, last_name } = process.owner;
    if (first_name || last_name) {
      return `${first_name || ''} ${last_name || ''}`.trim();
    }
    return process.owner.email;
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-10 w-32" />
          </div>
          <Skeleton className="h-24 w-full" />
          <div className="flex gap-4">
            <Skeleton className="h-10 w-64" />
            <Skeleton className="h-10 w-40" />
            <Skeleton className="h-10 w-40" />
          </div>
          <Skeleton className="h-96 w-full" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Process Documents</h1>
            <p className="text-muted-foreground mt-1">Manage SOPs and compliance processes</p>
          </div>
          {canCreate && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Process
                  <ChevronDown className="h-4 w-4 ml-2" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => navigate('/processes/new')}>
                  <FileText className="h-4 w-4 mr-2" />
                  Create New Process
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled>
                  <Archive className="h-4 w-4 mr-2" />
                  Import Template (Coming Soon)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Guidance Panel */}
        {showGuidance && <ProcessGuidancePanel onDismiss={() => setShowGuidance(false)} />}

        {/* Filters */}
        <div className="flex flex-wrap gap-4">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by title, description, tags, or owner..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {CATEGORIES.map((cat) => (
                <SelectItem key={cat} value={cat}>{getCategoryLabel(cat)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {STATUSES.map((status) => (
                <SelectItem key={status} value={status}>{getStatusLabel(status)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        {filteredProcesses.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">No processes found</h3>
              <p className="text-muted-foreground mb-4">
                {searchQuery || statusFilter !== 'all' || categoryFilter !== 'all'
                  ? 'Try adjusting your filters'
                  : 'Get started by creating your first process document'}
              </p>
              {canCreate && !searchQuery && statusFilter === 'all' && categoryFilter === 'all' && (
                <Button onClick={() => navigate('/processes/new')}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Process
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Process Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Reviewed</TableHead>
                  <TableHead className="text-center">Version</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProcesses.map((process) => (
                  <TableRow key={process.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{process.title}</p>
                        {process.short_description && (
                          <p className="text-sm text-muted-foreground line-clamp-1">{process.short_description}</p>
                        )}
                        {process.tags && process.tags.length > 0 && (
                          <div className="flex gap-1 mt-1">
                            {process.tags.slice(0, 3).map((tag) => (
                              <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                            ))}
                            {process.tags.length > 3 && (
                              <Badge variant="outline" className="text-xs">+{process.tags.length - 3}</Badge>
                            )}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{getCategoryLabel(process.category)}</Badge>
                    </TableCell>
                    <TableCell>{getOwnerName(process)}</TableCell>
                    <TableCell>
                      <Badge variant={getStatusBadgeVariant(process.status)}>
                        {getStatusLabel(process.status)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {process.review_date 
                        ? format(new Date(process.review_date), 'MMM d, yyyy')
                        : '—'}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline">v{process.version}</Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => navigate(`/processes/${process.id}`)}>
                            <Eye className="h-4 w-4 mr-2" />
                            View
                          </DropdownMenuItem>
                          {canEdit && process.status !== 'archived' && (
                            <DropdownMenuItem onClick={() => navigate(`/processes/${process.id}/edit`)}>
                              <Pencil className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => navigate(`/processes/${process.id}?tab=history`)}>
                            <History className="h-4 w-4 mr-2" />
                            Version History
                          </DropdownMenuItem>
                          {canEdit && process.status !== 'archived' && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem 
                                onClick={() => handleArchive(process)}
                                className="text-destructive focus:text-destructive"
                              >
                                <Archive className="h-4 w-4 mr-2" />
                                Archive
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>

      {/* Archive Confirmation Dialog */}
      <AlertDialog open={archiveDialogOpen} onOpenChange={setArchiveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive Process</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to archive "{processToArchive?.title}"? 
              This will hide it from the active process list but preserve all version history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmArchive}>Archive</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
