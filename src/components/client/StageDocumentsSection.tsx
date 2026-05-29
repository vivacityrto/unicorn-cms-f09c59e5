import { useState, useMemo, useEffect } from 'react';
import { useStageDocuments } from '@/hooks/useStageDocuments';
import { TaskDescriptionButton } from './TaskDescriptionDialog';
import { useBulkGeneration } from '@/hooks/useBulkGeneration';
import { BulkGenerationProgressDialog } from './BulkGenerationProgressDialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { FileText, CheckCircle2, Clock, Sparkles, Loader2, AlertTriangle, ExternalLink, RefreshCw, UserCheck, XCircle, Search, Link2, Copy, X } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface StageDocumentsSectionProps {
  stageInstanceId: number;
  tenantId: number;
  packageId?: number;
  debug?: boolean;
  isVivacityStaff?: boolean;
}

const STATUS_BADGE: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
  generated: { label: 'Generated', variant: 'default' },
  pending: { label: 'Pending', variant: 'secondary' },
  released: { label: 'Released', variant: 'outline' },
};

const GENERATION_STATUS_CONFIG: Record<string, { label: string; icon: React.ElementType; className: string }> = {
  generated: { label: 'Generated', icon: CheckCircle2, className: 'text-green-600' },
  pending: { label: 'Pending', icon: Clock, className: 'text-muted-foreground' },
  generating: { label: 'Generating...', icon: Loader2, className: 'text-blue-600' },
  failed: { label: 'Failed', icon: XCircle, className: 'text-destructive' },
  skipped: { label: 'Skipped', icon: Clock, className: 'text-muted-foreground' },
};

function categoriseError(error: string | null): { label: string; description: string } {
  if (!error) return { label: 'Unknown', description: 'No error details available.' };
  const lower = error.toLowerCase();
  if (lower.includes('merge') || lower.includes('field') || lower.includes('placeholder'))
    return { label: 'Missing merge data', description: 'Some merge fields could not be populated. Check that all required client data (e.g. RTO name, scope) has been entered.' };
  if (lower.includes('sharepoint') || lower.includes('governance folder') || lower.includes('drive') || lower.includes('graph'))
    return { label: 'SharePoint configuration', description: 'The SharePoint connection or governance folder could not be reached. Check SharePoint settings under Integrations.' };
  if (lower.includes('template') || lower.includes('version') || lower.includes('storage_path') || lower.includes('not found'))
    return { label: 'Template issue', description: 'The document template could not be found or is not in the correct format. Contact your consultant if this persists.' };
  return { label: 'System error', description: 'An unexpected error occurred. This has been logged and the Vivacity team has been notified.' };
}

