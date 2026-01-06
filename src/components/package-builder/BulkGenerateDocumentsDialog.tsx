import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { StageDocument } from '@/hooks/usePackageBuilder';
import { 
  Wand2, FileText, Building2, Loader2, CheckCircle2, XCircle, AlertTriangle, ChevronRight
} from 'lucide-react';

interface BulkGenerateDocumentsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  packageId: number;
  stageId: number;
  stageName: string;
  stageDocuments: StageDocument[];
}

interface Tenant {
  id: number;
  name: string;
  client_legacy_id: string | null;
}

type GenerationStep = 'scope' | 'review' | 'progress' | 'complete';

interface GenerationResult {
  tenantId: number;
  tenantName: string;
  documentId: number;
  documentTitle: string;
  success: boolean;
  error?: string;
}

export function BulkGenerateDocumentsDialog({
  open,
  onOpenChange,
  packageId,
  stageId,
  stageName,
  stageDocuments
}: BulkGenerateDocumentsDialogProps) {
  const { toast } = useToast();
  const [step, setStep] = useState<GenerationStep>('scope');
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedTenantIds, setSelectedTenantIds] = useState<Set<number>>(new Set());
  const [selectionMode, setSelectionMode] = useState<'all' | 'selected'>('all');
  const [isLoadingTenants, setIsLoadingTenants] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentItem, setCurrentItem] = useState('');
  const [results, setResults] = useState<GenerationResult[]>([]);

  // Fetch tenants that have this package
  useEffect(() => {
    if (open) {
      fetchTenants();
    }
  }, [open, packageId]);

  const fetchTenants = async () => {
    setIsLoadingTenants(true);
    try {
      // Get tenants with this package through client_package_stage_state
      const { data, error } = await supabase
        .from('client_package_stage_state')
        .select('tenant_id, tenants(id, name)')
        .eq('package_id', packageId)
        .order('tenant_id') as any;

      if (error) throw error;

      // Get unique tenants and their client_legacy references
      const uniqueTenantIds = [...new Set((data || []).map((d: any) => d.tenant_id))] as number[];
      
      const tenantsWithLegacy = await Promise.all(
        uniqueTenantIds.map(async (tenantId) => {
          const tenantData = (data || []).find((d: any) => d.tenant_id === tenantId);
          
          // Try to find client_legacy_id
          const { data: clientData } = await supabase
            .from('clients_legacy')
            .select('id')
            .eq('tenant_id', tenantId)
            .single();

          return {
            id: tenantId,
            name: tenantData?.tenants?.name || `Tenant ${tenantId}`,
            client_legacy_id: clientData?.id || null
          } as Tenant;
        })
      );

      setTenants(tenantsWithLegacy.filter(t => t.client_legacy_id !== null));
      setSelectedTenantIds(new Set(tenantsWithLegacy.filter(t => t.client_legacy_id !== null).map(t => t.id)));
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to fetch tenants',
        variant: 'destructive'
      });
    } finally {
      setIsLoadingTenants(false);
    }
  };

  const handleReset = () => {
    setStep('scope');
    setProgress(0);
    setCurrentItem('');
    setResults([]);
    setSelectionMode('all');
  };

  const handleClose = () => {
    handleReset();
    onOpenChange(false);
  };

  const toggleTenantSelection = (tenantId: number) => {
    setSelectedTenantIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(tenantId)) {
        newSet.delete(tenantId);
      } else {
        newSet.add(tenantId);
      }
      return newSet;
    });
  };

  const getSelectedTenants = () => {
    if (selectionMode === 'all') {
      return tenants;
    }
    return tenants.filter(t => selectedTenantIds.has(t.id));
  };

  const totalDocumentsToGenerate = getSelectedTenants().length * stageDocuments.length;

  const handleStartGeneration = async () => {
    setStep('progress');
    setIsGenerating(true);
    setProgress(0);
    setResults([]);

    const selectedTenants = getSelectedTenants();
    const totalItems = selectedTenants.length * stageDocuments.length;
    let completed = 0;
    const newResults: GenerationResult[] = [];

    for (const tenant of selectedTenants) {
      for (const stageDoc of stageDocuments) {
        setCurrentItem(`${stageDoc.document.title} for ${tenant.name}`);
        
        try {
          // Call edge function to generate document
          const { data, error } = await supabase.functions.invoke('generate-document', {
            body: {
              document_id: stageDoc.document_id,
              tenant_id: tenant.id,
              client_legacy_id: tenant.client_legacy_id,
              stage_id: stageId,
              package_id: packageId
            }
          });

          if (error) throw error;

          newResults.push({
            tenantId: tenant.id,
            tenantName: tenant.name,
            documentId: stageDoc.document_id,
            documentTitle: stageDoc.document.title,
            success: true
          });
        } catch (error: any) {
          newResults.push({
            tenantId: tenant.id,
            tenantName: tenant.name,
            documentId: stageDoc.document_id,
            documentTitle: stageDoc.document.title,
            success: false,
            error: error.message || 'Generation failed'
          });
        }

        completed++;
        setProgress((completed / totalItems) * 100);
        setResults([...newResults]);
      }
    }

    setIsGenerating(false);
    setStep('complete');
    setCurrentItem('');
  };

  const successCount = results.filter(r => r.success).length;
  const failureCount = results.filter(r => !r.success).length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5" />
            Generate Documents
          </DialogTitle>
          <DialogDescription>
            Generate personalized documents for tenants using merge fields
          </DialogDescription>
        </DialogHeader>

        {/* Step Indicator */}
        <div className="flex items-center gap-2 mb-4">
          {['scope', 'review', 'progress', 'complete'].map((s, i) => (
            <div key={s} className="flex items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                step === s ? 'bg-primary text-primary-foreground' : 
                ['scope', 'review', 'progress', 'complete'].indexOf(step) > i ? 'bg-primary/20 text-primary' : 
                'bg-muted text-muted-foreground'
              }`}>
                {i + 1}
              </div>
              {i < 3 && <ChevronRight className="h-4 w-4 text-muted-foreground mx-1" />}
            </div>
          ))}
        </div>

        {/* Step 1: Scope Selection */}
        {step === 'scope' && (
          <div className="space-y-4">
            <div className="p-3 bg-muted/30 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">Stage: {stageName}</span>
              </div>
              <p className="text-sm text-muted-foreground">
                {stageDocuments.length} documents will be generated for each selected tenant
              </p>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Select Tenants</label>
              <Select value={selectionMode} onValueChange={(v) => setSelectionMode(v as 'all' | 'selected')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All tenants with this package ({tenants.length})</SelectItem>
                  <SelectItem value="selected">Select specific tenants</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {selectionMode === 'selected' && (
              <ScrollArea className="h-[200px] border rounded-lg p-2">
                {isLoadingTenants ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : tenants.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No tenants have this package assigned
                  </div>
                ) : (
                  <div className="space-y-1">
                    {tenants.map((tenant) => (
                      <div
                        key={tenant.id}
                        className="flex items-center gap-2 p-2 rounded hover:bg-muted/50 cursor-pointer"
                        onClick={() => toggleTenantSelection(tenant.id)}
                      >
                        <Checkbox checked={selectedTenantIds.has(tenant.id)} />
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">{tenant.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            )}
          </div>
        )}

        {/* Step 2: Review */}
        {step === 'review' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-muted/30 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Tenants</span>
                </div>
                <p className="text-2xl font-bold">{getSelectedTenants().length}</p>
              </div>
              <div className="p-4 bg-muted/30 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Documents per tenant</span>
                </div>
                <p className="text-2xl font-bold">{stageDocuments.length}</p>
              </div>
            </div>

            <div className="p-4 border rounded-lg bg-primary/5">
              <div className="flex items-center justify-between">
                <span className="font-medium">Total documents to generate</span>
                <Badge variant="secondary" className="text-lg px-3 py-1">
                  {totalDocumentsToGenerate}
                </Badge>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Documents to generate:</p>
              <ScrollArea className="h-[150px] border rounded-lg p-2">
                {stageDocuments.map((doc) => (
                  <div key={doc.id} className="flex items-center gap-2 py-1">
                    <FileText className="h-3 w-3 text-muted-foreground" />
                    <span className="text-sm">{doc.document.title}</span>
                    {doc.document.format && (
                      <Badge variant="outline" className="text-xs uppercase">{doc.document.format}</Badge>
                    )}
                  </div>
                ))}
              </ScrollArea>
            </div>

            <div className="flex items-start gap-2 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
              <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5" />
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                This will generate {totalDocumentsToGenerate} documents. This process may take several minutes.
              </p>
            </div>
          </div>
        )}

        {/* Step 3: Progress */}
        {step === 'progress' && (
          <div className="space-y-4 py-4">
            <div className="text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary mb-4" />
              <p className="font-medium">Generating documents...</p>
              <p className="text-sm text-muted-foreground mt-1">{currentItem}</p>
            </div>

            <Progress value={progress} className="h-2" />
            
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>{Math.round(progress)}% complete</span>
              <span>{results.length} / {totalDocumentsToGenerate}</span>
            </div>

            <ScrollArea className="h-[150px] border rounded-lg p-2">
              {results.slice(-10).reverse().map((result, idx) => (
                <div key={idx} className="flex items-center gap-2 py-1 text-sm">
                  {result.success ? (
                    <CheckCircle2 className="h-3 w-3 text-green-500" />
                  ) : (
                    <XCircle className="h-3 w-3 text-red-500" />
                  )}
                  <span className="truncate">
                    {result.documentTitle} - {result.tenantName}
                  </span>
                </div>
              ))}
            </ScrollArea>
          </div>
        )}

        {/* Step 4: Complete */}
        {step === 'complete' && (
          <div className="space-y-4 py-4">
            <div className="text-center">
              {failureCount === 0 ? (
                <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
              ) : (
                <AlertTriangle className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
              )}
              <p className="text-xl font-medium">Generation Complete</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg text-center">
                <p className="text-2xl font-bold text-green-600">{successCount}</p>
                <p className="text-sm text-green-600">Successful</p>
              </div>
              {failureCount > 0 && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-center">
                  <p className="text-2xl font-bold text-red-600">{failureCount}</p>
                  <p className="text-sm text-red-600">Failed</p>
                </div>
              )}
            </div>

            {failureCount > 0 && (
              <ScrollArea className="h-[100px] border rounded-lg p-2">
                {results.filter(r => !r.success).map((result, idx) => (
                  <div key={idx} className="flex items-center gap-2 py-1 text-sm text-red-600">
                    <XCircle className="h-3 w-3" />
                    <span className="truncate">
                      {result.documentTitle} - {result.tenantName}: {result.error}
                    </span>
                  </div>
                ))}
              </ScrollArea>
            )}
          </div>
        )}

        <DialogFooter>
          {step === 'scope' && (
            <>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button 
                onClick={() => setStep('review')}
                disabled={getSelectedTenants().length === 0 || stageDocuments.length === 0}
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </>
          )}
          {step === 'review' && (
            <>
              <Button variant="outline" onClick={() => setStep('scope')}>Back</Button>
              <Button onClick={handleStartGeneration}>
                <Wand2 className="h-4 w-4 mr-1" />
                Generate {totalDocumentsToGenerate} Documents
              </Button>
            </>
          )}
          {step === 'progress' && (
            <Button variant="outline" disabled>
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              Generating...
            </Button>
          )}
          {step === 'complete' && (
            <>
              <Button variant="outline" onClick={handleReset}>Generate More</Button>
              <Button onClick={handleClose}>Done</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
