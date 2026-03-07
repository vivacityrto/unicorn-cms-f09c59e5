import { useParams, Link, useNavigate } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useRBAC } from '@/hooks/useRBAC';
import { useStageActiveUsage } from '@/hooks/useStageActiveUsage';
import { useStageCertification } from '@/hooks/useStageCertification';
import { useStageDuplication } from '@/hooks/useStageDuplication';
import { useStageReplacement } from '@/hooks/useStageReplacement';
import { useStageAuditLog, formatActionName, generateAuditSummary } from '@/hooks/useStageAuditLog';
import { useStageExportImport } from '@/hooks/useStageExportImport';
import { useStageTypeOptions, getStageTypeColor as getStageTypeColorHelper, getStageTypeLabel } from '@/hooks/useStageTypeOptions';
import { useStageQualityCheck, computeStageQuality } from '@/hooks/useStageQualityCheck';
import { usePackageBuilder, Stage } from '@/hooks/usePackageBuilder';
import { useStageTemplateContent, usePackageStageOverrides, StageTeamTask, StageClientTask, StageEmail } from '@/hooks/useStageTemplateContent';
import { useStageImpact, useSyncStageToPackages } from '@/hooks/usePackageStageOverrides';
import { useStageDependencyCheck, updateStageDependencies, checkDependencyCertification } from '@/hooks/useStageDependencies';
import { useStageVersions, StageVersion, CertifiedEditCheck } from '@/hooks/useStageVersions';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  ArrowLeft, Layers, ShieldCheck, ShieldX, Settings, Users, CheckSquare, 
  Mail, FileText, BarChart3, History, Copy, AlertTriangle, Plus, Trash2, 
  User, Clock, GripVertical, Package, Info, Loader2, RefreshCw, ExternalLink,
  Archive, Download, ChevronDown, ChevronRight, Calendar, Shield, Link2, Globe, Play, Pencil
} from 'lucide-react';
import { StageDocumentsTab } from '@/components/package-builder/StageDocumentsTab';
import { StageQualityPanel, StageQualityBadge } from '@/components/stage/StageQualityPanel';
import { StageDocumentsPanel } from '@/components/stage/StageDocumentsPanel';
import { StageDependencySelector } from '@/components/stage/StageDependencySelector';
import { StageFrameworkSelector, StageFrameworkBadges, updateStageFrameworks, isFrameworksNarrowed } from '@/components/stage/StageFrameworkSelector';
import { StageStandardsSelector } from '@/components/stage/StageStandardsSelector';
import { StageSimulationDialog } from '@/components/stage/StageSimulationDialog';
import { EditStageEmailDialog } from '@/components/stage/EditStageEmailDialog';
import { StageImpactPanel } from '@/components/package-builder/StageImpactPanel';
import { StageVersionHeader } from '@/components/stage/StageVersionHeader';
import { VersionSnapshotViewer } from '@/components/stage/VersionSnapshotViewer';
import { format } from 'date-fns';

// Stage types loaded dynamically via useStageTypeOptions hook

interface PackageOption {
  id: number;
  name: string;
  status: string;
  package_type?: string;
}

