import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, usePackageBuilder, PackageStage } from '@/hooks/usePackageBuilder';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { 
  Search, Plus, MoreHorizontal, Edit, Copy, Archive, Trash2, 
  Layers, Clock, Package as PackageIcon, CheckCircle2, XCircle,
  Building2, GraduationCap, Users, Briefcase
} from 'lucide-react';
import { CreatePackageDialog } from './CreatePackageDialog';
import { computePackageReadiness, PackageReadinessBadge, ReadinessResult } from './PackageReadinessIndicator';

const PACKAGE_TYPE_ICONS: Record<string, React.ReactNode> = {
  'project': <Briefcase className="h-4 w-4" />,
  'membership': <Users className="h-4 w-4" />,
  'regulatory_submission': <Building2 className="h-4 w-4" />,
  'training': <GraduationCap className="h-4 w-4" />
};

const PACKAGE_TYPE_LABELS: Record<string, string> = {
  'project': 'Project',
  'membership': 'Membership',
  'regulatory_submission': 'Regulatory',
  'training': 'Training'
};

export function PackageBuilderOverview() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { packages, loading, duplicatePackage, archivePackage, deletePackage } = usePackageBuilder();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [packageToDelete, setPackageToDelete] = useState<Package | null>(null);
  const [packageStagesMap, setPackageStagesMap] = useState<Map<number, PackageStage[]>>(new Map());

  const [stageDocumentCounts, setStageDocumentCounts] = useState<Map<number, number>>(new Map());

  // Fetch stages for all packages to compute readiness
  useEffect(() => {
    const fetchAllPackageStages = async () => {
      if (packages.length === 0) return;
      
      const { data, error } = await supabase
        .from('package_stages' as any)
        .select(`
          id,
          package_id,
          stage_id,
          sort_order,
          is_required,
          dashboard_group,
          stage:stages(id, name, shortname)
        `)
        .in('package_id', packages.map(p => p.id)) as any;

      if (!error && data) {
        const map = new Map<number, PackageStage[]>();
        const stageIds = new Set<number>();
        
        (data as any[]).forEach((ps: any) => {
          const existing = map.get(ps.package_id) || [];
          existing.push(ps);
          map.set(ps.package_id, existing);
          if (ps.stage_id) stageIds.add(ps.stage_id);
        });
        setPackageStagesMap(map);
        
        // Fetch document counts for stages
        if (stageIds.size > 0) {
          const { data: docData } = await supabase
            .from('stage_documents' as any)
            .select('stage_id')
            .in('stage_id', Array.from(stageIds)) as any;
          
          if (docData) {
            const docCounts = new Map<number, number>();
            (docData as any[]).forEach((d: any) => {
              docCounts.set(d.stage_id, (docCounts.get(d.stage_id) || 0) + 1);
            });
            setStageDocumentCounts(docCounts);
          }
        }
      }
    };

    fetchAllPackageStages();
  }, [packages]);

  // Compute readiness for each package
  const packageReadiness = useMemo(() => {
    const readinessMap = new Map<number, ReadinessResult>();
    packages.forEach(pkg => {
      const stages = packageStagesMap.get(pkg.id) || [];
      // Add stage_id to each stage for document count lookup
      const stagesWithIds = stages.map(s => ({
        ...s,
        stage_id: s.stage_id
      }));
      readinessMap.set(pkg.id, computePackageReadiness(stagesWithIds, undefined, stageDocumentCounts));
    });
    return readinessMap;
  }, [packages, packageStagesMap, stageDocumentCounts]);

  const filteredPackages = useMemo(() => {
    return packages.filter(pkg => {
      const matchesSearch = !searchQuery || 
        pkg.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        pkg.full_text?.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesStatus = statusFilter === 'all' || 
        (statusFilter === 'active' && pkg.status === 'active') ||
        (statusFilter === 'inactive' && pkg.status !== 'active' && pkg.status !== 'archived') ||
        (statusFilter === 'archived' && pkg.status === 'archived');
      
      const matchesType = typeFilter === 'all' || pkg.package_type === typeFilter;

      return matchesSearch && matchesStatus && matchesType;
    });
  }, [packages, searchQuery, statusFilter, typeFilter]);

  const stats = useMemo(() => ({
    total: packages.length,
    active: packages.filter(p => p.status === 'active').length,
    draft: packages.filter(p => p.status === 'inactive' || p.status === 'draft').length,
    archived: packages.filter(p => p.status === 'archived').length
  }), [packages]);

  const handleDuplicate = async (pkg: Package) => {
    try {
      const newPackage = await duplicatePackage(pkg.id);
      toast({
        title: 'Package Duplicated',
        description: `Created "${newPackage.name}". You can now edit it.`
      });
      navigate(`/admin/package-builder/${newPackage.id}`);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to duplicate package',
        variant: 'destructive'
      });
    }
  };

  const handleArchive = async (pkg: Package) => {
    try {
      await archivePackage(pkg.id);
      toast({
        title: 'Package Archived',
        description: `"${pkg.name}" has been archived.`
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to archive package',
        variant: 'destructive'
      });
    }
  };

  const handleDelete = async () => {
    if (!packageToDelete) return;
    try {
      await deletePackage(packageToDelete.id);
      toast({
        title: 'Package Deleted',
        description: `"${packageToDelete.name}" has been deleted.`
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete package',
        variant: 'destructive'
      });
    } finally {
      setDeleteDialogOpen(false);
      setPackageToDelete(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20"><CheckCircle2 className="h-3 w-3 mr-1" />Active</Badge>;
      case 'archived':
        return <Badge variant="secondary" className="bg-muted text-muted-foreground"><Archive className="h-3 w-3 mr-1" />Archived</Badge>;
      default:
        return <Badge variant="outline" className="text-amber-600 border-amber-500/30"><XCircle className="h-3 w-3 mr-1" />Draft</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-[400px] rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-border/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Packages</CardTitle>
            <PackageIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">{stats.active}</div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Draft</CardTitle>
            <XCircle className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{stats.draft}</div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Archived</CardTitle>
            <Archive className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-muted-foreground">{stats.archived}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Actions */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-[300px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search packages..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Draft</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="project">Project</SelectItem>
              <SelectItem value="membership">Membership</SelectItem>
              <SelectItem value="regulatory_submission">Regulatory</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button 
          onClick={() => setIsCreateDialogOpen(true)}
          className="bg-primary hover:bg-primary/90"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Package
        </Button>
      </div>

      {/* Packages Table */}
      <Card className="border-border/50">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[280px]">Package Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Readiness</TableHead>
                <TableHead className="text-center">Duration</TableHead>
                <TableHead className="text-center">Phases</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPackages.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                    {searchQuery || statusFilter !== 'all' || typeFilter !== 'all' 
                      ? 'No packages match your filters.'
                      : 'No packages yet. Create your first package to get started.'}
                  </TableCell>
                </TableRow>
              ) : (
                filteredPackages.map((pkg) => (
                  <TableRow 
                    key={pkg.id} 
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigate(`/admin/package-builder/${pkg.id}`)}
                  >
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{pkg.name}</span>
                        <span className="text-sm text-muted-foreground truncate max-w-[280px]">
                          {pkg.full_text}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {PACKAGE_TYPE_ICONS[pkg.package_type || 'project']}
                        <span className="text-sm">
                          {PACKAGE_TYPE_LABELS[pkg.package_type || 'project'] || pkg.package_type}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(pkg.status)}</TableCell>
                    <TableCell>
                      {(() => {
                        const readiness = packageReadiness.get(pkg.id);
                        if (readiness) {
                          return <PackageReadinessBadge status={readiness.status} issues={readiness.issues} size="sm" />;
                        }
                        return null;
                      })()}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1 text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" />
                        <span>{pkg.duration_months || 12} mo</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>{pkg.stages_count || 0}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/admin/package-builder/${pkg.id}`);
                          }}>
                            <Edit className="h-4 w-4 mr-2" />
                            Edit Package
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={(e) => {
                            e.stopPropagation();
                            handleDuplicate(pkg);
                          }}>
                            <Copy className="h-4 w-4 mr-2" />
                            Duplicate
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {pkg.status !== 'archived' && (
                            <DropdownMenuItem onClick={(e) => {
                              e.stopPropagation();
                              handleArchive(pkg);
                            }}>
                              <Archive className="h-4 w-4 mr-2" />
                              Archive
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem 
                            className="text-destructive focus:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPackageToDelete(pkg);
                              setDeleteDialogOpen(true);
                            }}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create Package Dialog */}
      <CreatePackageDialog 
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Package</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{packageToDelete?.name}"? This action cannot be undone 
              and will remove all associated phases, tasks, and configurations.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}