import { useState, useEffect, useMemo, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useRBAC } from '@/hooks/useRBAC';
import { useStageDuplication } from '@/hooks/useStageDuplication';
import { useStageExportImport, StageExportData } from '@/hooks/useStageExportImport';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { 
  Plus, 
  Search, 
  Eye, 
  ShieldCheck, 
  Package2, 
  Users,
  Layers,
  Copy,
  ShieldX,
  Archive,
  ArchiveRestore,
  Upload,
  FileJson,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  XCircle,
  Play
} from 'lucide-react';
import { AddStageDialog } from '@/components/AddStageDialog';
import { StagePreviewDialog } from '@/components/package-builder/StagePreviewDialog';
import { StageSimulationDialog } from '@/components/stage/StageSimulationDialog';
import { StageQualityIndicator } from '@/components/stage/StageQualityIndicator';
import { StageDependencyIndicator } from '@/components/stage/StageDependencyIndicator';
import { StageFrameworkBadges, formatFrameworks } from '@/components/stage/StageFrameworkSelector';
import { Stage } from '@/hooks/usePackageBuilder';
import { format } from 'date-fns';

const STAGE_TYPE_OPTIONS = [
  { value: 'all', label: 'All Types' },
  { value: 'onboarding', label: 'Onboarding' },
  { value: 'delivery', label: 'Delivery' },
  { value: 'documentation', label: 'Documentation' },
  { value: 'support', label: 'Ongoing Support' },
  { value: 'offboarding', label: 'Offboarding' },
  { value: 'other', label: 'Other' },
];

const CERTIFIED_FILTER_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'certified', label: 'Certified' },
  { value: 'non-certified', label: 'Non-certified' },
];

const USAGE_FILTER_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'not-used', label: 'Not used' },
  { value: 'used', label: 'Used in packages' },
];

const ARCHIVED_FILTER_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
  { value: 'all', label: 'All' },
];

const FRAMEWORK_FILTER_OPTIONS = [
  { value: 'all', label: 'All Frameworks' },
  { value: 'RTO', label: 'RTO' },
  { value: 'CRICOS', label: 'CRICOS' },
  { value: 'GTO', label: 'GTO' },
  { value: 'Membership', label: 'Membership' },
  { value: 'Shared', label: 'Shared' },
];

interface StageWithUsage {
  id: number;
  title: string;
  short_name: string | null;
  description: string | null;
  video_url: string | null;
  stage_type: string;
  stage_key: string;
  is_certified: boolean;
  certified_notes: string | null;
  is_archived: boolean;
  version_label: string | null;
  frameworks: string[] | null;
  covers_standards: string[] | null;
  created_at: string;
  updated_at: string | null;
  usage_count: number;
  active_client_count: number;
}