export function StageDocumentsSection({ stageInstanceId, tenantId, packageId, debug, isVivacityStaff }: StageDocumentsSectionProps) {
  const { documents, loading, totalCount, refetch } = useStageDocuments({ stageInstanceId, tenantId, debug });
  const { bulkGenerate, generating, progress, liveResults, currentDoc, completedCount, planSize, cancelGeneration } = useBulkGeneration();

  const [progressDialogOpen, setProgressDialogOpen] = useState(false);
  const [progressMinimised, setProgressMinimised] = useState(false);


  const { toast } = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [overwriteChecked, setOverwriteChecked] = useState(false);
  const [overwritePrompt, setOverwritePrompt] = useState<{ alreadyCount: number; total: number } | null>(null);
  const [overwriteRunning, setOverwriteRunning] = useState(false);
  const [nameFilter, setNameFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [generatingSingleId, setGeneratingSingleId] = useState<number | null>(null);
  const [singleGenConfirm, setSingleGenConfirm] = useState<{ id: number; documentId: number; title: string; category: string | null } | null>(null);
  const [tenantName, setTenantName] = useState<string | null>(null);
  const [mergeWarnings, setMergeWarnings] = useState<{ title: string; unreplaced: string[]; missing: string[]; invalid: string[] } | null>(null);

  // Fetch tenant name for the generation confirmation message
  useEffect(() => {
    supabase.from('tenants').select('name').eq('id', tenantId).single().then(({ data }) => {
      if (data?.name) setTenantName(data.name);
    });
  }, [tenantId]);

  const categories = useMemo(() => {
    const cats = new Set(documents.map(d => d.category).filter(Boolean) as string[]);
    return Array.from(cats).sort();
  }, [documents]);

  const filteredDocuments = useMemo(() => {
    return documents.filter(doc => {
      const matchesName = !nameFilter || doc.title.toLowerCase().includes(nameFilter.toLowerCase());
      const matchesCategory = categoryFilter === 'all' || doc.category === categoryFilter;
      return matchesName && matchesCategory;
    });
  }, [documents, nameFilter, categoryFilter]);

  const handleBulkGenerate = async () => {
    setConfirmOpen(false);
    const useOverwrite = overwriteChecked;
    setOverwriteChecked(false);
    setProgressDialogOpen(true);

    try {
      const res = await bulkGenerate({
        tenantId,
        stageInstanceId,
        packageId,
        mode: useOverwrite ? 'overwrite_all' : 'pending_only',
        // If we're already overwriting we want the honest toast; otherwise suppress
        // the empty toast so we can prompt for overwrite instead.
        silentEmpty: !useOverwrite,
      });
      refetch();

      // Detect "all skipped because already_generated" → offer overwrite.
      if (res && !useOverwrite) {
        const { summary, results: rs } = res;
        const alreadyCount = rs.filter(r => r.reason === 'already_generated').length;
        const anyFailed = rs.some(r => r.status === 'failed');
        if (summary.generated === 0 && alreadyCount > 0 && !anyFailed) {
          setOverwritePrompt({ alreadyCount, total: summary.total });
        }
      }
    } catch {
      // Error handled by hook toast
    }
  };

  const handleOverwriteConfirm = async () => {
    if (!overwritePrompt) return;
    setOverwriteRunning(true);
    setProgressDialogOpen(true);
    try {

      await bulkGenerate({
        tenantId,
        stageInstanceId,
        packageId,
        mode: 'overwrite_all',
      });
      refetch();
    } catch {
      // toast handled by hook
    } finally {
      setOverwriteRunning(false);
      setOverwritePrompt(null);
    }
  };

  const handleSingleGenerate = async (docInstanceId: number, documentId: number, title: string) => {
    setSingleGenConfirm(null);
    setGeneratingSingleId(docInstanceId);
    try {
      // 1. Look up the latest published document_version_id
      const { data: versionData, error: versionError } = await supabase
        .from('document_versions')
        .select('id')
        .eq('document_id', documentId)
        .eq('status', 'published')
        .order('version_number', { ascending: false })
        .limit(1)
        .single();

      if (versionError || !versionData) {
        throw new Error('No published version available for this document. Please publish a version first.');
      }

      // 2. Call the real delivery pipeline (force=true to bypass idempotency)
      const response = await supabase.functions.invoke('deliver-governance-document', {
        body: {
          tenant_id: tenantId,
          document_version_id: versionData.id,
          allow_incomplete: true,
          force: true,
        },
      });

      // When functions.invoke returns non-2xx, response.error is set BUT
      // response.data still contains the JSON body with error_code/error details.
      if (response.error) {
        const body = response.data;
        const errorCode = body?.error_code || '';
        const errorMsg = body?.error || response.error.message;

        const ERROR_CODE_TOAST: Record<string, { title: string; description: string }> = {
          GOVERNANCE_FOLDER_MISSING: {
            title: 'Governance Folder Not Configured',
            description: 'No governance folder is configured for this client. Go to Admin → Integrations → SharePoint to set one up before generating.',
          },
          SHARED_FOLDER_MISSING: {
            title: 'Shared Folder Not Configured',
            description: 'No shared folder is configured for this client. Go to Admin → Integrations → SharePoint to set one up before generating.',
          },
          RATE_LIMITED: {
            title: 'Rate Limited',
            description: 'A bulk generation was run for this client in the last 5 minutes. Please wait before trying again.',
          },
        };

        const mapped = ERROR_CODE_TOAST[errorCode];
        if (mapped) {
          toast({ title: mapped.title, description: mapped.description, variant: 'destructive' });
          return;
        }

        throw new Error(errorMsg || 'Generation failed');
      }



      // Handle 422 — tailoring incomplete
      if (response.data?.error && response.data?.tailoring) {
        toast({
          title: 'Tailoring Incomplete',
          description: response.data.error,
          variant: 'destructive',
        });
        return;
      }

      if (!response.data?.success) throw new Error(response.data?.error || 'Generation failed');

      const sharepointUrl = response.data?.delivery?.sharepoint_web_url;
      const warnings = response.data?.warnings;
      const unreplaced = warnings?.unreplaced_fields || [];
      const invalid = warnings?.invalid_fields || [];
      const missing = warnings?.missing_fields || [];
      const hasWarnings = unreplaced.length > 0 || invalid.length > 0 || missing.length > 0;

      if (response.data?.skipped) {
        toast({
          title: 'Already Generated',
          description: sharepointUrl
            ? `"${title}" was already generated. View it in SharePoint.`
            : `"${title}" was already generated for this version.`,
        });
      } else {
        toast({
          title: 'Document Generated',
          description: sharepointUrl
            ? `"${title}" has been generated and uploaded to SharePoint.`
            : `"${title}" has been generated successfully.`,
        });
      }

      // Show persistent warning banner if there were unreplaced/missing merge fields
      if (hasWarnings) {
        setMergeWarnings({ title, unreplaced, missing, invalid });
      } else {
        setMergeWarnings(null);
      }

      refetch();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      const isGovernanceMissing = msg.includes('GOVERNANCE_FOLDER_MISSING') || msg.includes('governance folder configured');
      const isSharedMissing = msg.includes('SHARED_FOLDER_MISSING') || msg.includes('shared folder configured');
      toast({
        title: isSharedMissing
          ? 'Shared Folder Not Configured'
          : isGovernanceMissing
            ? 'Governance Folder Not Configured'
            : 'Generation Failed',
        description: isSharedMissing
          ? 'Shared folder is not configured for this client. Please set it up in Admin → Integrations → SharePoint before generating documents.'
          : isGovernanceMissing
            ? 'Please verify the governance folder for this tenant before generating documents. Go to Admin → SharePoint Folder Mapping to run folder verification.'
            : msg,
        variant: 'destructive',
      });

    } finally {
      setGeneratingSingleId(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-2 px-4 py-3 border-t bg-muted/20">
        <Skeleton className="h-4 w-24" />
        {[1, 2].map(i => <Skeleton key={i} className="h-8 w-full" />)}
      </div>
    );
  }

  if (totalCount === 0) {
    return (
      <div className="px-4 py-3 border-t bg-muted/20 text-center text-muted-foreground text-sm">
        No documents linked to this stage.
      </div>
    );
  }

  return (
    <div className="border-t bg-muted/20">
      <div className="px-4 py-2 border-b bg-muted/30 flex items-center justify-between">
        <span className="text-sm font-medium flex items-center gap-1.5">
          <FileText className="h-3.5 w-3.5" />
          Documents
        </span>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">{totalCount} total</Badge>
          {isVivacityStaff && (
            <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  disabled={generating}
                >
                  {generating ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Sparkles className="h-3 w-3" />
                  )}
                  Generate All
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Generate All Documents</AlertDialogTitle>
                  <AlertDialogDescription>
                    Up to {totalCount} documents will be processed. Already-generated documents
                    are skipped unless you tick Overwrite.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="flex items-start gap-2 rounded-md border p-3 bg-muted/30">
                  <Checkbox
                    id="bulk-overwrite"
                    checked={overwriteChecked}
                    onCheckedChange={(v) => setOverwriteChecked(v === true)}
                    className="mt-0.5"
                  />
                  <label htmlFor="bulk-overwrite" className="text-sm cursor-pointer leading-tight">
                    <span className="font-medium">Overwrite documents already marked generated</span>
                    <span className="block text-xs text-muted-foreground mt-0.5">
                      Regenerates every eligible template and replaces files in Client Governance.
                    </span>
                  </label>
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel onClick={() => setOverwriteChecked(false)}>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleBulkGenerate}>
                    {overwriteChecked ? 'Overwrite All' : 'Generate All'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          <ConfirmDialog
            open={!!overwritePrompt}
            onOpenChange={(o) => { if (!o) setOverwritePrompt(null); }}
            variant="warning"
            title="Overwrite previously generated documents?"
            description={
              overwritePrompt
                ? `${overwritePrompt.alreadyCount} of ${overwritePrompt.total} documents are already marked generated, so nothing was produced this run. Overwriting will regenerate every eligible template and replace the existing files in Client Governance.`
                : ''
            }
            confirmText="Overwrite All"
            cancelText="Keep Existing"
            isLoading={overwriteRunning}
            onConfirm={handleOverwriteConfirm}
          />
        </div>
      </div>

      {/* Filters */}
      {documents.length > 0 && (
        <div className="px-4 py-2 border-b bg-muted/10 flex items-center gap-2">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Filter by name..."
              value={nameFilter}
              onChange={(e) => setNameFilter(e.target.value)}
              className="h-7 text-xs pl-7"
            />
          </div>
          {categories.length > 1 && (
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="h-7 text-xs w-[160px]">
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories.map(cat => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {(nameFilter || categoryFilter !== 'all') && (
            <span className="text-xs text-muted-foreground">{filteredDocuments.length} of {documents.length}</span>
          )}
        </div>
      <BulkGenerationProgressDialog
        open={progressDialogOpen && (generating || liveResults.length > 0)}
        generating={generating}
        liveResults={liveResults}
        currentDoc={currentDoc}
        completedCount={completedCount}
        planSize={planSize}
        minimised={progressMinimised}
        onMinimise={() => setProgressMinimised(true)}
        onExpand={() => setProgressMinimised(false)}
        onCancel={cancelGeneration}
        onClose={() => { setProgressDialogOpen(false); setProgressMinimised(false); }}
      />

        onClose={() => setProgressDialogOpen(false)}
      />


      {/* Merge field warnings dialog */}
      <AlertDialog open={!!mergeWarnings} onOpenChange={(open) => { if (!open) setMergeWarnings(null); }}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Merge Field Warnings
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 pt-1">
                <p className="text-sm text-muted-foreground">
                  The following merge fields could not be resolved when generating "<span className="font-medium text-foreground">{mergeWarnings?.title}</span>".
                </p>
                {mergeWarnings?.unreplaced && mergeWarnings.unreplaced.length > 0 && (
                  <div>
                    <span className="text-xs font-medium text-foreground">Unreplaced fields ({mergeWarnings.unreplaced.length}):</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {mergeWarnings.unreplaced.map(f => (
                        <Badge key={f} variant="outline" className="text-xs font-mono border-destructive/30 text-destructive">{`{{${f}}}`}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {mergeWarnings?.missing && mergeWarnings.missing.length > 0 && (
                  <div>
                    <span className="text-xs font-medium text-foreground">Missing data ({mergeWarnings.missing.length}):</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {mergeWarnings.missing.map(f => (
                        <Badge key={f} variant="outline" className="text-xs font-mono border-amber-500/30 text-amber-600">{`{{${f}}}`}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {mergeWarnings?.invalid && mergeWarnings.invalid.length > 0 && (
                  <div>
                    <span className="text-xs font-medium text-foreground">Unknown tags ({mergeWarnings.invalid.length}):</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {mergeWarnings.invalid.map(f => (
                        <Badge key={f} variant="destructive" className="text-xs font-mono">{`{{${f}}}`}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => {
                if (!mergeWarnings) return;
                const lines: string[] = [`Merge Field Warnings — "${mergeWarnings.title}"`];
                if (mergeWarnings.unreplaced.length > 0) lines.push(`\nUnreplaced fields:\n${mergeWarnings.unreplaced.map(f => `  • ${f}`).join('\n')}`);
                if (mergeWarnings.missing.length > 0) lines.push(`\nMissing data:\n${mergeWarnings.missing.map(f => `  • ${f}`).join('\n')}`);
                if (mergeWarnings.invalid.length > 0) lines.push(`\nUnknown tags:\n${mergeWarnings.invalid.map(f => `  • ${f}`).join('\n')}`);
                navigator.clipboard.writeText(lines.join('\n'));
                toast({ title: 'Copied to clipboard', description: 'Warning details copied.' });
              }}
            >
              <Copy className="h-3.5 w-3.5" />
              Copy All
            </Button>
            <AlertDialogAction>Close</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Single generate confirmation */}
      <AlertDialog open={!!singleGenConfirm} onOpenChange={(open) => { if (!open) setSingleGenConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Generate Document</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span>Generate "{singleGenConfirm?.title}"? This will process the document template with the current client data.</span>
              <span className="block text-xs text-muted-foreground mt-2">
                The generated document will be placed in:<br />
                <span className="font-medium text-foreground">Client Governance {'>'} Documents {'>'} Governance {'>'} {tenantName || 'Client'} {'>'} {singleGenConfirm?.category || 'Uncategorised'}</span>
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (singleGenConfirm) {
                handleSingleGenerate(singleGenConfirm.id, singleGenConfirm.documentId, singleGenConfirm.title);
              }
            }}>
              Generate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="divide-y">
        {filteredDocuments.map((doc) => {
          const genConfig = GENERATION_STATUS_CONFIG[doc.generation_status || 'pending'] || GENERATION_STATUS_CONFIG.pending;
          const GenIcon = genConfig.icon;
          const errorInfo = doc.last_error ? categoriseError(doc.last_error) : null;
          const isGeneratingSingle = generatingSingleId === doc.id;
          const canGenerate = isVivacityStaff && doc.generation_status !== 'generating';

          return (
            <div key={doc.id} className="flex items-center gap-3 px-4 py-2">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <GenIcon className={`h-4 w-4 shrink-0 ${genConfig.className} ${doc.generation_status === 'generating' ? 'animate-spin' : ''}`} />
                  </TooltipTrigger>
                  <TooltipContent side="left">
                    <p className="text-xs font-medium">{genConfig.label}</p>
                    {doc.generationdate && (
                      <p className="text-xs text-muted-foreground">
                        Last generated: {format(new Date(doc.generationdate), 'dd MMM yyyy HH:mm')}
                      </p>
                    )}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <p className="text-sm truncate">{doc.title}</p>
                  <TaskDescriptionButton taskName={doc.title} description={doc.description} documentId={doc.document_id} />
                  {doc.has_sharepoint_link && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Link2 className="h-3.5 w-3.5 text-primary shrink-0" />
                        </TooltipTrigger>
                        <TooltipContent><p className="text-xs">Linked to SharePoint template</p></TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                  {doc.is_manual_allocation && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <UserCheck className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                        </TooltipTrigger>
                        <TooltipContent><p className="text-xs">Manually allocated</p></TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {doc.created_at && (
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(doc.created_at), 'dd MMM yyyy')}
                    </p>
                  )}
                  {doc.generated_file_url && (
                    <a
                      href={doc.generated_file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline flex items-center gap-0.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ExternalLink className="h-3 w-3" />
                      View file
                    </a>
                  )}
                </div>
                {errorInfo && doc.generation_status === 'failed' && (
                  <div className="mt-1 flex items-start gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-medium text-destructive">{errorInfo.label}</p>
                      <p className="text-xs text-muted-foreground">{errorInfo.description}</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {doc.generation_status === 'failed' && isVivacityStaff && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => setSingleGenConfirm({ id: doc.id, documentId: doc.document_id, title: doc.title, category: doc.category })}
                        >
                          <RefreshCw className="h-3 w-3" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent><p className="text-xs">Retry generation</p></TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                {doc.generation_status === 'failed' ? (
                  doc.last_error ? (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge variant="destructive" className="text-xs cursor-help">
                            Failed
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-[280px] whitespace-pre-wrap">
                          <p className="text-xs font-medium">{categoriseError(doc.last_error).label}</p>
                          <p className="text-xs text-muted-foreground mt-1 break-words">{doc.last_error}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ) : (
                    <Badge variant="destructive" className="text-xs">Failed</Badge>
                  )
                ) : isGeneratingSingle ? (
                  <Badge variant="secondary" className="text-xs gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Generating…
                  </Badge>

                ) : canGenerate && !doc.has_sharepoint_link ? (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge variant="outline" className="text-xs text-muted-foreground cursor-default gap-1">
                          <Link2 className="h-3 w-3" />
                          Not linked
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-[220px]">
                        <p className="text-xs">This document has no SharePoint template linked. Link a template in the document library before generating.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : canGenerate ? (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span
                          className="inline-flex cursor-pointer"
                          onClick={() => setSingleGenConfirm({ id: doc.id, documentId: doc.document_id, title: doc.title, category: doc.category })}
                        >
                          <Badge
                            variant={STATUS_BADGE[doc.status]?.variant || 'secondary'}
                            className="text-xs hover:bg-primary hover:text-primary-foreground transition-colors"
                          >
                            {STATUS_BADGE[doc.status]?.label || doc.status}
                          </Badge>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent><p className="text-xs">Click to generate this document</p></TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : (
                  <Badge variant={STATUS_BADGE[doc.status]?.variant || 'secondary'} className="text-xs">
                    {STATUS_BADGE[doc.status]?.label || doc.status}
                  </Badge>
                )}
              </div>
            </div>
          );
        })}
        {filteredDocuments.length === 0 && documents.length > 0 && (
          <div className="px-4 py-6 text-center text-sm text-muted-foreground">
            No documents match your filters
          </div>
        )}
      </div>
    </div>
  );
}
