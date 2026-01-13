import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useStageReleases, ReleaseReadinessResult } from '@/hooks/useStageReleases';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, 
  DialogFooter, DialogDescription 
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Cog, Send, CheckCircle2, XCircle, AlertTriangle, 
  Loader2, FileText, Package, Download, Mail, 
  RefreshCw, Clock, ShieldAlert
} from 'lucide-react';
import { format } from 'date-fns';

interface StageDocument {
  id: number;
  document_id: number;
  document?: {
    id: number;
    title: string;
    format: string | null;
    document_status: string;
    current_published_version_id: string | null;
  };
}

interface StageDeliveryPanelProps {
  tenantId: number;
  tenantName: string;
  stageId: number;
  stageName: string;
  packageId?: number;
  onRefresh?: () => void;
}

export function StageDeliveryPanel({
  tenantId,
  tenantName,
  stageId,
  stageName,
  packageId,
  onRefresh
}: StageDeliveryPanelProps) {
  const {
    releases,
    loading,
    generating,
    releasing,
    fetchReleases,
    createRelease,
    generateDocuments,
    checkReleaseReadiness,
    executeRelease,
    pollGenerationStatus
  } = useStageReleases(tenantId);

  const [documents, setDocuments] = useState<StageDocument[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [selectedDocs, setSelectedDocs] = useState<Set<number>>(new Set());
  
  // Dialog states
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);
  const [showReadinessDialog, setShowReadinessDialog] = useState(false);
  const [showReleaseDialog, setShowReleaseDialog] = useState(false);
  
  // Release workflow state
  const [currentReleaseId, setCurrentReleaseId] = useState<string | null>(null);
  const [readinessResult, setReadinessResult] = useState<ReleaseReadinessResult | null>(null);
  const [overridePhrase, setOverridePhrase] = useState('');
  const [sendEmail, setSendEmail] = useState(true);
  const [emailTemplates, setEmailTemplates] = useState<{ id: string; internal_name: string }[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  
  // Generation polling
  const [generationStatus, setGenerationStatus] = useState<{
    complete: boolean;
    success: number;
    failed: number;
    pending: number;
  } | null>(null);

  useEffect(() => {
    fetchStageDocuments();
    fetchReleases(stageId, packageId);
    fetchEmailTemplates();
  }, [stageId, packageId]);

  const fetchStageDocuments = async () => {
    setLoadingDocs(true);
    try {
      const { data, error } = await supabase
        .from('stage_documents')
        .select(`
          id,
          document_id,
          document:documents(
            id, title, format, document_status, current_published_version_id
          )
        `)
        .eq('stage_id', stageId)
        .eq('is_tenant_visible', true);

      if (error) throw error;
      
      const docs = (data || []) as unknown as StageDocument[];
      setDocuments(docs);
      
      // Pre-select published docs
      const publishedIds = docs
        .filter(d => d.document?.document_status === 'published')
        .map(d => d.document_id);
      setSelectedDocs(new Set(publishedIds));
    } catch (error) {
      console.error('Failed to fetch documents:', error);
    } finally {
      setLoadingDocs(false);
    }
  };

  const fetchEmailTemplates = async () => {
    const { data } = await supabase
      .from('email_templates')
      .select('id, internal_name')
      .eq('status', 'active')
      .order('internal_name');
    
    setEmailTemplates(data || []);
    if (data && data.length > 0) {
      // Try to find a "documents ready" template
      const readyTemplate = data.find(t => 
        t.internal_name.toLowerCase().includes('ready') ||
        t.internal_name.toLowerCase().includes('document')
      );
      setSelectedTemplateId(readyTemplate?.id || data[0].id);
    }
  };

  const handleStartGeneration = async () => {
    if (selectedDocs.size === 0) return;
    
    // Create a new release
    const release = await createRelease(stageId, packageId || null, Array.from(selectedDocs));
    if (!release) return;
    
    setCurrentReleaseId(release.id);
    setShowGenerateDialog(false);
    
    // Start generation
    const started = await generateDocuments(release.id);
    if (started) {
      // Poll for completion
      pollForCompletion(release.id);
    }
  };

  const pollForCompletion = async (releaseId: string) => {
    const poll = async () => {
      const status = await pollGenerationStatus(releaseId);
      setGenerationStatus(status);
      
      if (!status.complete) {
        setTimeout(poll, 2000); // Poll every 2 seconds
      } else {
        // Generation complete, show readiness dialog
        setTimeout(() => {
          handleCheckReadiness(releaseId);
        }, 500);
      }
    };
    poll();
  };

  const handleCheckReadiness = async (releaseId?: string) => {
    const id = releaseId || currentReleaseId;
    if (!id) return;
    
    setCurrentReleaseId(id);
    const result = await checkReleaseReadiness(id);
    setReadinessResult(result);
    setShowReadinessDialog(true);
  };

  const handleConfirmRelease = async () => {
    if (!currentReleaseId) return;
    
    // Check if override is required
    if (readinessResult?.requires_override) {
      if (overridePhrase !== readinessResult.override_phrase) {
        return; // Don't proceed
      }
    }
    
    setShowReadinessDialog(false);
    setShowReleaseDialog(true);
  };

  const handleExecuteRelease = async () => {
    if (!currentReleaseId) return;
    
    const success = await executeRelease(
      currentReleaseId, 
      sendEmail, 
      sendEmail ? selectedTemplateId : undefined
    );
    
    if (success) {
      setShowReleaseDialog(false);
      setCurrentReleaseId(null);
      setGenerationStatus(null);
      setOverridePhrase('');
      fetchReleases(stageId, packageId);
      onRefresh?.();
    }
  };

  const toggleDoc = (docId: number) => {
    setSelectedDocs(prev => {
      const next = new Set(prev);
      if (next.has(docId)) next.delete(docId);
      else next.add(docId);
      return next;
    });
  };

  const latestRelease = releases.find(r => r.status === 'released');

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'released':
        return <Badge className="bg-green-500">Released</Badge>;
      case 'ready':
        return <Badge variant="secondary">Ready</Badge>;
      case 'draft':
        return <Badge variant="outline">Draft</Badge>;
      case 'cancelled':
        return <Badge variant="destructive">Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Phase Delivery
            </CardTitle>
            <CardDescription>
              Generate and release documents for {tenantName}
            </CardDescription>
          </div>
          {latestRelease && (
            <div className="text-right text-sm">
              <div className="text-muted-foreground">Last released</div>
              <div className="font-medium">
                {format(new Date(latestRelease.released_at!), 'PPp')}
              </div>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Generation Status */}
        {generationStatus && !generationStatus.complete && (
          <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <div className="flex-1">
              <p className="font-medium">Generating documents...</p>
              <p className="text-sm text-muted-foreground">
                {generationStatus.success} complete, {generationStatus.pending} pending
                {generationStatus.failed > 0 && `, ${generationStatus.failed} failed`}
              </p>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          <Button 
            onClick={() => setShowGenerateDialog(true)}
            disabled={generating || loadingDocs}
          >
            <Cog className="h-4 w-4 mr-1" />
            Generate Documents
          </Button>
          
          {currentReleaseId && generationStatus?.complete && (
            <Button 
              variant="outline"
              onClick={() => handleCheckReadiness()}
            >
              <CheckCircle2 className="h-4 w-4 mr-1" />
              Review Readiness
            </Button>
          )}
          
          <Button 
            variant="outline"
            onClick={() => fetchReleases(stageId, packageId)}
            disabled={loading}
          >
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
        </div>

        <Separator />

        {/* Release History */}
        <div>
          <h4 className="font-medium mb-2">Release History</h4>
          {loading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : releases.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              No releases yet for this phase
            </p>
          ) : (
            <ScrollArea className="h-[200px]">
              <div className="space-y-2">
                {releases.slice(0, 10).map(release => (
                  <div 
                    key={release.id}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      {getStatusBadge(release.status)}
                      <div>
                        <p className="text-sm font-medium">
                          {release.summary || `Release ${release.id.slice(0, 8)}`}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {release.released_at 
                            ? format(new Date(release.released_at), 'PPp')
                            : format(new Date(release.created_at), 'PPp')
                          }
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {release.email_sent_at && (
                        <Mail className="h-4 w-4 text-muted-foreground" />
                      )}
                      {release.pack_download_url && (
                        <Button variant="ghost" size="sm" asChild>
                          <a href={release.pack_download_url} target="_blank" rel="noopener">
                            <Download className="h-4 w-4" />
                          </a>
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </CardContent>

      {/* Generate Documents Dialog */}
      <Dialog open={showGenerateDialog} onOpenChange={setShowGenerateDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Generate Documents</DialogTitle>
            <DialogDescription>
              Select documents to generate for {tenantName}
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="h-[300px]">
            <div className="space-y-2">
              {documents.map(doc => {
                const isPublished = doc.document?.document_status === 'published';
                const isSelected = selectedDocs.has(doc.document_id);
                
                return (
                  <div
                    key={doc.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border ${
                      isPublished ? 'cursor-pointer hover:bg-muted/50' : 'opacity-50'
                    }`}
                    onClick={() => isPublished && toggleDoc(doc.document_id)}
                  >
                    <Checkbox
                      checked={isSelected}
                      disabled={!isPublished}
                      onCheckedChange={() => toggleDoc(doc.document_id)}
                    />
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{doc.document?.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {doc.document?.format?.toUpperCase() || 'Unknown format'}
                      </p>
                    </div>
                    {!isPublished && (
                      <Badge variant="outline" className="text-xs">Not published</Badge>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGenerateDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleStartGeneration}
              disabled={selectedDocs.size === 0 || generating}
            >
              {generating ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Cog className="h-4 w-4 mr-1" />
              )}
              Generate {selectedDocs.size} Document{selectedDocs.size !== 1 ? 's' : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Readiness Check Dialog */}
      <Dialog open={showReadinessDialog} onOpenChange={setShowReadinessDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5" />
              Release Readiness
            </DialogTitle>
            <DialogDescription>
              Review document readiness before releasing to tenant
            </DialogDescription>
          </DialogHeader>

          {readinessResult && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="flex items-center justify-center gap-6 py-4 bg-muted/30 rounded-lg">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-500">
                    {readinessResult.summary.pass}
                  </div>
                  <div className="text-xs text-muted-foreground">Pass</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-yellow-500">
                    {readinessResult.summary.warn}
                  </div>
                  <div className="text-xs text-muted-foreground">Warnings</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-destructive">
                    {readinessResult.summary.fail}
                  </div>
                  <div className="text-xs text-muted-foreground">Failures</div>
                </div>
              </div>

              {/* Items */}
              <ScrollArea className="h-[200px]">
                <div className="space-y-2">
                  {readinessResult.items.map(item => (
                    <div 
                      key={item.document_id}
                      className="flex items-start gap-3 p-3 border rounded-lg"
                    >
                      {item.status === 'pass' && (
                        <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
                      )}
                      {item.status === 'warn' && (
                        <AlertTriangle className="h-5 w-5 text-yellow-500 shrink-0" />
                      )}
                      {item.status === 'fail' && (
                        <XCircle className="h-5 w-5 text-destructive shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium">{item.document_name}</p>
                        {item.issues.length > 0 && (
                          <ul className="text-xs text-muted-foreground mt-1 space-y-0.5">
                            {item.issues.map((issue, i) => (
                              <li key={i}>• {issue}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              {/* Override */}
              {readinessResult.requires_override && (
                <div className="border border-destructive/50 bg-destructive/5 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <ShieldAlert className="h-5 w-5 text-destructive shrink-0" />
                    <div className="space-y-3 flex-1">
                      <div>
                        <p className="font-medium text-destructive">Release blocked</p>
                        <p className="text-sm text-muted-foreground">
                          To release anyway, type "{readinessResult.override_phrase}" below
                        </p>
                      </div>
                      <Input
                        value={overridePhrase}
                        onChange={(e) => setOverridePhrase(e.target.value)}
                        placeholder="Type confirmation phrase"
                        className="max-w-xs"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReadinessDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleConfirmRelease}
              disabled={
                readinessResult?.requires_override && 
                overridePhrase !== readinessResult.override_phrase
              }
            >
              <Send className="h-4 w-4 mr-1" />
              {readinessResult?.requires_override ? 'Override & Continue' : 'Continue to Release'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Release Confirmation Dialog */}
      <Dialog open={showReleaseDialog} onOpenChange={setShowReleaseDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5" />
              Confirm Release
            </DialogTitle>
            <DialogDescription>
              Release documents to {tenantName}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="flex items-center gap-3">
              <Checkbox
                id="sendEmail"
                checked={sendEmail}
                onCheckedChange={(checked) => setSendEmail(!!checked)}
              />
              <label htmlFor="sendEmail" className="flex items-center gap-2 cursor-pointer">
                <Mail className="h-4 w-4" />
                Send notification email to tenant
              </label>
            </div>

            {sendEmail && (
              <div className="pl-6 space-y-2">
                <label className="text-sm font-medium">Email Template</label>
                <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select template" />
                  </SelectTrigger>
                  <SelectContent>
                    {emailTemplates.map(template => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.internal_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReleaseDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleExecuteRelease}
              disabled={releasing || (sendEmail && !selectedTemplateId)}
            >
              {releasing ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-1" />
              )}
              Release to Tenant
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