export default function AdminManageStages() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { isSuperAdmin } = useRBAC();
  const { duplicateAndNavigate, isDuplicating } = useStageDuplication();
  const { importStage, validateImportData, isImporting } = useStageExportImport();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [stages, setStages] = useState<StageWithUsage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [stageTypeFilter, setStageTypeFilter] = useState('all');
  const [certifiedFilter, setCertifiedFilter] = useState('all');
  const [usageFilter, setUsageFilter] = useState('all');
  const [archivedFilter, setArchivedFilter] = useState('active');
  const [frameworkFilter, setFrameworkFilter] = useState('all');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [previewStage, setPreviewStage] = useState<Stage | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [simulateStageId, setSimulateStageId] = useState<number | null>(null);
  const [simulateStageName, setSimulateStageName] = useState<string>('');
  const [isSimulateOpen, setIsSimulateOpen] = useState(false);
  
  // Archive confirmation
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false);
  const [stageToArchive, setStageToArchive] = useState<StageWithUsage | null>(null);
  
  // Import state
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importData, setImportData] = useState<StageExportData | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importTargetPackageId, setImportTargetPackageId] = useState<string>('');
  const [availablePackages, setAvailablePackages] = useState<{id: number; name: string}[]>([]);
  const [importSuccessId, setImportSuccessId] = useState<number | null>(null);

  useEffect(() => {
    fetchStages();
    fetchPackages();
  }, []);

  const fetchStages = async () => {
    try {
      setIsLoading(true);

      // Fetch all stages
      const { data: stagesData, error: stagesError } = await supabase
        .from('documents_stages')
        .select('*')
        .order('title', { ascending: true });

      if (stagesError) throw stagesError;

      // Fetch package_stages usage counts
      const { data: usageData, error: usageError } = await supabase
        .from('package_stages')
        .select('stage_id');

      if (usageError) throw usageError;

      // Fetch active client counts from client_package_stages
      const { data: activeClientData, error: activeError } = await supabase
        .from('client_package_stages')
        .select(`
          stage_id,
          client_packages!inner (status)
        `)
        .in('client_packages.status', ['active', 'in_progress']);

      // Build usage count map
      const usageCountMap: Record<number, number> = {};
      (usageData || []).forEach((item: any) => {
        usageCountMap[item.stage_id] = (usageCountMap[item.stage_id] || 0) + 1;
      });

      // Build active client count map
      const activeClientCountMap: Record<number, number> = {};
      (activeClientData || []).forEach((item: any) => {
        activeClientCountMap[item.stage_id] = (activeClientCountMap[item.stage_id] || 0) + 1;
      });

      // Merge data
      const stagesWithUsage: StageWithUsage[] = (stagesData || []).map((stage: any) => ({
        id: stage.id,
        title: stage.title,
        short_name: stage.short_name,
        description: stage.description,
        video_url: stage.video_url,
        stage_type: stage.stage_type || 'other',
        stage_key: stage.stage_key || '',
        is_certified: stage.is_certified || false,
        certified_notes: stage.certified_notes,
        is_archived: stage.is_archived || false,
        version_label: stage.version_label || null,
        frameworks: stage.frameworks || null,
        covers_standards: stage.covers_standards || null,
        created_at: stage.created_at,
        updated_at: stage.updated_at,
        usage_count: usageCountMap[stage.id] || 0,
        active_client_count: activeClientCountMap[stage.id] || 0,
      }));

      setStages(stagesWithUsage);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to fetch stages',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchPackages = async () => {
    try {
      const { data } = await supabase
        .from('packages')
        .select('id, name')
        .eq('status', 'active')
        .order('name');
      setAvailablePackages(data || []);
    } catch (error) {
      console.error('Failed to fetch packages:', error);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const parsed = JSON.parse(content);
        
        if (!validateImportData(parsed)) {
          setImportError('Invalid stage export file format. Please check the file structure.');
          setImportData(null);
        } else {
          setImportData(parsed);
          setImportError(null);
        }
        setImportDialogOpen(true);
      } catch (err) {
        setImportError('Failed to parse JSON file. Please ensure it is a valid stage export.');
        setImportData(null);
        setImportDialogOpen(true);
      }
    };
    reader.readAsText(file);
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleImport = async () => {
    if (!importData) return;

    const targetPkg = importTargetPackageId ? parseInt(importTargetPackageId) : undefined;
    const result = await importStage(importData, targetPkg);

    if (result.success && result.newStageId) {
      setImportSuccessId(result.newStageId);
      toast({
        title: 'Phase Imported',
        description: `Created "${importData.stage.title}" with ${result.counts?.team_tasks || 0} team tasks, ${result.counts?.client_tasks || 0} client tasks.`,
      });
      fetchStages();
    } else {
      toast({
        title: 'Import Failed',
        description: result.error || 'Failed to import phase',
        variant: 'destructive',
      });
    }
  };

  const closeImportDialog = () => {
    setImportDialogOpen(false);
    setImportData(null);
    setImportError(null);
    setImportTargetPackageId('');
    setImportSuccessId(null);
  };

  // Filter stages based on search and filters
  const filteredStages = useMemo(() => {
    return stages.filter((stage) => {
      // Search filter
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch =
        !searchQuery ||
        stage.title.toLowerCase().includes(searchLower) ||
        stage.stage_key.toLowerCase().includes(searchLower) ||
        stage.short_name?.toLowerCase().includes(searchLower);

      // Stage type filter
      const matchesType = stageTypeFilter === 'all' || stage.stage_type === stageTypeFilter;

      // Certified filter
      const matchesCertified =
        certifiedFilter === 'all' ||
        (certifiedFilter === 'certified' && stage.is_certified) ||
        (certifiedFilter === 'non-certified' && !stage.is_certified);

      // Usage filter
      const matchesUsage =
        usageFilter === 'all' ||
        (usageFilter === 'not-used' && stage.usage_count === 0) ||
        (usageFilter === 'used' && stage.usage_count > 0);

      // Archived filter
      const matchesArchived =
        archivedFilter === 'all' ||
        (archivedFilter === 'active' && !stage.is_archived) ||
        (archivedFilter === 'archived' && stage.is_archived);

      // Framework filter
      const matchesFramework = (() => {
        if (frameworkFilter === 'all') return true;
        if (frameworkFilter === 'Shared') {
          return !stage.frameworks || stage.frameworks.length === 0 || stage.frameworks.includes('Shared');
        }
        return stage.frameworks?.includes(frameworkFilter);
      })();

      return matchesSearch && matchesType && matchesCertified && matchesUsage && matchesArchived && matchesFramework;
    });
  }, [stages, searchQuery, stageTypeFilter, certifiedFilter, usageFilter, archivedFilter, frameworkFilter]);

  const handlePreview = (stage: StageWithUsage) => {
    // Convert to Stage type for preview dialog
    setPreviewStage({
      id: stage.id,
      title: stage.title,
      short_name: stage.short_name,
      description: stage.description,
      video_url: stage.video_url,
      stage_type: stage.stage_type,
      stage_key: stage.stage_key,
      is_certified: stage.is_certified,
      certified_notes: stage.certified_notes,
      created_at: stage.updated_at || stage.created_at,
      usage_count: stage.usage_count,
      is_reusable: true,
      ai_hint: null,
      dashboard_visible: true,
    });
    setIsPreviewOpen(true);
  };

  const handleDuplicate = async (stage: StageWithUsage) => {
    await duplicateAndNavigate({ sourceStageId: stage.id });
  };

  const handleArchive = async (stage: StageWithUsage) => {
    if (stage.usage_count > 0 || stage.active_client_count > 0) {
      setStageToArchive(stage);
      setArchiveConfirmOpen(true);
    } else {
      await toggleArchive(stage);
    }
  };

  const toggleArchive = async (stage: StageWithUsage) => {
    try {
      const newArchived = !stage.is_archived;
      const { error } = await supabase
        .from('documents_stages')
        .update({ is_archived: newArchived })
        .eq('id', stage.id);

      if (error) throw error;

      toast({
        title: newArchived ? 'Phase Archived' : 'Phase Restored',
        description: newArchived 
          ? 'Phase has been archived and hidden from phase selection.' 
          : 'Phase has been restored and is now available.',
      });
      
      // Log audit event
      await supabase.from('audit_events').insert({
        entity: 'stage',
        entity_id: stage.id.toString(),
        action: newArchived ? 'stage.archived' : 'stage.restored',
        details: { stage_title: stage.title },
      });
      
      fetchStages();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update phase',
        variant: 'destructive',
      });
    }
  };

  const getStageTypeColor = (stageType: string) => {
    switch (stageType) {
      case 'onboarding':
        return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
      case 'delivery':
      case 'documentation':
        return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20';
      case 'support':
        return 'bg-purple-500/10 text-purple-600 border-purple-500/20';
      case 'offboarding':
        return 'bg-amber-500/10 text-amber-600 border-amber-500/20';
      default:
        return 'bg-muted text-muted-foreground border-border';
    }
  };

  // Access denied for non-SuperAdmins
  if (!isSuperAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-4">
          <ShieldX className="h-16 w-16 mx-auto text-destructive/50" />
          <h2 className="text-xl font-semibold">Access Denied</h2>
          <p className="text-muted-foreground">
            You need Super Admin privileges to access this page.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 animate-fade-in">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-[28px] font-bold flex items-center gap-2">
            <Layers className="h-7 w-7" />
            Manage Phases
          </h1>
          <p className="text-muted-foreground">
            Create and manage phase templates for packages
          </p>
        </div>
        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleFileUpload}
          />
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="mr-2 h-4 w-4" />
            Import Phase
          </Button>
          <Button
            onClick={() => setIsCreateDialogOpen(true)}
            className="bg-[hsl(188_74%_51%)] hover:bg-[hsl(188_74%_51%)]/90"
          >
            <Plus className="mr-2 h-4 w-4" />
            Create Phase
          </Button>
        </div>
      </div>

      {/* Filters Row */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative flex-1 min-w-[250px] max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or phase key..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        <Select value={stageTypeFilter} onValueChange={setStageTypeFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Phase Type" />
          </SelectTrigger>
          <SelectContent>
            {STAGE_TYPE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={certifiedFilter} onValueChange={setCertifiedFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Certified" />
          </SelectTrigger>
          <SelectContent>
            {CERTIFIED_FILTER_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={usageFilter} onValueChange={setUsageFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Usage" />
          </SelectTrigger>
          <SelectContent>
            {USAGE_FILTER_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={archivedFilter} onValueChange={setArchivedFilter}>
          <SelectTrigger className="w-[120px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {ARCHIVED_FILTER_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={frameworkFilter} onValueChange={setFrameworkFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Framework" />
          </SelectTrigger>
          <SelectContent>
            {FRAMEWORK_FILTER_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="text-sm text-muted-foreground ml-auto">
          Showing {filteredStages.length} of {stages.length} phases
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-card shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-b hover:bg-transparent">
              <TableHead className="font-semibold">Phase Name</TableHead>
              <TableHead className="font-semibold">Type</TableHead>
              <TableHead className="font-semibold">Version</TableHead>
              <TableHead className="font-semibold">Frameworks</TableHead>
              <TableHead className="font-semibold text-center">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger className="flex items-center gap-1 mx-auto">
                      Standards
                    </TooltipTrigger>
                    <TooltipContent>Standards covered by stage</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </TableHead>
              <TableHead className="font-semibold text-center">Certified</TableHead>
              <TableHead className="font-semibold text-center">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger className="flex items-center gap-1 mx-auto">
                      <Package2 className="h-4 w-4" />
                      Packages
                    </TooltipTrigger>
                    <TooltipContent>Used in packages count</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </TableHead>
              <TableHead className="font-semibold text-center">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger className="flex items-center gap-1 mx-auto">
                      <Users className="h-4 w-4" />
                      Active
                    </TooltipTrigger>
                    <TooltipContent>Active client instances</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </TableHead>
              <TableHead className="font-semibold">Updated</TableHead>
              <TableHead className="font-semibold text-center">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger className="flex items-center gap-1 mx-auto">
                      Quality
                    </TooltipTrigger>
                    <TooltipContent>Stage quality check result</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </TableHead>
              <TableHead className="font-semibold text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              // Loading skeleton
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-5 w-[200px]" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-[80px]" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-[60px]" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-[60px]" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-[40px] mx-auto" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-[60px] mx-auto" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-[40px] mx-auto" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-[40px] mx-auto" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-[80px]" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-[60px] mx-auto" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-[80px] ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : filteredStages.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="text-center py-16">
                  <div className="space-y-3">
                    <Layers className="h-12 w-12 mx-auto text-muted-foreground/50" />
                    <p className="text-muted-foreground">
                      {stages.length === 0
                        ? 'No phases found. Create a phase to get started.'
                        : 'No phases match your filters.'}
                    </p>
                    {stages.length === 0 && (
                      <Button
                        variant="outline"
                        onClick={() => setIsCreateDialogOpen(true)}
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Create Phase
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredStages.map((stage) => (
                <TableRow
                  key={stage.id}
                  className="group hover:bg-muted/50 transition-colors"
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Link
                        to={`/admin/stages/${stage.id}`}
                        className="font-medium text-foreground hover:text-primary hover:underline"
                      >
                        {stage.title}
                      </Link>
                      {stage.is_archived && (
                        <Badge variant="outline" className="text-xs bg-muted">
                          <Archive className="h-3 w-3 mr-1" />
                          Archived
                        </Badge>
                      )}
                      <StageDependencyIndicator stageId={stage.id} />
                    </div>
                    {stage.stage_key && (
                      <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                        {stage.stage_key}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={`text-xs capitalize ${getStageTypeColor(stage.stage_type)}`}
                    >
                      {stage.stage_type}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {stage.version_label || '—'}
                  </TableCell>
                  <TableCell>
                    <StageFrameworkBadges frameworks={stage.frameworks} size="sm" />
                  </TableCell>
                  <TableCell className="text-center">
                    {stage.covers_standards && stage.covers_standards.length > 0 ? (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <Badge variant="secondary" className="text-xs">
                              {stage.covers_standards.length}
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-[300px]">
                            <p className="font-medium mb-1">Standards covered:</p>
                            <ul className="text-xs space-y-0.5">
                              {stage.covers_standards.slice(0, 8).map(code => (
                                <li key={code}>{code}</li>
                              ))}
                              {stage.covers_standards.length > 8 && (
                                <li>+{stage.covers_standards.length - 8} more</li>
                              )}
                            </ul>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    {stage.is_certified ? (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                              <ShieldCheck className="h-3 w-3 mr-1" />
                              Yes
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>
                            {stage.certified_notes || 'Certified stage template'}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="font-medium">{stage.usage_count}</span>
                  </TableCell>
                  <TableCell className="text-center">
                    {stage.active_client_count > 0 ? (
                      <Badge variant="secondary" className="text-xs">
                        {stage.active_client_count}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {stage.updated_at
                      ? format(new Date(stage.updated_at), 'dd MMM yyyy')
                      : format(new Date(stage.created_at), 'dd MMM yyyy')}
                  </TableCell>
                  <TableCell className="text-center">
                    <StageQualityIndicator 
                      stageId={stage.id}
                      stageType={stage.stage_type}
                      isArchived={stage.is_archived}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setSimulateStageId(stage.id);
                                setSimulateStageName(stage.title);
                                setIsSimulateOpen(true);
                              }}
                              className="h-8 w-8"
                            >
                              <Play className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Simulate</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>

                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handlePreview(stage)}
                              className="h-8 w-8"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Preview</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDuplicate(stage)}
                              disabled={isDuplicating}
                              className="h-8 w-8"
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Duplicate</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>

                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleArchive(stage)}
                              className="h-8 w-8"
                            >
                              {stage.is_archived ? (
                                <ArchiveRestore className="h-4 w-4" />
                              ) : (
                                <Archive className="h-4 w-4" />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {stage.is_archived ? 'Restore' : 'Archive'}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Create Stage Dialog */}
      <AddStageDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onSuccess={fetchStages}
      />

      {/* Preview Dialog */}
      <StagePreviewDialog
        open={isPreviewOpen}
        onOpenChange={setIsPreviewOpen}
        stage={previewStage}
      />

      {/* Simulation Dialog */}
      <StageSimulationDialog
        open={isSimulateOpen}
        onOpenChange={setIsSimulateOpen}
        stageId={simulateStageId}
        stageName={simulateStageName}
      />

      {/* Archive Confirmation Dialog */}
      <AlertDialog open={archiveConfirmOpen} onOpenChange={setArchiveConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive Phase?</AlertDialogTitle>
            <AlertDialogDescription>
              {stageToArchive && (
                <>
                  <strong>{stageToArchive.title}</strong> is currently used in{' '}
                  <strong>{stageToArchive.usage_count} package(s)</strong>
                  {stageToArchive.active_client_count > 0 && (
                    <> and <strong>{stageToArchive.active_client_count} active client(s)</strong></>
                  )}.
                  <br /><br />
                  Archived phases will be hidden from phase selection dialogs but will remain 
                  in existing packages. Are you sure you want to archive this phase?
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (stageToArchive) toggleArchive(stageToArchive);
                setArchiveConfirmOpen(false);
              }}
            >
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* Import Phase Dialog */}
      <Dialog open={importDialogOpen} onOpenChange={closeImportDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileJson className="h-5 w-5" />
              Import Phase from JSON
            </DialogTitle>
            <DialogDescription>
              Create a new phase from an exported phase definition.
            </DialogDescription>
          </DialogHeader>
          
          {importSuccessId ? (
            <div className="py-6 text-center space-y-4">
              <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto" />
              <div>
                <h3 className="font-semibold text-lg">Stage Imported Successfully!</h3>
                <p className="text-muted-foreground text-sm mt-1">
                  The stage "{importData?.stage.title}" has been created.
                </p>
              </div>
              <div className="flex gap-2 justify-center">
                <Button variant="outline" onClick={closeImportDialog}>Close</Button>
                <Button onClick={() => navigate(`/admin/stages/${importSuccessId}`)}>
                  View Stage
                </Button>
              </div>
            </div>
          ) : importError ? (
            <div className="py-6 text-center space-y-4">
              <div className="text-destructive">
                <ShieldX className="h-12 w-12 mx-auto mb-2" />
                <p className="font-medium">Import Error</p>
                <p className="text-sm text-muted-foreground mt-1">{importError}</p>
              </div>
              <Button variant="outline" onClick={closeImportDialog}>Close</Button>
            </div>
          ) : importData ? (
            <div className="space-y-4 py-4">
              <div className="border rounded-lg p-4 bg-muted/30">
                <h4 className="font-medium mb-2">Stage to Import</h4>
                <div className="space-y-1 text-sm">
                  <p><span className="text-muted-foreground">Name:</span> {importData.stage.title}</p>
                  <p><span className="text-muted-foreground">Type:</span> {importData.stage.stage_type}</p>
                  <p><span className="text-muted-foreground">Team Tasks:</span> {importData.team_tasks.length}</p>
                  <p><span className="text-muted-foreground">Client Tasks:</span> {importData.client_tasks.length}</p>
                  <p><span className="text-muted-foreground">Emails:</span> {importData.emails.length}</p>
                  <p><span className="text-muted-foreground">Documents:</span> {importData.documents.length}</p>
                </div>
                {importData.package_context && (
                  <p className="text-xs text-amber-600 mt-2">
                    ⚠️ Exported from package: {importData.package_context.package_name}
                  </p>
                )}
              </div>

              {(importData.team_tasks.length > 0 || importData.client_tasks.length > 0 || 
                importData.emails.length > 0 || importData.documents.length > 0) && (
                <div className="space-y-2">
                  <Label>Target Package for Content (optional)</Label>
                  <Select value={importTargetPackageId} onValueChange={setImportTargetPackageId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select package to import content into..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">None - import stage only</SelectItem>
                      {availablePackages.map(pkg => (
                        <SelectItem key={pkg.id} value={pkg.id.toString()}>
                          {pkg.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Tasks, emails, and documents will only be imported if you select a package.
                  </p>
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                Note: The imported stage will not be certified, regardless of original certification status.
              </p>
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
              Loading file...
            </div>
          )}

          {importData && !importSuccessId && (
            <DialogFooter>
              <Button variant="outline" onClick={closeImportDialog}>Cancel</Button>
              <Button onClick={handleImport} disabled={isImporting}>
                {isImporting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Import Stage
                  </>
                )}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