export default function AdminStageDetail() {
  const { stage_id } = useParams<{ stage_id: string }>();
  const stageIdNum = stage_id ? parseInt(stage_id) : null;
  const navigate = useNavigate();
  const { isSuperAdmin } = useRBAC();
  const { toast } = useToast();
  const { stageTypes: STAGE_TYPE_OPTIONS } = useStageTypeOptions();
  const { updateStage, emailTemplates } = usePackageBuilder();
  const { activeUsage } = useStageActiveUsage(stageIdNum);
  const { updateCertification, isUpdating: isCertUpdating } = useStageCertification();
  const { duplicateAndNavigate, isDuplicating } = useStageDuplication();
  const { replaceStageInPackages, isReplacing } = useStageReplacement();
  const { downloadExport, isExporting } = useStageExportImport();
  
  // Stage template content - NO PACKAGE CONTEXT REQUIRED
  const {
    teamTasks,
    clientTasks,
    emails: stageEmails,
    documents: stageDocuments,
    loading: loadingTemplateContent,
    addTeamTask,
    updateTeamTask,
    deleteTeamTask,
    addClientTask,
    updateClientTask,
    deleteClientTask,
    addEmail,
    updateEmail,
    deleteEmail,
    addDocument,
    addBulkDocuments,
    updateDocument,
    deleteDocument,
    reorderDocuments,
    fetchContent: refetchTemplateContent
  } = useStageTemplateContent(stageIdNum);

  // Override count for settings display
  const { overrideCount } = usePackageStageOverrides(null, stageIdNum);
  
  // Stage impact tracking
  const { packageCount, overrideCount: impactOverrideCount, packages: packagesWithOverrides, refetch: refetchImpact } = useStageImpact(stageIdNum);
  const { syncToPackages, syncing: isSyncing } = useSyncStageToPackages();
  
  // Stage versioning
  const { 
    versions, 
    latestPublished, 
    isLoading: versionsLoading, 
    publishVersion, 
    isPublishing, 
    checkCertifiedEdit 
  } = useStageVersions(stageIdNum);
  const [certifiedEditCheck, setCertifiedEditCheck] = useState<CertifiedEditCheck | null>(null);
  const [viewingVersion, setViewingVersion] = useState<StageVersion | null>(null);
  
  // Quality check state - no package context needed for template quality
  const { result: qualityResult, isLoading: qualityLoading, refetch: refetchQuality } = useStageQualityCheck({
    stageId: stageIdNum,
    packageId: undefined,
    enabled: !!stageIdNum
  });
  
  // Certification guardrail state
  const [certBlockDialogOpen, setCertBlockDialogOpen] = useState(false);
  const [certWarnDialogOpen, setCertWarnDialogOpen] = useState(false);
  const [pendingCertNotes, setPendingCertNotes] = useState<string | null>(null);
  const [certWarningMessages, setCertWarningMessages] = useState<string[]>([]);
  
  // Dependencies state
  const { result: dependencyResult, refetch: refetchDependencies } = useStageDependencyCheck(stageIdNum);
  const [localDependencies, setLocalDependencies] = useState<string[]>([]);
  
  // Frameworks state
  const [localFrameworks, setLocalFrameworks] = useState<string[]>([]);
  const [frameworksNarrowingWarning, setFrameworksNarrowingWarning] = useState(false);
  const [pendingFrameworks, setPendingFrameworks] = useState<string[] | null>(null);
  
  // Standards state
  const [localStandards, setLocalStandards] = useState<string[]>([]);
  
  const [stage, setStage] = useState<Stage | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('settings');
  const [usageCount, setUsageCount] = useState(0);
  const [expandedAuditRows, setExpandedAuditRows] = useState<Set<string>>(new Set());
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportPackageId, setExportPackageId] = useState<string>('');
  const [packagesUsing, setPackagesUsing] = useState<PackageOption[]>([]);
  
  // Edit confirmation with typed phrase
  const [editConfirmationOpen, setEditConfirmationOpen] = useState(false);
  const [pendingUpdate, setPendingUpdate] = useState<Partial<Stage> | null>(null);
  const [hasConfirmedEditing, setHasConfirmedEditing] = useState(false);
  const [confirmPhrase, setConfirmPhrase] = useState('');
  const CONFIRM_PHRASE_REQUIRED = 'EDIT LIVE STAGE';
  
  // Replace stage state
  const [replaceDialogOpen, setReplaceDialogOpen] = useState(false);
  const [selectedPackagesForReplace, setSelectedPackagesForReplace] = useState<number[]>([]);
  const [replacementStageId, setReplacementStageId] = useState<number | null>(null);
  const [allStages, setAllStages] = useState<Stage[]>([]);
  const [copyContentOnReplace, setCopyContentOnReplace] = useState(true);
  const [stageSearchQuery, setStageSearchQuery] = useState('');
  
  // Duplicate dialog state
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const [sourcePackageForDupe, setSourcePackageForDupe] = useState<number | null>(null);
  const [applyToAllPackages, setApplyToAllPackages] = useState(false);
  
  // Dialog states
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [isAddingClientTask, setIsAddingClientTask] = useState(false);
  const [isAddingEmail, setIsAddingEmail] = useState(false);
  
  // Edit dialog states
  const [editingTeamTask, setEditingTeamTask] = useState<StageTeamTask | null>(null);
  const [editingClientTask, setEditingClientTask] = useState<StageClientTask | null>(null);
  const [editingEmail, setEditingEmail] = useState<StageEmail | null>(null);
  
  // Form states
  const [taskForm, setTaskForm] = useState({
    name: '',
    description: '',
    owner_role: 'Admin',
    estimated_hours: '',
    is_mandatory: true
  });
  const [clientTaskForm, setClientTaskForm] = useState({
    name: '',
    description: '',
    instructions: '',
    due_date_offset: ''
  });
  const [emailForm, setEmailForm] = useState({
    email_template_id: '',
    trigger_type: 'manual',
    recipient_type: 'tenant'
  });
  
  // Edit form states
  const [editTaskForm, setEditTaskForm] = useState({
    name: '',
    description: '',
    is_core: true,
    due_date_offset: ''
  });
  const [editClientTaskForm, setEditClientTaskForm] = useState({
    name: '',
    description: '',
    instructions: '',
    due_date_offset: '',
    is_mandatory: true
  });
  const [editEmailForm, setEditEmailForm] = useState({
    name: '',
    subject: '',
    description: '',
    content: '',
    automation_enabled: false
  });

  // Certified edit confirmation state
  const [certifiedEditDialogOpen, setCertifiedEditDialogOpen] = useState(false);
  const [certifiedConfirmPhrase, setCertifiedConfirmPhrase] = useState('');
  const [pendingCertifiedAction, setPendingCertifiedAction] = useState<(() => void) | null>(null);
  const CERTIFIED_CONFIRM_PHRASE = 'CERTIFIED';
  
  // Audit log filters
  const [auditDateFrom, setAuditDateFrom] = useState<Date | undefined>();
  const [auditDateTo, setAuditDateTo] = useState<Date | undefined>();
  const [auditActionFilter, setAuditActionFilter] = useState<string>('all');
  
  // Stage simulation state
  const [simulationOpen, setSimulationOpen] = useState(false);

  // Now call audit log hook with filter state
  const { events: auditEvents, isLoading: auditLoading, uniqueActions, refetch: refetchAudit } = useStageAuditLog({ 
    stageId: stageIdNum,
    dateFrom: auditDateFrom,
    dateTo: auditDateTo,
    actionFilter: auditActionFilter !== 'all' ? auditActionFilter : undefined,
  });

  const isUsedByActiveClients = activeUsage.count > 0;
  const isReused = usageCount > 1;

  // Fetch stage data
  const fetchStage = useCallback(async () => {
    if (!stageIdNum) return;
    
    try {
      setIsLoading(true);
      const { data: rawData, error } = await supabase
        .from('stages')
        .select('*')
        .eq('id', stageIdNum)
        .single();
      const data = rawData ? {
        ...rawData,
        title: rawData.name,
        short_name: rawData.shortname,
        video_url: rawData.videourl,
        created_at: rawData.dateimported || rawData.updated_at || '',
      } : null;

      if (error) throw error;
      setStage(data as Stage);
    } catch (error) {
      console.error('Failed to fetch stage:', error);
    } finally {
      setIsLoading(false);
    }
  }, [stageIdNum]);

  // Fetch usage count and packages using this stage
  const fetchUsageData = useCallback(async () => {
    if (!stageIdNum) return;
    
    try {
      // Get package_stages for this stage
      const { data: psData, error: psError } = await supabase
        .from('package_stages' as any)
        .select('package_id')
        .eq('stage_id', stageIdNum) as any;

      if (psError) throw psError;

      const packageIdsSet = new Set<number>();
      (psData || []).forEach((ps: any) => packageIdsSet.add(ps.package_id));
      const packageIds = Array.from(packageIdsSet);
      setUsageCount(packageIds.length);

      if (packageIds.length > 0) {
        const { data: packagesData, error: packagesError } = await supabase
          .from('packages')
          .select('id, name, status')
          .in('id', packageIds)
          .order('name', { ascending: true });

        if (packagesError) throw packagesError;
        setPackagesUsing(packagesData || []);
      }
      
      // Fetch all stages for replacement dropdown
      const { data: allStagesRaw } = await supabase
        .from('stages')
        .select('*')
        .eq('is_archived', false)
        .order('name', { ascending: true });
      
      setAllStages((allStagesRaw || []).map((s: any) => ({
        ...s,
        title: s.name,
        short_name: s.shortname,
        video_url: s.videourl,
        created_at: s.dateimported || s.updated_at || '',
      })) as Stage[]);
    } catch (error) {
      console.error('Failed to fetch usage data:', error);
    }
  }, [stageIdNum]);

  useEffect(() => {
    fetchStage();
    fetchUsageData();
  }, [fetchStage, fetchUsageData]);

  // Check certified edit status
  useEffect(() => {
    if (stage?.is_certified) {
      checkCertifiedEdit().then(setCertifiedEditCheck);
    } else {
      setCertifiedEditCheck(null);
    }
  }, [stage?.is_certified, checkCertifiedEdit]);

  // Sync local dependencies state with fetched result
  useEffect(() => {
    if (dependencyResult) {
      setLocalDependencies(dependencyResult.requires_stage_keys);
    }
  }, [dependencyResult]);

  // Sync local frameworks state with stage
  useEffect(() => {
    if (stage) {
      setLocalFrameworks((stage as any).frameworks || []);
    }
  }, [stage]);

  const handleUpdateStage = async (updates: Partial<Stage>) => {
    if (!stage) return;
    
    // If stage is used by active clients and user hasn't confirmed, prompt confirmation
    if (isUsedByActiveClients && !hasConfirmedEditing) {
      setPendingUpdate(updates);
      setEditConfirmationOpen(true);
      return;
    }
    
    try {
      await updateStage(stage.id, updates);
      setStage(prev => prev ? { ...prev, ...updates } : null);
      toast({ title: 'Stage Updated' });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update stage',
        variant: 'destructive'
      });
    }
  };

  const handleUpdateVersionLabel = async (version_label: string) => {
    if (!stage) return;
    
    const oldLabel = (stage as any).version_label || null;
    const newLabel = version_label.trim() || null;
    
    try {
      const { error } = await (supabase
        .from('stages')
        .update({ version_label: newLabel } as any)
        .eq('id', stage.id) as any);
      
      if (error) throw error;
      
      setStage(prev => prev ? { ...prev, version_label: newLabel } as any : null);
      
      // Log audit event
      if (oldLabel !== newLabel) {
        await supabase.from('audit_events').insert({
          entity: 'stage',
          entity_id: stage.id.toString(),
          action: 'stage.version_updated',
          details: { 
            old_version_label: oldLabel,
            new_version_label: newLabel,
            stage_title: stage.title
          }
        });
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update version label',
        variant: 'destructive'
      });
    }
  };

  const handleUpdateDependencies = async (stageKeys: string[]) => {
    if (!stage) return;
    setLocalDependencies(stageKeys);
    const success = await updateStageDependencies(stage.id, stageKeys, stage.title);
    if (success) {
      refetchDependencies();
    } else {
      toast({
        title: 'Error',
        description: 'Failed to update dependencies',
        variant: 'destructive'
      });
    }
  };

  const handleUpdateFrameworks = async (frameworks: string[]) => {
    if (!stage) return;
    
    const oldFrameworks = (stage as any).frameworks || null;
    
    // Check if narrowing scope on a certified stage
    if (stage.is_certified && isFrameworksNarrowed(oldFrameworks, frameworks)) {
      setPendingFrameworks(frameworks);
      setFrameworksNarrowingWarning(true);
      return;
    }
    
    await applyFrameworksUpdate(frameworks);
  };

  const applyFrameworksUpdate = async (frameworks: string[]) => {
    if (!stage) return;
    
    const oldFrameworks = (stage as any).frameworks || null;
    setLocalFrameworks(frameworks);
    
    const success = await updateStageFrameworks(stage.id, frameworks, stage.title, oldFrameworks);
    if (success) {
      setStage(prev => prev ? { ...prev, frameworks } as any : null);
      
      // Log if certified stage was narrowed
      if (stage.is_certified && isFrameworksNarrowed(oldFrameworks, frameworks)) {
        await supabase.from('audit_events').insert({
          entity: 'stage',
          entity_id: stage.id.toString(),
          action: 'stage.frameworks_narrowed',
          details: {
            old_frameworks: oldFrameworks,
            new_frameworks: frameworks,
            stage_title: stage.title
          }
        });
      }
    } else {
      // Revert local state
      setLocalFrameworks(oldFrameworks || []);
      toast({
        title: 'Error',
        description: 'Failed to update frameworks',
        variant: 'destructive'
      });
    }
  };

  const confirmFrameworksNarrowing = async () => {
    setFrameworksNarrowingWarning(false);
    if (pendingFrameworks) {
      await applyFrameworksUpdate(pendingFrameworks);
      setPendingFrameworks(null);
    }
  };

  const confirmAndApplyUpdate = async () => {
    // Validate the typed phrase
    if (confirmPhrase !== CONFIRM_PHRASE_REQUIRED) {
      toast({
        title: 'Confirmation Required',
        description: `Please type "${CONFIRM_PHRASE_REQUIRED}" to confirm`,
        variant: 'destructive'
      });
      return;
    }
    
    setHasConfirmedEditing(true);
    setEditConfirmationOpen(false);
    setConfirmPhrase('');
    if (pendingUpdate && stage) {
      try {
        await updateStage(stage.id, pendingUpdate);
        setStage(prev => prev ? { ...prev, ...pendingUpdate } : null);
        toast({ title: 'Stage Updated' });
      } catch (error: any) {
        toast({
          title: 'Error',
          description: error.message || 'Failed to update stage',
          variant: 'destructive'
        });
      }
      setPendingUpdate(null);
    }
  };

  const handleUpdateCertification = async (is_certified: boolean, certified_notes: string | null) => {
    if (!stage) return;
    
    // If turning certification ON, run quality check first
    if (is_certified && !stage.is_certified) {
      const quality = await computeStageQuality(stage.id, undefined);
      
      if (quality?.status === 'fail') {
        // Block certification
        setPendingCertNotes(certified_notes);
        setCertBlockDialogOpen(true);
        
        // Log the blocked attempt
        await supabase.from('audit_events').insert({
          entity: 'stage',
          entity_id: stage.id.toString(),
          action: 'stage.certification_blocked',
          details: { 
            failed_checks: quality.checks.filter(c => c.status === 'fail').map(c => c.check_key),
            stage_title: stage.title
          }
        });
        return;
      }
      
      // Collect warning messages
      const warningMessages: string[] = [];
      
      // Check for version label warning (soft, non-blocking)
      if (!(stage as any).version_label) {
        warningMessages.push('Consider setting a version label before certifying this stage.');
      }
      
      // Check for standards mapping warning (soft, non-blocking)
      if (!localStandards || localStandards.length === 0) {
        warningMessages.push('Certified stages usually map to one or more standards.');
      }
      
      // Check if dependencies are on non-certified stages
      if (localDependencies.length > 0) {
        const depCheck = await checkDependencyCertification(localDependencies);
        if (!depCheck.allCertified) {
          warningMessages.push(`This stage depends on non-certified stages: ${depCheck.uncertified.join(', ')}`);
        }
      }
      
      // Quality warnings
      if (quality?.status === 'warn') {
        quality.checks
          .filter(c => c.status === 'warn')
          .forEach(c => warningMessages.push(c.message));
      }
      
      if (warningMessages.length > 0) {
        // Show warning confirmation
        setPendingCertNotes(certified_notes);
        setCertWarningMessages(warningMessages);
        setCertWarnDialogOpen(true);
        return;
      }
    }
    
    await applyCertification(is_certified, certified_notes);
  };

  const applyCertification = async (is_certified: boolean, certified_notes: string | null) => {
    if (!stage) return;
    
    try {
      const success = await updateCertification(stage.id, is_certified, certified_notes || undefined);
      if (success) {
        setStage(prev => prev ? { ...prev, is_certified, certified_notes } : null);
        refetchQuality();
        
        // Log if certified with warnings (including dependency warnings)
        if (is_certified && certWarningMessages.length > 0) {
          const hasDependencyWarning = certWarningMessages.some(m => m.includes('non-certified stages'));
          
          await supabase.from('audit_events').insert({
            entity: 'stage',
            entity_id: stage.id.toString(),
            action: hasDependencyWarning ? 'stage.certified_with_dependency_warning' : 'stage.certified_with_warnings',
            details: { 
              warning_messages: certWarningMessages,
              stage_title: stage.title
            }
          });
        }
        
        setCertWarningMessages([]);
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update certification. SuperAdmin access required.',
        variant: 'destructive'
      });
    }
  };

  const handleConfirmCertWithWarnings = async () => {
    setCertWarnDialogOpen(false);
    await applyCertification(true, pendingCertNotes);
    setPendingCertNotes(null);
  };

  const handleDuplicateStage = async () => {
    if (!stage) return;
    
    // If packages exist, show dialog to select source package context
    if (packagesUsing.length > 0) {
      setSourcePackageForDupe(packagesUsing[0].id);
      setDuplicateDialogOpen(true);
    } else {
      // No packages, just duplicate the stage shell
      await duplicateAndNavigate({ sourceStageId: stage.id });
    }
  };

  const confirmDuplicate = async () => {
    if (!stage) return;
    setDuplicateDialogOpen(false);
    await duplicateAndNavigate({ 
      sourceStageId: stage.id, 
      sourcePackageId: sourcePackageForDupe || undefined,
      targetPackageIds: applyToAllPackages ? packagesUsing.map(p => p.id) : undefined
    });
    setApplyToAllPackages(false);
  };

  const openReplaceDialog = () => {
    setSelectedPackagesForReplace([]);
    setReplacementStageId(null);
    setCopyContentOnReplace(true);
    setStageSearchQuery('');
    setReplaceDialogOpen(true);
  };

  const togglePackageSelection = (pkgId: number) => {
    setSelectedPackagesForReplace(prev => 
      prev.includes(pkgId) 
        ? prev.filter(id => id !== pkgId)
        : [...prev, pkgId]
    );
  };

  const selectAllPackages = () => {
    setSelectedPackagesForReplace(packagesUsing.map(p => p.id));
  };

  const selectNonePackages = () => {
    setSelectedPackagesForReplace([]);
  };

  const filteredReplacementStages = allStages.filter(s => {
    if (s.id === stageIdNum) return false; // exclude current stage
    if (stageSearchQuery) {
      const query = stageSearchQuery.toLowerCase();
      return s.title?.toLowerCase().includes(query) || s.stage_key?.toLowerCase().includes(query);
    }
    // Default: filter to same stage_type
    return stage ? s.stage_type === stage.stage_type : true;
  });

  const handleReplaceInPackages = async () => {
    if (!stageIdNum || !replacementStageId || selectedPackagesForReplace.length === 0) {
      toast({ title: 'Error', description: 'Select packages and a replacement stage', variant: 'destructive' });
      return;
    }

    const result = await replaceStageInPackages({
      oldStageId: stageIdNum,
      newStageId: replacementStageId,
      packageIds: selectedPackagesForReplace,
      copyContent: copyContentOnReplace,
    });

    if (result) {
      toast({
        title: 'Replacement Complete',
        description: `Updated ${result.updated} package(s). ${result.skipped} skipped.`,
      });
      setReplaceDialogOpen(false);
      setSelectedPackagesForReplace([]);
      fetchUsageData();
    }
  };

  // Helper to check if certified edit confirmation is needed
  const requiresCertifiedConfirmation = (): boolean => {
    return stage?.is_certified === true && !isUsedByActiveClients;
  };

  const wrapCertifiedAction = (action: () => void) => {
    if (requiresCertifiedConfirmation()) {
      setPendingCertifiedAction(() => action);
      setCertifiedEditDialogOpen(true);
    } else {
      action();
    }
  };

  // Staff Task handlers - now using stage template content
  const handleAddStaffTask = async () => {
    if (!stageIdNum || !taskForm.name.trim()) {
      toast({ title: 'Validation Error', description: 'Task name is required', variant: 'destructive' });
      return;
    }

    try {
      await addTeamTask({
        name: taskForm.name,
        description: taskForm.description || null,
        owner_role: taskForm.owner_role || 'Admin',
        estimated_hours: taskForm.estimated_hours ? parseFloat(taskForm.estimated_hours) : null,
        is_mandatory: taskForm.is_mandatory
      });
      toast({ title: 'Task Added' });
      setTaskForm({ name: '', description: '', owner_role: 'Admin', estimated_hours: '', is_mandatory: true });
      setIsAddingTask(false);
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to add task', variant: 'destructive' });
    }
  };

  const handleDeleteStaffTask = async (taskId: number) => {
    try {
      await deleteTeamTask(taskId);
      toast({ title: 'Task Deleted' });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to delete task', variant: 'destructive' });
    }
  };

  // Client Task handlers - now using stage template content
  const handleAddClientTask = async () => {
    if (!stageIdNum || !clientTaskForm.name.trim()) {
      toast({ title: 'Validation Error', description: 'Task name is required', variant: 'destructive' });
      return;
    }

    try {
      await addClientTask({
        name: clientTaskForm.name,
        description: clientTaskForm.description || null,
        instructions: clientTaskForm.instructions || null,
        due_date_offset: clientTaskForm.due_date_offset ? parseInt(clientTaskForm.due_date_offset) : null
      });
      toast({ title: 'Client Task Added' });
      setClientTaskForm({ name: '', description: '', instructions: '', due_date_offset: '' });
      setIsAddingClientTask(false);
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to add client task', variant: 'destructive' });
    }
  };

  const handleDeleteClientTask = async (taskId: number) => {
    try {
      await deleteClientTask(taskId);
      toast({ title: 'Client Task Deleted' });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to delete client task', variant: 'destructive' });
    }
  };

  // Email handlers - now using stage template content
  const handleAddEmail = async () => {
    if (!stageIdNum || !emailForm.email_template_id) {
      toast({ title: 'Validation Error', description: 'Please select an email template', variant: 'destructive' });
      return;
    }

    try {
      // Find the template name for the email record
      const template = emailTemplates.find(t => t.id === emailForm.email_template_id);
      await addEmail(template?.internal_name || 'Email', template?.subject || '', '');
      toast({ title: 'Email Added' });
      setEmailForm({ email_template_id: '', trigger_type: 'manual', recipient_type: 'tenant' });
      setIsAddingEmail(false);
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to add email', variant: 'destructive' });
    }
  };

  const handleRemoveEmail = async (emailId: number) => {
    try {
      await deleteEmail(emailId);
      toast({ title: 'Email Removed' });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to remove email', variant: 'destructive' });
    }
  };

  // Edit handlers
  const openEditTeamTask = (task: StageTeamTask) => {
    setEditTaskForm({
      name: task.name,
      description: task.description || '',
      is_core: task.is_core,
      due_date_offset: task.due_date_offset?.toString() || ''
    });
    setEditingTeamTask(task);
  };

  const handleSaveTeamTask = async () => {
    if (!editingTeamTask || !editTaskForm.name.trim()) return;
    try {
      await updateTeamTask(editingTeamTask.id, {
        name: editTaskForm.name,
        description: editTaskForm.description || null,
        is_core: editTaskForm.is_core,
        due_date_offset: editTaskForm.due_date_offset ? parseInt(editTaskForm.due_date_offset) : null
      });
      toast({ title: 'Task Updated' });
      setEditingTeamTask(null);
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to update task', variant: 'destructive' });
    }
  };

  const openEditClientTask = (task: StageClientTask) => {
    setEditClientTaskForm({
      name: task.name,
      description: task.description || '',
      instructions: task.instructions || '',
      due_date_offset: task.due_date_offset?.toString() || '',
      is_mandatory: task.is_mandatory
    });
    setEditingClientTask(task);
  };

  const handleSaveClientTask = async () => {
    if (!editingClientTask || !editClientTaskForm.name.trim()) return;
    try {
      await updateClientTask(editingClientTask.id, {
        name: editClientTaskForm.name,
        description: editClientTaskForm.description || null,
        instructions: editClientTaskForm.instructions || null,
        due_date_offset: editClientTaskForm.due_date_offset ? parseInt(editClientTaskForm.due_date_offset) : null,
        is_mandatory: editClientTaskForm.is_mandatory
      });
      toast({ title: 'Client Task Updated' });
      setEditingClientTask(null);
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to update client task', variant: 'destructive' });
    }
  };

  const openEditEmail = (email: StageEmail) => {
    setEditEmailForm({
      name: email.name || '',
      subject: email.subject || '',
      description: email.description || '',
      content: email.content || '',
      automation_enabled: email.automation_enabled
    });
    setEditingEmail(email);
  };

  const handleSaveEmail = async () => {
    if (!editingEmail || !editEmailForm.name.trim()) return;
    try {
      await updateEmail(editingEmail.id, {
        name: editEmailForm.name,
        subject: editEmailForm.subject,
        description: editEmailForm.description || null,
        content: editEmailForm.content || null,
        automation_enabled: editEmailForm.automation_enabled
      });
      toast({ title: 'Email Updated' });
      setEditingEmail(null);
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to update email', variant: 'destructive' });
    }
  };

  // Document handlers - now using stage template content
  const handleAddDocument = async (documentId: number) => {
    if (!stageIdNum) return;
    
    try {
      await addDocument(documentId);
    } catch (error: any) {
      throw error;
    }
  };

  const handleAddBulkDocuments = async (documentIds: number[]) => {
    if (!stageIdNum || documentIds.length === 0) return;
    
    try {
      await addBulkDocuments(documentIds);
    } catch (error: any) {
      throw error;
    }
  };

  const handleUpdateDocument = async (id: number, data: Record<string, any>) => {
    try {
      await updateDocument(id, data);
    } catch (error: any) {
      throw error;
    }
  };

  const handleRemoveDocument = async (id: number) => {
    try {
      await deleteDocument(id);
    } catch (error: any) {
      throw error;
    }
  };

  const handleReorderDocuments = async (orderedIds: number[]) => {
    try {
      await reorderDocuments(orderedIds);
    } catch (error: any) {
      throw error;
    }
  };

  const getStageTypeColor = (stageType: string) => {
    return getStageTypeColorHelper(stageType, STAGE_TYPE_OPTIONS) + ' border-border';
  };

  // Access denied for non-SuperAdmins
  if (!isSuperAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-4">
          <ShieldX className="h-16 w-16 mx-auto text-destructive/50" />
          <h2 className="text-xl font-semibold">Access Denied</h2>
          <p className="text-muted-foreground">You need Super Admin privileges to access this page.</p>
        </div>
      </div>
    );
  }

  // Render info badge showing package reuse count
  const renderReuseInfoBadge = () => {
    if (usageCount === 0) return null;
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
        <Package className="h-4 w-4" />
        <span>
          Used in {usageCount} package{usageCount !== 1 ? 's' : ''}
          {overrideCount > 0 && (
            <span className="ml-2 text-amber-600">
              ({overrideCount} with overrides)
            </span>
          )}
        </span>
      </div>
    );
  };

  return (
    <div className="p-6 animate-fade-in max-w-7xl mx-auto">
      {/* Back Button */}
      <div className="mb-4">
        <Button variant="ghost" asChild className="gap-2 hover:bg-muted">
          <Link to="/admin/stages">
            <ArrowLeft className="h-4 w-4" />
            Back to Stages
          </Link>
        </Button>
      </div>

      {/* Two-Column Header Layout: Stage Info + Quality Check */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start mb-6">
        {/* Left Column: Header Info */}
        <div className="space-y-3 min-w-0">
          {/* Stage Header */}
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-8 w-[300px]" />
              <Skeleton className="h-5 w-[200px]" />
            </div>
          ) : stage ? (
            <>
              <div className="flex items-center gap-3 flex-wrap">
                <Layers className="h-7 w-7 shrink-0" />
                <h1 className="text-2xl font-bold">{stage.title}</h1>
                <Badge variant="outline" className={`text-xs capitalize ${getStageTypeColor(stage.stage_type)}`}>
                  {getStageTypeLabel(stage.stage_type, STAGE_TYPE_OPTIONS)}
                </Badge>
                {stage.is_certified && (
                  <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                    <ShieldCheck className="h-3 w-3 mr-1" />
                    Certified
                  </Badge>
                )}
                {usageCount > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    Used in {usageCount} package{usageCount !== 1 ? 's' : ''}
                  </Badge>
                )}
              </div>
              
              {stage.stage_key && (
                <p className="text-sm text-muted-foreground font-mono">Key: {stage.stage_key}</p>
              )}

              {(stage as any).version_label && (
                <p className="text-sm font-medium text-muted-foreground">
                  Version: <span className="text-foreground">{(stage as any).version_label}</span>
                </p>
              )}

              {stage.description && (
                <p className="text-muted-foreground">{stage.description}</p>
              )}

              {/* Action Buttons Row */}
              <div className="flex items-center gap-2 flex-wrap pt-1">
                {isSuperAdmin && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSimulationOpen(true)}
                  >
                    <Play className="h-3 w-3 mr-1" />
                    Simulate Stage
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (packagesUsing.length > 0) {
                      setExportDialogOpen(true);
                    } else {
                      downloadExport(stage.id, stage.title);
                    }
                  }}
                  disabled={isExporting}
                >
                  <Download className="h-3 w-3 mr-1" />
                  {isExporting ? 'Exporting...' : 'Export'}
                </Button>
                
                {/* Version Controls */}
                <div className="ml-auto">
                  <StageVersionHeader
                    stageId={stage.id}
                    stageName={stage.title}
                    isCertified={stage.is_certified || false}
                    versions={versions}
                    latestPublished={latestPublished}
                    certifiedCheck={certifiedEditCheck}
                    onPublish={(notes) => publishVersion({ notes })}
                    isPublishing={isPublishing}
                    onViewVersion={(v) => setViewingVersion(v)}
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-8">
              <p className="text-muted-foreground">Stage not found</p>
            </div>
          )}
        </div>

        {/* Right Column: Quality Check + Impact Panel */}
        {stage && (
          <div className="lg:sticky lg:top-6 self-start space-y-4">
            <StageQualityPanel 
              result={qualityResult} 
              isLoading={qualityLoading}
              onRefresh={refetchQuality}
            />
            <StageImpactPanel
              stageId={stage.id}
              stageName={stage.title}
            />
          </div>
        )}
      </div>

      {/* Warnings - Full Width */}
      {stage && (
        <div className="space-y-3 mb-6">
          {isUsedByActiveClients && (
            <Alert className="border-destructive/30 bg-destructive/5">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <AlertTitle className="text-destructive">This stage is in use by active clients</AlertTitle>
              <AlertDescription className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-destructive/80">
                  {activeUsage.clients.length} active client{activeUsage.clients.length !== 1 ? 's' : ''} are using this stage. 
                  Editing may affect their ongoing work.
                </span>
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={handleDuplicateStage}
                  disabled={isDuplicating}
                  className="border-destructive/30 text-destructive hover:bg-destructive/10"
                >
                  <Copy className="h-3 w-3 mr-1" />
                  {isDuplicating ? 'Duplicating...' : 'Duplicate & Edit Copy'}
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {stage.is_certified && !isUsedByActiveClients && (
            <Alert className="border-amber-500/30 bg-amber-500/5">
              <ShieldCheck className="h-4 w-4 text-amber-600" />
              <AlertDescription className="flex items-center justify-between gap-2 flex-wrap text-amber-800">
                <span>This is a certified template. Prefer duplicating before making major edits.</span>
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={handleDuplicateStage}
                  disabled={isDuplicating}
                >
                  <Copy className="h-3 w-3 mr-1" />
                  {isDuplicating ? 'Duplicating...' : 'Duplicate Stage'}
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {isReused && !isUsedByActiveClients && !stage.is_certified && (
            <Alert className="border-blue-500/30 bg-blue-500/5">
              <Info className="h-4 w-4 text-blue-600" />
              <AlertDescription className="text-blue-800">
                This stage is shared across {usageCount} packages. Changes will affect all of them.
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}

      {/* Tabs - Full Width */}
      {stage && (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-7">
            <TabsTrigger value="settings" className="text-xs">
              <Settings className="h-3 w-3 mr-1" />
              Settings
            </TabsTrigger>
            <TabsTrigger value="team-tasks" className="text-xs">
              <Users className="h-3 w-3 mr-1" />
              Team Tasks
            </TabsTrigger>
            <TabsTrigger value="client-tasks" className="text-xs">
              <CheckSquare className="h-3 w-3 mr-1" />
              Client Tasks
            </TabsTrigger>
            <TabsTrigger value="emails" className="text-xs">
              <Mail className="h-3 w-3 mr-1" />
              Emails
            </TabsTrigger>
            <TabsTrigger value="documents" className="text-xs">
              <FileText className="h-3 w-3 mr-1" />
              Documents
            </TabsTrigger>
            <TabsTrigger value="usage" className="text-xs">
              <BarChart3 className="h-3 w-3 mr-1" />
              Usage
            </TabsTrigger>
            <TabsTrigger value="audit" className="text-xs">
              <History className="h-3 w-3 mr-1" />
              Audit Log
            </TabsTrigger>
          </TabsList>

          {/* Settings Tab */}
          <TabsContent value="settings">
            <Card>
              <CardHeader>
                <CardTitle>Stage Settings</CardTitle>
                <CardDescription>Configure the basic properties of this stage.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Stage Name</Label>
                    <Input
                      value={stage.title || ''}
                      onChange={(e) => handleUpdateStage({ title: e.target.value })}
                      placeholder="e.g., Client Onboarding"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Stage Type</Label>
                    <Select 
                      value={stage.stage_type || 'delivery'} 
                      onValueChange={(value) => handleUpdateStage({ stage_type: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STAGE_TYPE_OPTIONS.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea
                    value={stage.description || ''}
                    onChange={(e) => handleUpdateStage({ description: e.target.value })}
                    placeholder="Describe what this stage involves..."
                    rows={3}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Short Name</Label>
                    <Input
                      value={stage.short_name || ''}
                      onChange={(e) => handleUpdateStage({ short_name: e.target.value })}
                      placeholder="e.g., Onboard"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Stage Key (read-only)</Label>
                    <Input value={stage.stage_key || ''} disabled className="font-mono text-sm" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Video URL (optional)</Label>
                  <Input
                    value={stage.video_url || ''}
                    onChange={(e) => handleUpdateStage({ video_url: e.target.value })}
                    placeholder="https://youtube.com/..."
                  />
                </div>

                <div className="space-y-2">
                  <Label>Stage Version Label</Label>
                  <Input
                    value={(stage as any).version_label || ''}
                    onChange={(e) => handleUpdateVersionLabel(e.target.value)}
                    placeholder="e.g., v2025.1, July 2026"
                  />
                  <p className="text-xs text-muted-foreground">
                    Optional. Used to identify the release of this stage for audit and rollout clarity.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>AI Hint (optional)</Label>
                  <Textarea
                    value={stage.ai_hint || ''}
                    onChange={(e) => handleUpdateStage({ ai_hint: e.target.value })}
                    placeholder="Hints for AI suggestions..."
                    rows={2}
                  />
                </div>

                {/* Frameworks Section */}
                <div className="space-y-2 pt-4 border-t">
                  <Label className="flex items-center gap-2">
                    <Globe className="h-4 w-4" />
                    Applicable Frameworks
                  </Label>
                  <StageFrameworkSelector
                    selectedFrameworks={localFrameworks}
                    onChange={handleUpdateFrameworks}
                  />
                  <p className="text-xs text-muted-foreground">
                    Indicates which regulatory frameworks this stage is designed for.
                  </p>
                </div>

                {/* Dependencies Section */}
                <div className="space-y-2 pt-4 border-t">
                  <Label className="flex items-center gap-2">
                    <Link2 className="h-4 w-4" />
                    Required Stages
                  </Label>
                  <StageDependencySelector
                    currentStageKey={stage.stage_key}
                    selectedStageKeys={localDependencies}
                    onChange={handleUpdateDependencies}
                  />
                  <p className="text-xs text-muted-foreground">
                    Select stages that must also exist in a package when this stage is used.
                  </p>
                </div>

                <div className="flex items-center gap-6 pt-4 border-t">
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={stage.is_reusable ?? true}
                      onCheckedChange={(checked) => handleUpdateStage({ is_reusable: checked })}
                      disabled={isReused}
                    />
                    <Label>{isReused ? 'Reusable (cannot change)' : 'Reusable'}</Label>
                  </div>
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={stage.dashboard_visible ?? true}
                      onCheckedChange={(checked) => handleUpdateStage({ dashboard_visible: checked })}
                    />
                    <Label>Dashboard Visible</Label>
                  </div>
                </div>

                {/* Standards Mapping Section */}
                {isSuperAdmin && (
                  <div className="pt-4 border-t">
                    <StageStandardsSelector
                      stageId={stageIdNum!}
                      frameworks={localFrameworks}
                      selectedStandards={stage.covers_standards || null}
                      onUpdate={(standards) => {
                        setStage(prev => prev ? { ...prev, covers_standards: standards } : null);
                      }}
                      userId={null}
                      disabled={false}
                    />
                  </div>
                )}

                {/* Certification Section */}
                <div className="pt-4 border-t space-y-4">
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={stage.is_certified ?? false}
                      onCheckedChange={(checked) => handleUpdateCertification(checked, stage.certified_notes || null)}
                      disabled={isCertUpdating}
                    />
                    <Label className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4" />
                      Certified Template
                    </Label>
                  </div>
                  {stage.is_certified && (
                    <div className="space-y-2">
                      <Label>Certification Notes</Label>
                      <Textarea
                        value={stage.certified_notes || ''}
                        onChange={(e) => handleUpdateCertification(true, e.target.value)}
                        placeholder="Notes about why this stage is certified..."
                        rows={2}
                        disabled={isCertUpdating}
                      />
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Team Tasks Tab */}
          <TabsContent value="team-tasks">
            {renderReuseInfoBadge()}
            {loadingTemplateContent ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base">Team Tasks</CardTitle>
                      <CardDescription>{teamTasks.length} tasks configured</CardDescription>
                    </div>
                    <Button size="sm" onClick={() => wrapCertifiedAction(() => setIsAddingTask(true))}>
                      <Plus className="h-3 w-3 mr-1" />
                      Add Task
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[400px]">
                    {teamTasks.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 text-center">
                        <Users className="h-10 w-10 text-muted-foreground mb-3" />
                        <p className="text-muted-foreground">No team tasks configured</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {teamTasks.map((task) => (
                          <div key={task.id} className="flex items-start gap-2 p-3 rounded-lg border bg-muted/30">
                            <GripVertical className="h-4 w-4 text-muted-foreground mt-0.5 cursor-grab" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{task.name}</span>
                                {task.is_mandatory && (
                                  <Badge variant="secondary" className="text-xs">Required</Badge>
                                )}
                              </div>
                              {task.description && (
                                <p className="text-sm text-muted-foreground mt-1 line-clamp-1">{task.description}</p>
                              )}
                              <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <User className="h-3 w-3" />
                                  {task.owner_role}
                                </span>
                                {task.estimated_hours && (
                                  <span className="flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    {task.estimated_hours}h
                                  </span>
                                )}
                              </div>
                            </div>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => wrapCertifiedAction(() => openEditTeamTask(task))}>
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => wrapCertifiedAction(() => handleDeleteStaffTask(task.id))}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Client Tasks Tab */}
          <TabsContent value="client-tasks">
            {renderReuseInfoBadge()}
            {loadingTemplateContent ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base">Client Tasks</CardTitle>
                      <CardDescription>{clientTasks.length} tasks visible to tenants</CardDescription>
                    </div>
                    <Button size="sm" onClick={() => wrapCertifiedAction(() => setIsAddingClientTask(true))}>
                      <Plus className="h-3 w-3 mr-1" />
                      Add Task
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[400px]">
                    {clientTasks.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 text-center">
                        <CheckSquare className="h-10 w-10 text-muted-foreground mb-3" />
                        <p className="text-muted-foreground">No client tasks configured</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {clientTasks.map((task) => (
                          <div key={task.id} className="flex items-start gap-2 p-3 rounded-lg border bg-muted/30">
                            <GripVertical className="h-4 w-4 text-muted-foreground mt-0.5 cursor-grab" />
                            <div className="flex-1 min-w-0">
                              <span className="font-medium block">{task.name}</span>
                              {task.description && (
                                <p className="text-sm text-muted-foreground mt-1 line-clamp-1">{task.description}</p>
                              )}
                              {task.due_date_offset && (
                                <span className="text-xs text-muted-foreground mt-1 block">
                                  Due: +{task.due_date_offset} days from stage start
                                </span>
                              )}
                            </div>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => wrapCertifiedAction(() => openEditClientTask(task))}>
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => wrapCertifiedAction(() => handleDeleteClientTask(task.id))}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Emails Tab */}
          <TabsContent value="emails">
            {renderReuseInfoBadge()}
            {loadingTemplateContent ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base">Email Triggers</CardTitle>
                      <CardDescription>{stageEmails.length} emails configured</CardDescription>
                    </div>
                    <Button size="sm" onClick={() => wrapCertifiedAction(() => setIsAddingEmail(true))}>
                      <Plus className="h-3 w-3 mr-1" />
                      Add Email
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[400px]">
                    {stageEmails.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 text-center">
                        <Mail className="h-10 w-10 text-muted-foreground mb-3" />
                        <p className="text-muted-foreground">No emails configured</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {stageEmails.map((email) => {
                          return (
                            <div key={email.id} className="flex items-start gap-2 p-3 rounded-lg border bg-muted/30">
                              <Mail className="h-4 w-4 text-muted-foreground mt-0.5" />
                              <div className="flex-1 min-w-0">
                                <span className="font-medium block">{email.name || email.subject || 'Untitled Email'}</span>
                                {email.subject && (
                                  <p className="text-sm text-muted-foreground mt-1 line-clamp-1">{email.subject}</p>
                                )}
                                <div className="flex items-center gap-2 mt-1">
                                  {email.automation_enabled && (
                                    <Badge variant="outline" className="text-xs">Auto</Badge>
                                  )}
                                </div>
                              </div>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => wrapCertifiedAction(() => openEditEmail(email))}>
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => wrapCertifiedAction(() => handleRemoveEmail(email.id))}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Documents Tab */}
          <TabsContent value="documents">
            {renderReuseInfoBadge()}
            <StageDocumentsPanel
              stageId={stageIdNum!}
              documents={stageDocuments as any}
              loading={loadingTemplateContent}
              onRefresh={refetchTemplateContent}
              onDelete={deleteDocument}
              onUpdate={updateDocument as any}
              isCertified={stage?.is_certified ?? false}
              wrapCertifiedAction={wrapCertifiedAction}
            />
          </TabsContent>

          {/* Usage and Impact Tab */}
          <TabsContent value="usage">
            <Card>
              <CardHeader>
                <CardTitle>Usage and Impact</CardTitle>
                <CardDescription>See where this stage is used across packages and clients.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Packages using this stage */}
                <div>
                  <h3 className="font-semibold mb-3">Packages Using This Stage ({packagesUsing.length})</h3>
                  {packagesUsing.length === 0 ? (
                    <p className="text-muted-foreground text-sm">This stage is not used in any packages.</p>
                  ) : (
                    <div className="border rounded-lg divide-y">
                      {packagesUsing.map(pkg => (
                        <div key={pkg.id} className="flex items-center justify-between p-3">
                          <div className="flex items-center gap-2">
                            <Package className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{pkg.name}</span>
                          </div>
                          <Badge variant="outline" className="text-xs">{pkg.status}</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Active clients */}
                <div>
                  <h3 className="font-semibold mb-3">Active Clients ({activeUsage.clients.length})</h3>
                  {activeUsage.clients.length === 0 ? (
                    <p className="text-muted-foreground text-sm">No active clients are using this stage.</p>
                  ) : (
                    <div className="border rounded-lg divide-y">
                      {activeUsage.clients.map(client => (
                        <div key={client.tenant_id} className="flex items-center gap-2 p-3">
                          <Users className="h-4 w-4 text-muted-foreground" />
                          <span>{client.tenant_name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="pt-4 border-t">
                  <h3 className="font-semibold mb-3">Actions</h3>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={handleDuplicateStage} disabled={isDuplicating}>
                      <Copy className="h-4 w-4 mr-2" />
                      {isDuplicating ? 'Duplicating...' : 'Duplicate Stage'}
                    </Button>
                    <Button 
                      variant="outline" 
                      onClick={openReplaceDialog} 
                      disabled={packagesUsing.length === 0}
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Replace in Packages
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Audit Log Tab */}
          <TabsContent value="audit">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Audit Log</CardTitle>
                    <CardDescription>Track changes made to this stage.</CardDescription>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => refetchAudit()}>
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Refresh
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Filters */}
                <div className="flex flex-wrap items-center gap-3 pb-4 border-b">
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground whitespace-nowrap">From:</Label>
                    <Input
                      type="date"
                      className="w-[140px] h-8 text-xs"
                      value={auditDateFrom ? format(auditDateFrom, 'yyyy-MM-dd') : ''}
                      onChange={(e) => setAuditDateFrom(e.target.value ? new Date(e.target.value) : undefined)}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground whitespace-nowrap">To:</Label>
                    <Input
                      type="date"
                      className="w-[140px] h-8 text-xs"
                      value={auditDateTo ? format(auditDateTo, 'yyyy-MM-dd') : ''}
                      onChange={(e) => setAuditDateTo(e.target.value ? new Date(e.target.value) : undefined)}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground whitespace-nowrap">Action:</Label>
                    <Select value={auditActionFilter} onValueChange={setAuditActionFilter}>
                      <SelectTrigger className="w-[160px] h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Actions</SelectItem>
                        {uniqueActions.map(action => (
                          <SelectItem key={action} value={action}>
                            {formatActionName(action)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {(auditDateFrom || auditDateTo || auditActionFilter !== 'all') && (
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-8 text-xs"
                      onClick={() => {
                        setAuditDateFrom(undefined);
                        setAuditDateTo(undefined);
                        setAuditActionFilter('all');
                      }}
                    >
                      Clear Filters
                    </Button>
                  )}
                </div>

                {auditLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : auditEvents.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center border rounded-lg border-dashed bg-muted/20">
                    <History className="h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="font-semibold text-lg mb-2">No Audit Events</h3>
                    <p className="text-muted-foreground max-w-md">
                      {auditDateFrom || auditDateTo || auditActionFilter !== 'all' 
                        ? 'No events match your filters.' 
                        : 'No changes have been recorded for this stage yet.'}
                    </p>
                  </div>
                ) : (
                  <ScrollArea className="h-[500px]">
                    <div className="space-y-2">
                      {auditEvents.map((event) => (
                        <Collapsible key={event.id}>
                          <div className="border rounded-lg p-3 bg-muted/20">
                            <CollapsibleTrigger className="flex items-start gap-3 w-full text-left">
                              <ChevronRight className="h-4 w-4 mt-0.5 text-muted-foreground transition-transform data-[state=open]:rotate-90" />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <Badge variant="outline" className="text-xs">
                                    {formatActionName(event.action)}
                                  </Badge>
                                  <span className="text-xs text-muted-foreground">
                                    {format(new Date(event.created_at), 'PPp')}
                                  </span>
                                </div>
                                <p className="text-sm mt-1">
                                  {generateAuditSummary(event.action, event.details)}
                                </p>
                                {event.user_name && (
                                  <p className="text-xs text-muted-foreground mt-1">
                                    by {event.user_name}
                                  </p>
                                )}
                              </div>
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                              <div className="mt-3 pt-3 border-t">
                                <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
                                  {JSON.stringify(event.details, null, 2)}
                                </pre>
                              </div>
                            </CollapsibleContent>
                          </div>
                        </Collapsible>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
      {/* Dialogs */}
      
      {/* Add Staff Task Dialog */}
      <Dialog open={isAddingTask} onOpenChange={setIsAddingTask}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Team Task</DialogTitle>
            <DialogDescription>Create a new task for team members.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Task Name *</Label>
              <Input
                value={taskForm.name}
                onChange={(e) => setTaskForm({ ...taskForm, name: e.target.value })}
                placeholder="e.g., Schedule kickoff call"
              />
            </div>
            <div className="space-y-2">
              <Label>Instructions</Label>
              <Textarea
                value={taskForm.description}
                onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
                placeholder="Describe what needs to be done..."
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Owner Role</Label>
                <Select value={taskForm.owner_role} onValueChange={(v) => setTaskForm({ ...taskForm, owner_role: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SuperAdmin">SuperAdmin</SelectItem>
                    <SelectItem value="Admin">Admin</SelectItem>
                    <SelectItem value="CSC">CSC</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Estimated Hours</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.25}
                  value={taskForm.estimated_hours}
                  onChange={(e) => setTaskForm({ ...taskForm, estimated_hours: e.target.value })}
                  placeholder="e.g., 1.5"
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={taskForm.is_mandatory} onCheckedChange={(c) => setTaskForm({ ...taskForm, is_mandatory: c })} />
              <Label>Mandatory task</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddingTask(false)}>Cancel</Button>
            <Button onClick={handleAddStaffTask}>Add Task</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Client Task Dialog */}
      <Dialog open={isAddingClientTask} onOpenChange={setIsAddingClientTask}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Client Task</DialogTitle>
            <DialogDescription>Create a task visible to tenants.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Task Name *</Label>
              <Input
                value={clientTaskForm.name}
                onChange={(e) => setClientTaskForm({ ...clientTaskForm, name: e.target.value })}
                placeholder="e.g., Complete onboarding form"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={clientTaskForm.description}
                onChange={(e) => setClientTaskForm({ ...clientTaskForm, description: e.target.value })}
                placeholder="Brief description..."
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label>Instructions</Label>
              <Textarea
                value={clientTaskForm.instructions}
                onChange={(e) => setClientTaskForm({ ...clientTaskForm, instructions: e.target.value })}
                placeholder="Detailed instructions..."
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>Due Offset (days)</Label>
              <Input
                type="number"
                min={0}
                value={clientTaskForm.due_date_offset}
                onChange={(e) => setClientTaskForm({ ...clientTaskForm, due_date_offset: e.target.value })}
                placeholder="e.g., 7"
              />
              <p className="text-xs text-muted-foreground">Days after stage start when due</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddingClientTask(false)}>Cancel</Button>
            <Button onClick={handleAddClientTask}>Add Task</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Email Dialog */}
      <Dialog open={isAddingEmail} onOpenChange={setIsAddingEmail}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Email Trigger</DialogTitle>
            <DialogDescription>Configure an email to be sent during this stage.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Email Template *</Label>
              <Select value={emailForm.email_template_id} onValueChange={(v) => setEmailForm({ ...emailForm, email_template_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select a template..." /></SelectTrigger>
                <SelectContent>
                  {emailTemplates.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.internal_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Trigger</Label>
                <Select value={emailForm.trigger_type} onValueChange={(v) => setEmailForm({ ...emailForm, trigger_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="on_stage_start">On Stage Start</SelectItem>
                    <SelectItem value="on_task_complete">On Task Complete</SelectItem>
                    <SelectItem value="manual">Manual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Recipient</Label>
                <Select value={emailForm.recipient_type} onValueChange={(v) => setEmailForm({ ...emailForm, recipient_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="internal">Internal (Team)</SelectItem>
                    <SelectItem value="tenant">Tenant</SelectItem>
                    <SelectItem value="both">Both</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddingEmail(false)}>Cancel</Button>
            <Button onClick={handleAddEmail}>Add Email</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Team Task Dialog */}
      <Dialog open={!!editingTeamTask} onOpenChange={(open) => !open && setEditingTeamTask(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Team Task</DialogTitle>
            <DialogDescription>Update task details.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Task Name *</Label>
              <Input
                value={editTaskForm.name}
                onChange={(e) => setEditTaskForm({ ...editTaskForm, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Instructions</Label>
              <Textarea
                value={editTaskForm.description}
                onChange={(e) => setEditTaskForm({ ...editTaskForm, description: e.target.value })}
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Due Offset (days)</Label>
                <Input
                  type="number"
                  min={0}
                  value={editTaskForm.due_date_offset}
                  onChange={(e) => setEditTaskForm({ ...editTaskForm, due_date_offset: e.target.value })}
                  placeholder="e.g., 14"
                />
              </div>
              <div className="flex items-center gap-3 pt-6">
                <Switch checked={editTaskForm.is_core} onCheckedChange={(c) => setEditTaskForm({ ...editTaskForm, is_core: c })} />
                <Label>Core task</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingTeamTask(null)}>Cancel</Button>
            <Button onClick={handleSaveTeamTask}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Client Task Dialog */}
      <Dialog open={!!editingClientTask} onOpenChange={(open) => !open && setEditingClientTask(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Client Task</DialogTitle>
            <DialogDescription>Update task visible to tenants.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Task Name *</Label>
              <Input
                value={editClientTaskForm.name}
                onChange={(e) => setEditClientTaskForm({ ...editClientTaskForm, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={editClientTaskForm.description}
                onChange={(e) => setEditClientTaskForm({ ...editClientTaskForm, description: e.target.value })}
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label>Instructions</Label>
              <Textarea
                value={editClientTaskForm.instructions}
                onChange={(e) => setEditClientTaskForm({ ...editClientTaskForm, instructions: e.target.value })}
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Due Offset (days)</Label>
                <Input
                  type="number"
                  min={0}
                  value={editClientTaskForm.due_date_offset}
                  onChange={(e) => setEditClientTaskForm({ ...editClientTaskForm, due_date_offset: e.target.value })}
                  placeholder="e.g., 7"
                />
              </div>
              <div className="flex items-center gap-3 pt-6">
                <Switch checked={editClientTaskForm.is_mandatory} onCheckedChange={(c) => setEditClientTaskForm({ ...editClientTaskForm, is_mandatory: c })} />
                <Label>Mandatory</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingClientTask(null)}>Cancel</Button>
            <Button onClick={handleSaveClientTask}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Email Dialog */}
      <Dialog open={!!editingEmail} onOpenChange={(open) => !open && setEditingEmail(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Email</DialogTitle>
            <DialogDescription>Update email template details.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Name *</Label>
                <Input
                  value={editEmailForm.name}
                  onChange={(e) => setEditEmailForm({ ...editEmailForm, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Subject</Label>
                <Input
                  value={editEmailForm.subject}
                  onChange={(e) => setEditEmailForm({ ...editEmailForm, subject: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description (internal notes)</Label>
              <Textarea
                value={editEmailForm.description}
                onChange={(e) => setEditEmailForm({ ...editEmailForm, description: e.target.value })}
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label>Content (HTML body)</Label>
              <Textarea
                value={editEmailForm.content}
                onChange={(e) => setEditEmailForm({ ...editEmailForm, content: e.target.value })}
                rows={8}
                className="font-mono text-xs"
              />
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={editEmailForm.automation_enabled} onCheckedChange={(c) => setEditEmailForm({ ...editEmailForm, automation_enabled: c })} />
              <Label>Automation enabled</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingEmail(null)}>Cancel</Button>
            <Button onClick={handleSaveEmail}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Confirmation Dialog with typed phrase */}
      <AlertDialog open={editConfirmationOpen} onOpenChange={(open) => {
        setEditConfirmationOpen(open);
        if (!open) setConfirmPhrase('');
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Confirm Edit to Active Stage
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  This stage is currently being used by <strong>{activeUsage.clients.length} active client{activeUsage.clients.length !== 1 ? 's' : ''}</strong>. 
                  Changes will affect their ongoing packages.
                </p>
                {activeUsage.clients.length > 0 && activeUsage.clients.length <= 5 && (
                  <div className="text-sm">
                    <p className="font-medium mb-1">Affected clients:</p>
                    <ul className="list-disc list-inside text-muted-foreground">
                      {activeUsage.clients.map(c => (
                        <li key={c.tenant_id}>{c.tenant_name}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="pt-2">
                  <p className="text-sm mb-2">Type <strong>{CONFIRM_PHRASE_REQUIRED}</strong> to confirm:</p>
                  <Input 
                    value={confirmPhrase}
                    onChange={(e) => setConfirmPhrase(e.target.value)}
                    placeholder={CONFIRM_PHRASE_REQUIRED}
                    className="font-mono"
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmAndApplyUpdate} 
              disabled={confirmPhrase !== CONFIRM_PHRASE_REQUIRED}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Edit Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Duplicate Stage Dialog */}
      <Dialog open={duplicateDialogOpen} onOpenChange={setDuplicateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Copy className="h-5 w-5" />
              Duplicate Stage
            </DialogTitle>
            <DialogDescription>
              Create a copy of this stage with all its content.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                The new stage will not be certified and will have a new unique stage key.
              </AlertDescription>
            </Alert>
            
            {packagesUsing.length > 0 && (
              <>
                <div className="space-y-2">
                  <Label>Source Package Context</Label>
                  <p className="text-sm text-muted-foreground">
                    Select which package's tasks, emails, and documents to copy.
                  </p>
                  <Select 
                    value={sourcePackageForDupe?.toString() || ''} 
                    onValueChange={(val) => setSourcePackageForDupe(val ? parseInt(val) : null)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a package..." />
                    </SelectTrigger>
                    <SelectContent>
                      {packagesUsing.map(pkg => (
                        <SelectItem key={pkg.id} value={pkg.id.toString()}>
                          {pkg.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="flex items-center gap-3 pt-2">
                  <Checkbox 
                    id="applyToAll" 
                    checked={applyToAllPackages}
                    onCheckedChange={(checked) => setApplyToAllPackages(checked === true)}
                  />
                  <Label htmlFor="applyToAll" className="text-sm cursor-pointer">
                    Apply copied content to all packages using this stage ({packagesUsing.length})
                  </Label>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDuplicateDialogOpen(false)}>Cancel</Button>
            <Button onClick={confirmDuplicate} disabled={isDuplicating}>
              {isDuplicating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Duplicating...
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-2" />
                  Duplicate
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Replace Stage in Packages Dialog */}
      <Dialog open={replaceDialogOpen} onOpenChange={setReplaceDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5" />
              Replace Stage in Packages
            </DialogTitle>
            <DialogDescription>
              Swap this stage for another in selected packages. This only updates package templates, not active client instances.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {isUsedByActiveClients && (
              <Alert className="border-amber-500/30 bg-amber-500/5">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertTitle className="text-amber-800">Active clients warning</AlertTitle>
                <AlertDescription className="text-amber-700 text-sm">
                  This will update package templates only. Active client instances will continue using the current stage.
                </AlertDescription>
              </Alert>
            )}

            {/* Package Selection */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Select Packages to Update</Label>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={selectAllPackages}>Select All</Button>
                  <Button variant="ghost" size="sm" onClick={selectNonePackages}>Select None</Button>
                </div>
              </div>
              <div className="border rounded-lg divide-y max-h-[200px] overflow-y-auto">
                {packagesUsing.map(pkg => (
                  <div 
                    key={pkg.id} 
                    className="flex items-center gap-3 p-3 hover:bg-muted/50 cursor-pointer"
                    onClick={() => togglePackageSelection(pkg.id)}
                  >
                    <Checkbox 
                      checked={selectedPackagesForReplace.includes(pkg.id)}
                      onCheckedChange={() => togglePackageSelection(pkg.id)}
                    />
                    <div className="flex items-center gap-2 flex-1">
                      <Package className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{pkg.name}</span>
                    </div>
                    <Badge variant="outline" className="text-xs">{pkg.status}</Badge>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {selectedPackagesForReplace.length} of {packagesUsing.length} packages selected
              </p>
            </div>

            {/* Replacement Stage Selection */}
            <div className="space-y-2">
              <Label>Replacement Stage</Label>
              <Input
                placeholder="Search stages by name or key..."
                value={stageSearchQuery}
                onChange={(e) => setStageSearchQuery(e.target.value)}
                className="mb-2"
              />
              <div className="border rounded-lg divide-y max-h-[200px] overflow-y-auto">
                {filteredReplacementStages.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground text-sm">
                    {stageSearchQuery ? 'No stages match your search' : 'No compatible stages found'}
                  </div>
                ) : (
                  filteredReplacementStages.map(s => (
                    <div 
                      key={s.id} 
                      className={`flex items-center gap-3 p-3 cursor-pointer transition-colors ${
                        replacementStageId === s.id ? 'bg-primary/10 border-l-2 border-primary' : 'hover:bg-muted/50'
                      }`}
                      onClick={() => setReplacementStageId(s.id)}
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{s.title}</span>
                          {s.is_certified && (
                            <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-xs">
                              <ShieldCheck className="h-3 w-3 mr-1" />
                              Certified
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground font-mono">{s.stage_key}</p>
                      </div>
                      <Badge variant="outline" className="text-xs capitalize">{s.stage_type}</Badge>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Copy content option */}
            <div className="flex items-center gap-3 pt-2">
              <Checkbox 
                id="copyContent" 
                checked={copyContentOnReplace}
                onCheckedChange={(checked) => setCopyContentOnReplace(checked === true)}
              />
              <div>
                <Label htmlFor="copyContent" className="text-sm cursor-pointer">
                  Copy stage content to replacement
                </Label>
                <p className="text-xs text-muted-foreground">
                  Copy tasks, emails, and documents from the old stage to the new stage for each package
                </p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReplaceDialogOpen(false)}>Cancel</Button>
            <Button 
              onClick={handleReplaceInPackages} 
              disabled={isReplacing || selectedPackagesForReplace.length === 0 || !replacementStageId}
            >
              {isReplacing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Replacing...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Replace in {selectedPackagesForReplace.length} Package{selectedPackagesForReplace.length !== 1 ? 's' : ''}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Certified Edit Confirmation Dialog */}
      <AlertDialog open={certifiedEditDialogOpen} onOpenChange={(open) => {
        setCertifiedEditDialogOpen(open);
        if (!open) {
          setCertifiedConfirmPhrase('');
          setPendingCertifiedAction(null);
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-amber-600" />
              Edit Certified Template
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  This is a <strong>certified template</strong>. Editing it directly may affect consistency 
                  across packages using this stage.
                </p>
                <div className="flex gap-2 py-2">
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      setCertifiedEditDialogOpen(false);
                      handleDuplicateStage();
                    }}
                    className="flex-1"
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    Duplicate and Edit Copy
                    <Badge variant="secondary" className="ml-2 text-xs">Recommended</Badge>
                  </Button>
                </div>
                <div className="pt-2 border-t">
                  <p className="text-sm mb-2">Or type <strong>{CERTIFIED_CONFIRM_PHRASE}</strong> to edit anyway:</p>
                  <Input 
                    value={certifiedConfirmPhrase}
                    onChange={(e) => setCertifiedConfirmPhrase(e.target.value.toUpperCase())}
                    placeholder={CERTIFIED_CONFIRM_PHRASE}
                    className="font-mono"
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={async () => {
                if (pendingCertifiedAction) {
                  // Log audit event for certified edit
                  await supabase.from('audit_events').insert({
                    entity: 'stage',
                    entity_id: stageIdNum?.toString() || '',
                    action: 'stage.certified_edited',
                    details: { stage_title: stage?.title },
                  });
                  pendingCertifiedAction();
                }
                setCertifiedEditDialogOpen(false);
                setCertifiedConfirmPhrase('');
                setPendingCertifiedAction(null);
              }} 
              disabled={certifiedConfirmPhrase !== CERTIFIED_CONFIRM_PHRASE}
              className="bg-amber-600 text-white hover:bg-amber-700"
            >
              Edit Certified Template
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Export Package Context Dialog */}
      <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download className="h-5 w-5" />
              Export Stage
            </DialogTitle>
            <DialogDescription>
              Select a package context to include tasks, emails, and documents in the export.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Package Context</Label>
              <Select value={exportPackageId} onValueChange={setExportPackageId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a package..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No package (stage only)</SelectItem>
                  {packagesUsing.map(pkg => (
                    <SelectItem key={pkg.id} value={pkg.id.toString()}>
                      {pkg.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Tasks, emails, and documents are package-specific. Select a package to include them.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExportDialogOpen(false)}>Cancel</Button>
            <Button 
              onClick={() => {
                if (stage) {
                  downloadExport(
                    stage.id, 
                    stage.title, 
                    exportPackageId && exportPackageId !== 'none' ? parseInt(exportPackageId) : undefined
                  );
                }
                setExportDialogOpen(false);
              }}
              disabled={isExporting}
            >
              {isExporting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Certification Blocked Dialog */}
      <AlertDialog open={certBlockDialogOpen} onOpenChange={setCertBlockDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <ShieldX className="h-5 w-5" />
              Certification Blocked
            </AlertDialogTitle>
            <AlertDialogDescription>
              This stage cannot be certified because required elements are missing.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4 space-y-2">
            {qualityResult?.checks.filter(c => c.status === 'fail').map(check => (
              <div key={check.check_key} className="flex items-start gap-2 text-sm text-destructive">
                <ShieldX className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>{check.message}</span>
              </div>
            ))}
          </div>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setCertBlockDialogOpen(false)}>
              Understood
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Certification Warning Dialog */}
      <AlertDialog open={certWarnDialogOpen} onOpenChange={setCertWarnDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-5 w-5" />
              Certification Warnings
            </AlertDialogTitle>
            <AlertDialogDescription>
              This stage has warnings. You may certify it, but review the recommendations below.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4 space-y-2">
            {!(stage as any)?.version_label && (
              <div className="flex items-start gap-2 text-sm text-amber-700">
                <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>Consider setting a version label before certifying this stage.</span>
              </div>
            )}
            {qualityResult?.checks.filter(c => c.status === 'warn').map(check => (
              <div key={check.check_key} className="flex items-start gap-2 text-sm text-amber-700">
                <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>{check.message}</span>
              </div>
            ))}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setCertWarnDialogOpen(false); setPendingCertNotes(null); }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmCertWithWarnings} className="bg-amber-600 hover:bg-amber-700">
              Certify Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Frameworks Narrowing Warning Dialog */}
      <AlertDialog open={frameworksNarrowingWarning} onOpenChange={setFrameworksNarrowingWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-5 w-5" />
              Narrowing Framework Scope
            </AlertDialogTitle>
            <AlertDialogDescription>
              You are narrowing the compliance scope of a certified stage. This may affect how this stage can be used in packages.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4 space-y-2">
            <div className="flex items-start gap-2 text-sm">
              <span className="font-medium">Current frameworks:</span>
              <StageFrameworkBadges frameworks={(stage as any)?.frameworks} size="sm" />
            </div>
            {pendingFrameworks && (
              <div className="flex items-start gap-2 text-sm">
                <span className="font-medium">New frameworks:</span>
                <StageFrameworkBadges frameworks={pendingFrameworks} size="sm" />
              </div>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setFrameworksNarrowingWarning(false); setPendingFrameworks(null); }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmFrameworksNarrowing} className="bg-amber-600 hover:bg-amber-700">
              Save Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Stage Simulation Dialog */}
      {stage && (
        <StageSimulationDialog
          open={simulationOpen}
          onOpenChange={setSimulationOpen}
          stageId={stage.id}
          stageName={stage.title}
        />
      )}

      {/* Version Snapshot Viewer */}
      <VersionSnapshotViewer
        version={viewingVersion}
        open={!!viewingVersion}
        onOpenChange={(open) => !open && setViewingVersion(null)}
      />
    </div>
  );
}
