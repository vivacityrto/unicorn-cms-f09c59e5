import { useParams, Link, useNavigate } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useRBAC } from '@/hooks/useRBAC';
import { useStageActiveUsage } from '@/hooks/useStageActiveUsage';
import { useStageCertification } from '@/hooks/useStageCertification';
import { useStageDuplication } from '@/hooks/useStageDuplication';
import { useStageReplacement } from '@/hooks/useStageReplacement';
import { usePackageBuilder, Stage, StaffTask, ClientTask, StageEmail, StageDocument } from '@/hooks/usePackageBuilder';
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
import { 
  ArrowLeft, Layers, ShieldCheck, ShieldX, Settings, Users, CheckSquare, 
  Mail, FileText, BarChart3, History, Copy, AlertTriangle, Plus, Trash2, 
  User, Clock, GripVertical, Package, Info, Loader2, RefreshCw, ExternalLink,
  Archive
} from 'lucide-react';
import { StageDocumentsTab } from '@/components/package-builder/StageDocumentsTab';

const STAGE_TYPE_OPTIONS = [
  { value: 'onboarding', label: 'Onboarding', color: 'bg-blue-500/10 text-blue-600 border-blue-500/20' },
  { value: 'delivery', label: 'Delivery', color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
  { value: 'documentation', label: 'Documentation', color: 'bg-teal-500/10 text-teal-600 border-teal-500/20' },
  { value: 'support', label: 'Ongoing Support', color: 'bg-purple-500/10 text-purple-600 border-purple-500/20' },
  { value: 'offboarding', label: 'Offboarding', color: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
  { value: 'other', label: 'Other', color: 'bg-muted text-muted-foreground' }
];

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
  const { updateStage, emailTemplates } = usePackageBuilder();
  const { activeUsage } = useStageActiveUsage(stageIdNum);
  const { updateCertification, isUpdating: isCertUpdating } = useStageCertification();
  const { duplicateAndNavigate, isDuplicating } = useStageDuplication();
  const { replaceStageInPackages, isReplacing } = useStageReplacement();
  
  const [stage, setStage] = useState<Stage | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('settings');
  const [usageCount, setUsageCount] = useState(0);
  const [packagesUsing, setPackagesUsing] = useState<PackageOption[]>([]);
  
  // Package context for editing tasks/emails/documents
  const [selectedPackageId, setSelectedPackageId] = useState<number | null>(null);
  
  // Edit confirmation with typed phrase
  const [editConfirmationOpen, setEditConfirmationOpen] = useState(false);
  const [pendingUpdate, setPendingUpdate] = useState<Partial<Stage> | null>(null);
  const [hasConfirmedEditing, setHasConfirmedEditing] = useState(false);
  const [confirmPhrase, setConfirmPhrase] = useState('');
  
  // Replace stage state
  const [replaceDialogOpen, setReplaceDialogOpen] = useState(false);
  const [selectedPackagesForReplace, setSelectedPackagesForReplace] = useState<number[]>([]);
  const [replacementStageId, setReplacementStageId] = useState<number | null>(null);
  const [allStages, setAllStages] = useState<Stage[]>([]);
  const [copyContentOnReplace, setCopyContentOnReplace] = useState(true);
  
  // Duplicate dialog state
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const [sourcePackageForDupe, setSourcePackageForDupe] = useState<number | null>(null);
  
  // Package-context data
  const [staffTasks, setStaffTasks] = useState<StaffTask[]>([]);
  const [clientTasks, setClientTasks] = useState<ClientTask[]>([]);
  const [stageEmails, setStageEmails] = useState<StageEmail[]>([]);
  const [stageDocuments, setStageDocuments] = useState<StageDocument[]>([]);
  const [loadingPackageData, setLoadingPackageData] = useState(false);
  
  // Dialog states
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [isAddingClientTask, setIsAddingClientTask] = useState(false);
  const [isAddingEmail, setIsAddingEmail] = useState(false);
  
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

  const isUsedByActiveClients = activeUsage.count > 0;
  const isReused = usageCount > 1;

  // Fetch stage data
  const fetchStage = useCallback(async () => {
    if (!stageIdNum) return;
    
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('documents_stages')
        .select('*')
        .eq('id', stageIdNum)
        .single();

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
        
        // Auto-select first package if none selected
        if (!selectedPackageId && packagesData && packagesData.length > 0) {
          setSelectedPackageId(packagesData[0].id);
        }
      }
    } catch (error) {
      console.error('Failed to fetch usage data:', error);
    }
  }, [stageIdNum, selectedPackageId]);

  // Fetch package-context data (tasks, emails, documents)
  const fetchPackageContextData = useCallback(async () => {
    if (!selectedPackageId || !stageIdNum) {
      setStaffTasks([]);
      setClientTasks([]);
      setStageEmails([]);
      setStageDocuments([]);
      return;
    }

    setLoadingPackageData(true);
    try {
      const [staffResult, clientResult, emailsResult, docsResult] = await Promise.all([
        supabase
          .from('package_staff_tasks')
          .select('*')
          .eq('package_id', selectedPackageId)
          .eq('stage_id', stageIdNum)
          .order('order_number', { ascending: true }),
        supabase
          .from('package_client_tasks')
          .select('*')
          .eq('package_id', selectedPackageId)
          .eq('stage_id', stageIdNum)
          .order('order_number', { ascending: true }),
        supabase
          .from('package_stage_emails' as any)
          .select('*')
          .eq('package_id', selectedPackageId)
          .eq('stage_id', stageIdNum)
          .order('sort_order', { ascending: true }) as any,
        supabase
          .from('package_stage_documents' as any)
          .select(`
            *,
            document:documents(id, title, format, category, is_team_only, is_tenant_downloadable, is_auto_generated)
          `)
          .eq('package_id', selectedPackageId)
          .eq('stage_id', stageIdNum)
          .order('sort_order', { ascending: true }) as any
      ]);

      setStaffTasks((staffResult.data || []) as StaffTask[]);
      setClientTasks((clientResult.data || []) as ClientTask[]);
      setStageEmails((emailsResult.data || []) as StageEmail[]);
      setStageDocuments((docsResult.data || []) as StageDocument[]);
    } catch (error) {
      console.error('Failed to fetch package context data:', error);
      toast({
        title: 'Error',
        description: 'Failed to load stage content for selected package',
        variant: 'destructive'
      });
    } finally {
      setLoadingPackageData(false);
    }
  }, [selectedPackageId, stageIdNum, toast]);

  useEffect(() => {
    fetchStage();
    fetchUsageData();
  }, [fetchStage, fetchUsageData]);

  useEffect(() => {
    fetchPackageContextData();
  }, [fetchPackageContextData]);

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

  const confirmAndApplyUpdate = async () => {
    setHasConfirmedEditing(true);
    setEditConfirmationOpen(false);
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
    
    try {
      await updateCertification(stage.id, is_certified, certified_notes);
      setStage(prev => prev ? { ...prev, is_certified, certified_notes } : null);
      toast({ title: 'Certification updated' });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update certification. SuperAdmin access required.',
        variant: 'destructive'
      });
    }
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
      sourcePackageId: sourcePackageForDupe || undefined 
    });
  };

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

  // Staff Task handlers
  const handleAddStaffTask = async () => {
    if (!selectedPackageId || !stageIdNum || !taskForm.name.trim()) {
      toast({ title: 'Validation Error', description: 'Task name is required', variant: 'destructive' });
      return;
    }

    try {
      const maxOrder = staffTasks.reduce((max, t) => Math.max(max, t.order_number), -1);
      
      const { error } = await supabase.from('package_staff_tasks').insert({
        package_id: selectedPackageId,
        stage_id: stageIdNum,
        name: taskForm.name,
        description: taskForm.description,
        order_number: maxOrder + 1,
        owner_role: taskForm.owner_role || 'Admin',
        estimated_hours: taskForm.estimated_hours ? parseFloat(taskForm.estimated_hours) : null,
        is_mandatory: taskForm.is_mandatory
      });

      if (error) throw error;
      toast({ title: 'Task Added' });
      setTaskForm({ name: '', description: '', owner_role: 'Admin', estimated_hours: '', is_mandatory: true });
      setIsAddingTask(false);
      await fetchPackageContextData();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to add task', variant: 'destructive' });
    }
  };

  const handleDeleteStaffTask = async (taskId: string) => {
    try {
      const { error } = await supabase.from('package_staff_tasks').delete().eq('id', taskId);
      if (error) throw error;
      toast({ title: 'Task Deleted' });
      await fetchPackageContextData();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to delete task', variant: 'destructive' });
    }
  };

  // Client Task handlers
  const handleAddClientTask = async () => {
    if (!selectedPackageId || !stageIdNum || !clientTaskForm.name.trim()) {
      toast({ title: 'Validation Error', description: 'Task name is required', variant: 'destructive' });
      return;
    }

    try {
      const maxOrder = clientTasks.reduce((max, t) => Math.max(max, t.order_number), -1);
      
      const insertData: any = {
        package_id: selectedPackageId,
        stage_id: stageIdNum,
        name: clientTaskForm.name,
        description: clientTaskForm.description || null,
        order_number: maxOrder + 1
      };
      if (clientTaskForm.instructions) insertData.instructions = clientTaskForm.instructions;
      if (clientTaskForm.due_date_offset) insertData.due_date_offset = parseInt(clientTaskForm.due_date_offset);

      const { error } = await supabase.from('package_client_tasks').insert(insertData);
      if (error) throw error;
      toast({ title: 'Client Task Added' });
      setClientTaskForm({ name: '', description: '', instructions: '', due_date_offset: '' });
      setIsAddingClientTask(false);
      await fetchPackageContextData();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to add client task', variant: 'destructive' });
    }
  };

  const handleDeleteClientTask = async (taskId: string) => {
    try {
      const { error } = await supabase.from('package_client_tasks').delete().eq('id', taskId);
      if (error) throw error;
      toast({ title: 'Client Task Deleted' });
      await fetchPackageContextData();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to delete client task', variant: 'destructive' });
    }
  };

  // Email handlers
  const handleAddEmail = async () => {
    if (!selectedPackageId || !stageIdNum || !emailForm.email_template_id) {
      toast({ title: 'Validation Error', description: 'Please select an email template', variant: 'destructive' });
      return;
    }

    try {
      const maxOrder = stageEmails.reduce((max, e) => Math.max(max, e.sort_order), -1);
      
      const { error } = await (supabase.from('package_stage_emails' as any).insert({
        package_id: selectedPackageId,
        stage_id: stageIdNum,
        email_template_id: emailForm.email_template_id,
        trigger_type: emailForm.trigger_type,
        recipient_type: emailForm.recipient_type,
        sort_order: maxOrder + 1,
        is_active: true
      }) as any);

      if (error) throw error;
      toast({ title: 'Email Added' });
      setEmailForm({ email_template_id: '', trigger_type: 'manual', recipient_type: 'tenant' });
      setIsAddingEmail(false);
      await fetchPackageContextData();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to add email', variant: 'destructive' });
    }
  };

  const handleRemoveEmail = async (emailId: number) => {
    try {
      const { error } = await (supabase.from('package_stage_emails' as any).delete().eq('id', emailId) as any);
      if (error) throw error;
      toast({ title: 'Email Removed' });
      await fetchPackageContextData();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to remove email', variant: 'destructive' });
    }
  };

  // Document handlers
  const handleAddDocument = async (documentId: number, visibility: string, deliveryType: string) => {
    if (!selectedPackageId || !stageIdNum) return;
    
    const maxOrder = stageDocuments.reduce((max, d) => Math.max(max, d.sort_order), -1);
    
    const { error } = await (supabase.from('package_stage_documents' as any).insert({
      package_id: selectedPackageId,
      stage_id: stageIdNum,
      document_id: documentId,
      visibility,
      delivery_type: deliveryType,
      sort_order: maxOrder + 1
    }) as any);

    if (error) {
      if (error.code === '23505') throw new Error('This document is already linked to this stage');
      throw error;
    }
    await fetchPackageContextData();
  };

  const handleAddBulkDocuments = async (documentIds: number[]) => {
    if (!selectedPackageId || !stageIdNum || documentIds.length === 0) return;
    
    const startOrder = stageDocuments.reduce((max, d) => Math.max(max, d.sort_order), -1) + 1;
    const inserts = documentIds.map((docId, idx) => ({
      package_id: selectedPackageId,
      stage_id: stageIdNum,
      document_id: docId,
      visibility: 'both',
      delivery_type: 'manual',
      sort_order: startOrder + idx
    }));

    const { error } = await (supabase.from('package_stage_documents' as any).insert(inserts) as any);
    if (error) {
      if (error.code === '23505') throw new Error('One or more documents are already linked');
      throw error;
    }
    await fetchPackageContextData();
  };

  const handleUpdateDocument = async (id: string, data: { visibility?: string; delivery_type?: string }) => {
    const { error } = await (supabase.from('package_stage_documents' as any).update(data).eq('id', id) as any);
    if (error) throw error;
    await fetchPackageContextData();
  };

  const handleRemoveDocument = async (id: string, documentId: number) => {
    const { error } = await (supabase.from('package_stage_documents' as any).delete().eq('id', id) as any);
    if (error) throw error;
    await fetchPackageContextData();
  };

  const handleReorderDocuments = async (orderedIds: string[]) => {
    for (let i = 0; i < orderedIds.length; i++) {
      await (supabase.from('package_stage_documents' as any).update({ sort_order: i }).eq('id', orderedIds[i]) as any);
    }
    await fetchPackageContextData();
  };

  const getStageTypeColor = (stageType: string) => {
    return STAGE_TYPE_OPTIONS.find(opt => opt.value === stageType)?.color || 'bg-muted text-muted-foreground border-border';
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

  const renderPackageContextSelector = () => (
    <Card className="mb-4 border-dashed">
      <CardContent className="pt-4">
        <div className="flex items-center gap-4">
          <Package className="h-5 w-5 text-muted-foreground" />
          <div className="flex-1">
            <Label className="text-sm font-medium">Package Context</Label>
            <p className="text-xs text-muted-foreground">
              Tasks, emails, and documents are stored per package. Select a package to edit content.
            </p>
          </div>
          <Select
            value={selectedPackageId?.toString() || ''}
            onValueChange={(val) => setSelectedPackageId(val ? parseInt(val) : null)}
          >
            <SelectTrigger className="w-[280px]">
              <SelectValue placeholder="Select a package..." />
            </SelectTrigger>
            <SelectContent>
              {packagesUsing.map(pkg => (
                <SelectItem key={pkg.id} value={pkg.id.toString()}>
                  <span className="flex items-center gap-2">
                    {pkg.name}
                    <Badge variant="outline" className="text-xs">{pkg.status}</Badge>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );

  const renderNoPackageContext = () => (
    <div className="flex flex-col items-center justify-center py-16 text-center border rounded-lg border-dashed bg-muted/20">
      <Info className="h-12 w-12 text-muted-foreground mb-4" />
      <h3 className="font-semibold text-lg mb-2">No Package Context Selected</h3>
      <p className="text-muted-foreground max-w-md">
        {packagesUsing.length === 0 
          ? 'This stage is not used in any packages yet. Add this stage to a package first to configure tasks, emails, and documents.'
          : 'Select a package above to view and edit the tasks, emails, and documents for this stage in that package context.'}
      </p>
    </div>
  );

  return (
    <div className="space-y-6 p-6 animate-fade-in">
      {/* Back Button */}
      <div>
        <Button variant="ghost" asChild className="gap-2 hover:bg-muted">
          <Link to="/admin/stages">
            <ArrowLeft className="h-4 w-4" />
            Back to Stages
          </Link>
        </Button>
      </div>

      {/* Stage Header */}
      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-8 w-[300px]" />
          <Skeleton className="h-5 w-[200px]" />
        </div>
      ) : stage ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <Layers className="h-7 w-7" />
            <h1 className="text-[28px] font-bold">{stage.title}</h1>
            <Badge variant="outline" className={`text-xs capitalize ${getStageTypeColor(stage.stage_type)}`}>
              {STAGE_TYPE_OPTIONS.find(o => o.value === stage.stage_type)?.label || stage.stage_type}
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

          {stage.description && (
            <p className="text-muted-foreground max-w-2xl">{stage.description}</p>
          )}
        </div>
      ) : (
        <div className="text-center py-8">
          <p className="text-muted-foreground">Stage not found</p>
        </div>
      )}

      {/* Warnings */}
      {stage && (
        <div className="space-y-3">
          {isUsedByActiveClients && (
            <Alert className="border-destructive/30 bg-destructive/5">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <AlertTitle className="text-destructive">This stage is in use by active clients</AlertTitle>
              <AlertDescription className="flex items-center justify-between">
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
              <AlertDescription className="flex items-center justify-between text-amber-800">
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

      {/* Tabs */}
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
                  <Label>AI Hint (optional)</Label>
                  <Textarea
                    value={stage.ai_hint || ''}
                    onChange={(e) => handleUpdateStage({ ai_hint: e.target.value })}
                    placeholder="Hints for AI suggestions..."
                    rows={2}
                  />
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
            {renderPackageContextSelector()}
            {!selectedPackageId ? renderNoPackageContext() : loadingPackageData ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base">Team Tasks</CardTitle>
                      <CardDescription>{staffTasks.length} tasks configured</CardDescription>
                    </div>
                    <Button size="sm" onClick={() => setIsAddingTask(true)}>
                      <Plus className="h-3 w-3 mr-1" />
                      Add Task
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[400px]">
                    {staffTasks.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 text-center">
                        <Users className="h-10 w-10 text-muted-foreground mb-3" />
                        <p className="text-muted-foreground">No team tasks configured</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {staffTasks.map((task) => (
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
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDeleteStaffTask(task.id)}>
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
            {renderPackageContextSelector()}
            {!selectedPackageId ? renderNoPackageContext() : loadingPackageData ? (
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
                    <Button size="sm" onClick={() => setIsAddingClientTask(true)}>
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
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDeleteClientTask(task.id)}>
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
            {renderPackageContextSelector()}
            {!selectedPackageId ? renderNoPackageContext() : loadingPackageData ? (
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
                    <Button size="sm" onClick={() => setIsAddingEmail(true)}>
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
                          const template = emailTemplates.find(t => t.id === email.email_template_id);
                          return (
                            <div key={email.id} className="flex items-start gap-2 p-3 rounded-lg border bg-muted/30">
                              <Mail className="h-4 w-4 text-muted-foreground mt-0.5" />
                              <div className="flex-1 min-w-0">
                                <span className="font-medium block">{template?.internal_name || 'Unknown Template'}</span>
                                <div className="flex items-center gap-2 mt-1">
                                  <Badge variant="outline" className="text-xs capitalize">
                                    {email.trigger_type.replace('_', ' ')}
                                  </Badge>
                                  <Badge variant="secondary" className="text-xs capitalize">
                                    {email.recipient_type}
                                  </Badge>
                                  {!email.is_active && (
                                    <Badge variant="destructive" className="text-xs">Inactive</Badge>
                                  )}
                                </div>
                              </div>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleRemoveEmail(email.id)}>
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
            {renderPackageContextSelector()}
            {!selectedPackageId ? renderNoPackageContext() : loadingPackageData ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <StageDocumentsTab
                packageId={selectedPackageId}
                stageId={stageIdNum!}
                stageDocuments={stageDocuments}
                onAddDocument={handleAddDocument}
                onAddBulkDocuments={handleAddBulkDocuments}
                onUpdateDocument={handleUpdateDocument}
                onRemoveDocument={handleRemoveDocument}
                onReorderDocuments={handleReorderDocuments}
              />
            )}
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

                {/* Phase 3 Actions */}
                <div className="pt-4 border-t">
                  <h3 className="font-semibold mb-3">Actions</h3>
                  <div className="flex gap-2">
                    <Button variant="outline" disabled>
                      <Copy className="h-4 w-4 mr-2" />
                      Duplicate Stage
                      <Badge variant="secondary" className="ml-2 text-xs">Phase 3</Badge>
                    </Button>
                    <Button variant="outline" disabled>
                      Replace in Packages
                      <Badge variant="secondary" className="ml-2 text-xs">Phase 3</Badge>
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
                <CardTitle>Audit Log</CardTitle>
                <CardDescription>Track changes made to this stage.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center justify-center py-16 text-center border rounded-lg border-dashed bg-muted/20">
                  <History className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="font-semibold text-lg mb-2">Audit Log Coming Soon</h3>
                  <p className="text-muted-foreground max-w-md">
                    Full audit logging will be available in Phase 3.
                  </p>
                </div>
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

      {/* Edit Confirmation Dialog */}
      <AlertDialog open={editConfirmationOpen} onOpenChange={setEditConfirmationOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Confirm Edit to Active Stage
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
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
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmAndApplyUpdate} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Edit Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
