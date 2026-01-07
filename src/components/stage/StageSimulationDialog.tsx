import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { 
  useStageSimulation, 
  SimulationContext, 
  SimulationData,
  renderMergeFields 
} from '@/hooks/useStageSimulation';
import { Stage } from '@/hooks/usePackageBuilder';
import { 
  Play, 
  Loader2, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle,
  Users,
  UserCheck,
  Mail,
  FileText,
  Info,
  Copy,
  Shield,
  Link2,
  BookOpen,
  Package,
  Building2,
  Eye
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface StageSimulationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stageId: number | null;
  stageName?: string;
}

export function StageSimulationDialog({ 
  open, 
  onOpenChange, 
  stageId,
  stageName 
}: StageSimulationDialogProps) {
  const { toast } = useToast();
  const { 
    loading, 
    simulationData, 
    fetchPackagesUsingStage, 
    fetchTenantsForSimulation,
    runSimulation, 
    clearSimulation 
  } = useStageSimulation();
  
  const [step, setStep] = useState<'context' | 'results'>('context');
  const [packages, setPackages] = useState<Array<{ id: number; name: string; status: string }>>([]);
  const [tenants, setTenants] = useState<Array<{ id: number; name: string }>>([]);
  const [selectedPackageId, setSelectedPackageId] = useState<string>('');
  const [selectedTenantId, setSelectedTenantId] = useState<string>('');
  const [loadingContext, setLoadingContext] = useState(false);
  const [activeTab, setActiveTab] = useState('summary');

  useEffect(() => {
    if (open && stageId) {
      loadContextOptions();
    } else {
      // Reset state when closed
      setStep('context');
      setSelectedPackageId('');
      setSelectedTenantId('');
      clearSimulation();
    }
  }, [open, stageId]);

  const loadContextOptions = async () => {
    if (!stageId) return;
    
    setLoadingContext(true);
    try {
      const [pkgs, tnts] = await Promise.all([
        fetchPackagesUsingStage(stageId),
        fetchTenantsForSimulation()
      ]);
      setPackages(pkgs);
      setTenants(tnts);
      
      // Auto-select first package if only one
      if (pkgs.length === 1) {
        setSelectedPackageId(pkgs[0].id.toString());
      }
    } finally {
      setLoadingContext(false);
    }
  };

  const handleRunSimulation = async () => {
    if (!stageId || !selectedPackageId) return;
    
    const pkg = packages.find(p => p.id.toString() === selectedPackageId);
    if (!pkg) return;
    
    const context: SimulationContext = {
      packageId: pkg.id,
      packageName: pkg.name,
      tenantId: selectedTenantId || undefined,
      tenantName: tenants.find(t => t.id.toString() === selectedTenantId)?.name
    };
    
    const success = await runSimulation(stageId, context);
    if (success) {
      setStep('results');
      setActiveTab('summary');
    } else {
      toast({
        title: 'Simulation Failed',
        description: 'Could not run stage simulation',
        variant: 'destructive'
      });
    }
  };

  const handleCopyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: `${label} copied` });
  };

  const handleBack = () => {
    setStep('context');
    clearSimulation();
  };

  if (!stageId) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[800px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Play className="h-5 w-5" />
            Simulate Stage
          </DialogTitle>
          <DialogDescription>
            {stageName ? `Dry run preview for "${stageName}"` : 'Dry run preview'}
          </DialogDescription>
        </DialogHeader>

        {/* Dry Run Banner */}
        <Alert className="bg-amber-500/10 border-amber-500/30">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-700">
            <strong>Dry run preview.</strong> No emails will be sent. No data will be changed.
          </AlertDescription>
        </Alert>

        {step === 'context' ? (
          <ContextSelectionStep
            packages={packages}
            tenants={tenants}
            selectedPackageId={selectedPackageId}
            selectedTenantId={selectedTenantId}
            onPackageChange={setSelectedPackageId}
            onTenantChange={setSelectedTenantId}
            onRun={handleRunSimulation}
            loading={loading}
            loadingContext={loadingContext}
          />
        ) : (
          <SimulationResultsStep
            data={simulationData}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onBack={handleBack}
            onCopy={handleCopyToClipboard}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

interface ContextSelectionStepProps {
  packages: Array<{ id: number; name: string; status: string }>;
  tenants: Array<{ id: number; name: string }>;
  selectedPackageId: string;
  selectedTenantId: string;
  onPackageChange: (id: string) => void;
  onTenantChange: (id: string) => void;
  onRun: () => void;
  loading: boolean;
  loadingContext: boolean;
}

function ContextSelectionStep({
  packages,
  tenants,
  selectedPackageId,
  selectedTenantId,
  onPackageChange,
  onTenantChange,
  onRun,
  loading,
  loadingContext
}: ContextSelectionStepProps) {
  if (loadingContext) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (packages.length === 0) {
    return (
      <div className="py-8 text-center space-y-4">
        <Package className="h-12 w-12 mx-auto text-muted-foreground/50" />
        <div>
          <p className="font-medium">No packages found</p>
          <p className="text-sm text-muted-foreground">
            Add this stage to a package to simulate.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 py-4">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Package className="h-4 w-4" />
            Package Context <span className="text-destructive">*</span>
          </Label>
          <Select value={selectedPackageId} onValueChange={onPackageChange}>
            <SelectTrigger>
              <SelectValue placeholder="Select a package..." />
            </SelectTrigger>
            <SelectContent>
              {packages.map(pkg => (
                <SelectItem key={pkg.id} value={pkg.id.toString()}>
                  {pkg.name}
                  <span className="ml-2 text-xs text-muted-foreground capitalize">
                    ({pkg.status})
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Stage content is loaded from this package context.
          </p>
        </div>

        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Tenant (optional)
          </Label>
          <Select value={selectedTenantId} onValueChange={onTenantChange}>
            <SelectTrigger>
              <SelectValue placeholder="Use sample data" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Use sample data</SelectItem>
              {tenants.map(t => (
                <SelectItem key={t.id} value={t.id.toString()}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Select a tenant to preview merge fields with real data.
          </p>
        </div>
      </div>

      <div className="flex justify-end">
        <Button 
          onClick={onRun} 
          disabled={!selectedPackageId || loading}
        >
          {loading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Play className="mr-2 h-4 w-4" />
          )}
          Run Simulation
        </Button>
      </div>
    </div>
  );
}

interface SimulationResultsStepProps {
  data: SimulationData | null;
  activeTab: string;
  onTabChange: (tab: string) => void;
  onBack: () => void;
  onCopy: (text: string, label: string) => void;
}

function SimulationResultsStep({
  data,
  activeTab,
  onTabChange,
  onBack,
  onCopy
}: SimulationResultsStepProps) {
  if (!data) return null;

  const { summary, teamTasks, clientTasks, emails, documents, mergeDataSource } = data;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Merge data source indicator */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
        <Info className="h-4 w-4" />
        Merge data source: <Badge variant="secondary">{mergeDataSource}</Badge>
      </div>

      <Tabs value={activeTab} onValueChange={onTabChange} className="flex-1 flex flex-col min-h-0">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="summary">Summary</TabsTrigger>
          <TabsTrigger value="team-tasks" className="flex items-center gap-1">
            <Users className="h-3.5 w-3.5" />
            Team ({teamTasks.length})
          </TabsTrigger>
          <TabsTrigger value="client-tasks" className="flex items-center gap-1">
            <UserCheck className="h-3.5 w-3.5" />
            Client ({clientTasks.length})
          </TabsTrigger>
          <TabsTrigger value="emails" className="flex items-center gap-1">
            <Mail className="h-3.5 w-3.5" />
            Emails ({emails.length})
          </TabsTrigger>
          <TabsTrigger value="documents" className="flex items-center gap-1">
            <FileText className="h-3.5 w-3.5" />
            Docs ({documents.length})
          </TabsTrigger>
        </TabsList>

        <ScrollArea className="flex-1 mt-4 pr-4">
          <TabsContent value="summary" className="mt-0">
            <SummaryTab summary={summary} />
          </TabsContent>

          <TabsContent value="team-tasks" className="mt-0">
            <TeamTasksTab tasks={teamTasks} />
          </TabsContent>

          <TabsContent value="client-tasks" className="mt-0">
            <ClientTasksTab tasks={clientTasks} />
          </TabsContent>

          <TabsContent value="emails" className="mt-0">
            <EmailsTab emails={emails} onCopy={onCopy} />
          </TabsContent>

          <TabsContent value="documents" className="mt-0">
            <DocumentsTab documents={documents} />
          </TabsContent>
        </ScrollArea>
      </Tabs>

      <div className="pt-4 border-t mt-4">
        <Button variant="outline" onClick={onBack}>
          ← Back to Context
        </Button>
      </div>
    </div>
  );
}

function SummaryTab({ summary }: { summary: SimulationData['summary'] }) {
  const { stage, version_label, frameworks, standards, dependency_check, quality_check } = summary;

  return (
    <div className="space-y-6">
      {/* Stage Info */}
      <div className="space-y-2">
        <h4 className="font-semibold text-lg">{stage.title}</h4>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="capitalize">{stage.stage_type}</Badge>
          {version_label && (
            <Badge variant="secondary">v{version_label}</Badge>
          )}
          {stage.is_certified && (
            <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
              <Shield className="h-3 w-3 mr-1" />
              Certified
            </Badge>
          )}
        </div>
      </div>

      <Separator />

      {/* Frameworks */}
      <div className="space-y-2">
        <h5 className="font-medium text-sm flex items-center gap-2">
          <Package className="h-4 w-4" />
          Frameworks
        </h5>
        <p className="text-sm text-muted-foreground">
          {frameworks.length > 0 ? frameworks.join(', ') : 'Shared'}
        </p>
      </div>

      {/* Standards */}
      <div className="space-y-2">
        <h5 className="font-medium text-sm flex items-center gap-2">
          <BookOpen className="h-4 w-4" />
          Standards Coverage
        </h5>
        {standards.length > 0 ? (
          <div className="space-y-1">
            {standards.map(s => (
              <div key={s.code} className="text-sm flex items-start gap-2">
                <Badge variant="outline" className="text-xs shrink-0">{s.code}</Badge>
                <span className="text-muted-foreground">{s.title}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No standards mapped.</p>
        )}
      </div>

      <Separator />

      {/* Dependency Check */}
      <div className="space-y-2">
        <h5 className="font-medium text-sm flex items-center gap-2">
          <Link2 className="h-4 w-4" />
          Dependency Check
        </h5>
        {!dependency_check.has_dependencies ? (
          <p className="text-sm text-muted-foreground">No dependencies.</p>
        ) : dependency_check.all_met ? (
          <div className="flex items-center gap-2 text-sm text-emerald-600">
            <CheckCircle2 className="h-4 w-4" />
            All dependencies satisfied in this package.
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-amber-600">
              <AlertTriangle className="h-4 w-4" />
              Missing dependencies:
            </div>
            <ul className="text-sm space-y-1 pl-6">
              {dependency_check.missing_stages.map(s => (
                <li key={s.stage_key} className="text-muted-foreground">
                  • {s.title || s.stage_key}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Quality Check */}
      <div className="space-y-2">
        <h5 className="font-medium text-sm flex items-center gap-2">
          <Shield className="h-4 w-4" />
          Quality Check
        </h5>
        <div className="flex items-center gap-2">
          {quality_check.status === 'pass' ? (
            <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Pass
            </Badge>
          ) : quality_check.status === 'warn' ? (
            <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20">
              <AlertTriangle className="h-3 w-3 mr-1" />
              Warnings
            </Badge>
          ) : (
            <Badge className="bg-destructive/10 text-destructive border-destructive/20">
              <XCircle className="h-3 w-3 mr-1" />
              Issues
            </Badge>
          )}
        </div>
        {quality_check.issues.length > 0 && (
          <ul className="text-sm space-y-1 pl-6 mt-2">
            {quality_check.issues.map((issue, idx) => (
              <li key={idx} className="text-muted-foreground">• {issue}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function TeamTasksTab({ tasks }: { tasks: SimulationData['teamTasks'] }) {
  if (tasks.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
        No team tasks configured for this stage.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {tasks.map((task, idx) => (
        <div key={task.id} className="p-3 border rounded-lg space-y-2">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{idx + 1}.</span>
              <span className="font-medium">{task.name}</span>
              {task.is_mandatory && (
                <Badge variant="outline" className="text-xs">Required</Badge>
              )}
            </div>
            <Badge variant="secondary" className="text-xs">{task.owner_role}</Badge>
          </div>
          {task.description && (
            <p className="text-sm text-muted-foreground">{task.description}</p>
          )}
          {task.estimated_hours && (
            <p className="text-xs text-muted-foreground">
              Est. hours: {task.estimated_hours}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function ClientTasksTab({ tasks }: { tasks: SimulationData['clientTasks'] }) {
  if (tasks.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        <UserCheck className="h-8 w-8 mx-auto mb-2 opacity-50" />
        No client tasks configured for this stage.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {tasks.map((task, idx) => (
        <div key={task.id} className="p-3 border rounded-lg space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{idx + 1}.</span>
            <span className="font-medium">{task.name}</span>
          </div>
          {task.instructions && (
            <p className="text-sm text-muted-foreground">{task.instructions}</p>
          )}
          {task.required_documents && task.required_documents.length > 0 && (
            <div className="text-xs text-muted-foreground">
              Required docs: {task.required_documents.join(', ')}
            </div>
          )}
          {task.due_date_offset && (
            <p className="text-xs text-muted-foreground">
              Due offset: +{task.due_date_offset} days
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function EmailsTab({ 
  emails, 
  onCopy 
}: { 
  emails: SimulationData['emails']; 
  onCopy: (text: string, label: string) => void;
}) {
  const [expandedEmail, setExpandedEmail] = useState<number | null>(null);

  if (emails.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        <Mail className="h-8 w-8 mx-auto mb-2 opacity-50" />
        No emails configured for this stage.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {emails.map((email) => (
        <div key={email.id} className="border rounded-lg overflow-hidden">
          <div 
            className="p-3 cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={() => setExpandedEmail(expandedEmail === email.id ? null : email.id)}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{email.template_name}</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs capitalize">
                  {email.trigger_type.replace(/_/g, ' ')}
                </Badge>
                <Badge variant="secondary" className="text-xs capitalize">
                  {email.recipient_type}
                </Badge>
                <Eye className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
            <p className="text-sm text-muted-foreground mt-1 truncate">
              Subject: {email.rendered_subject}
            </p>
            {email.missing_merge_fields.length > 0 && (
              <div className="flex items-center gap-1 mt-2 text-xs text-amber-600">
                <AlertTriangle className="h-3 w-3" />
                Missing merge fields: {email.missing_merge_fields.join(', ')}
              </div>
            )}
          </div>

          {expandedEmail === email.id && (
            <div className="border-t bg-muted/30 p-3 space-y-3">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">Subject</Label>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-6 text-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCopy(email.rendered_subject, 'Subject');
                    }}
                  >
                    <Copy className="h-3 w-3 mr-1" />
                    Copy
                  </Button>
                </div>
                <p className="text-sm font-medium">{email.rendered_subject}</p>
              </div>
              
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">Body Preview</Label>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-6 text-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      // Strip HTML for clipboard
                      const plainText = email.rendered_body.replace(/<[^>]*>/g, '');
                      onCopy(plainText, 'Body');
                    }}
                  >
                    <Copy className="h-3 w-3 mr-1" />
                    Copy
                  </Button>
                </div>
                <div 
                  className="text-sm prose prose-sm max-w-none bg-white p-3 rounded border max-h-[300px] overflow-auto"
                  dangerouslySetInnerHTML={{ __html: email.rendered_body }}
                />
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function DocumentsTab({ documents }: { documents: SimulationData['documents'] }) {
  if (documents.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
        No documents configured for this stage.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {documents.map((doc) => (
        <div key={doc.id} className="p-3 border rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileText className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="font-medium">{doc.doc_name}</p>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className="text-xs capitalize">
                  {doc.delivery_type}
                </Badge>
                <Badge variant="secondary" className="text-xs capitalize">
                  {doc.visibility === 'team_only' ? 'Team only' : 
                   doc.visibility === 'tenant' ? 'Tenant' : 'Both'}
                </Badge>
              </div>
            </div>
          </div>
          <div className="text-right text-sm">
            {doc.is_auto_generated && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Badge variant="outline" className="text-xs">
                      Auto-generate
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    Would require merge data for generation
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              Tenant can download: {doc.is_tenant_downloadable ? 'Yes' : 'No'}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
