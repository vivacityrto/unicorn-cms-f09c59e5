import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Send, 
  FileText, 
  CheckCircle2, 
  AlertCircle,
  Loader2,
  Mail
} from 'lucide-react';
import { useTenantDocumentReleases } from '@/hooks/useDocumentVersions';
import { DocumentVersionBadge } from './DocumentVersionBadge';

interface StageDocument {
  id: number;
  document_id: number;
  document?: {
    id: number;
    title: string;
    document_status: string;
    current_published_version_id: string | null;
  };
}

interface ReleaseDocumentsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: number;
  tenantName: string;
  packageId: number;
  stageId: number;
  stageName: string;
  onSuccess?: () => void;
}

export function ReleaseDocumentsDialog({
  open,
  onOpenChange,
  tenantId,
  tenantName,
  packageId,
  stageId,
  stageName,
  onSuccess
}: ReleaseDocumentsDialogProps) {
  const { toast } = useToast();
  const { releaseDocuments } = useTenantDocumentReleases(tenantId);
  
  const [documents, setDocuments] = useState<StageDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [selectedDocs, setSelectedDocs] = useState<Set<number>>(new Set());
  const [sendEmail, setSendEmail] = useState(true);

  useEffect(() => {
    if (open && stageId) {
      fetchStageDocuments();
    }
  }, [open, stageId]);

  const fetchStageDocuments = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('stage_documents')
        .select(`
          id,
          document_id,
          document:documents(
            id,
            title,
            document_status,
            current_published_version_id
          )
        `)
        .eq('stage_id', stageId)
        .eq('is_tenant_visible', true);

      if (error) throw error;

      const docs = (data || []) as unknown as StageDocument[];
      setDocuments(docs);
      
      // Pre-select all published documents
      const publishedIds = docs
        .filter(d => d.document?.document_status === 'published' && d.document?.current_published_version_id)
        .map(d => d.document_id);
      setSelectedDocs(new Set(publishedIds));
    } catch (error) {
      console.error('Failed to fetch stage documents:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleDoc = (docId: number) => {
    setSelectedDocs(prev => {
      const next = new Set(prev);
      if (next.has(docId)) {
        next.delete(docId);
      } else {
        next.add(docId);
      }
      return next;
    });
  };

  const handleRelease = async () => {
    if (selectedDocs.size === 0) {
      toast({
        title: 'Error',
        description: 'Please select at least one document to release',
        variant: 'destructive'
      });
      return;
    }

    setReleasing(true);
    try {
      const count = await releaseDocuments(packageId, stageId, Array.from(selectedDocs));
      
      if (count > 0) {
        // TODO: If sendEmail is true, trigger email notification
        if (sendEmail) {
          // This would integrate with your email system
          console.log('Would send email notification to tenant');
        }

        toast({
          title: 'Documents Released',
          description: `${count} document${count !== 1 ? 's' : ''} released to ${tenantName}`
        });
        
        onSuccess?.();
        onOpenChange(false);
      }
    } catch (error: any) {
      toast({
        title: 'Release Failed',
        description: error.message || 'Failed to release documents',
        variant: 'destructive'
      });
    } finally {
      setReleasing(false);
    }
  };

  const publishedDocs = documents.filter(d => 
    d.document?.document_status === 'published' && d.document?.current_published_version_id
  );
  const unpublishedDocs = documents.filter(d => 
    d.document?.document_status !== 'published' || !d.document?.current_published_version_id
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            Release Documents to Tenant
          </DialogTitle>
          <DialogDescription>
            Release documents from "{stageName}" to {tenantName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : documents.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No visible documents in this stage</p>
            </div>
          ) : (
            <>
              {unpublishedDocs.length > 0 && (
                <Alert variant="destructive" className="mb-4">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    {unpublishedDocs.length} document{unpublishedDocs.length !== 1 ? 's' : ''} cannot be released 
                    because {unpublishedDocs.length !== 1 ? 'they are' : 'it is'} not published.
                  </AlertDescription>
                </Alert>
              )}

              <ScrollArea className="h-[300px]">
                <div className="space-y-2">
                  {documents.map((doc) => {
                    const isPublished = doc.document?.document_status === 'published' 
                      && doc.document?.current_published_version_id;
                    const isSelected = selectedDocs.has(doc.document_id);
                    
                    return (
                      <div
                        key={doc.id}
                        className={`flex items-center gap-3 p-3 rounded-lg border ${
                          isPublished 
                            ? 'bg-muted/30 cursor-pointer hover:bg-muted/50' 
                            : 'bg-muted/10 opacity-60'
                        }`}
                        onClick={() => isPublished && toggleDoc(doc.document_id)}
                      >
                        <Checkbox
                          checked={isSelected}
                          disabled={!isPublished}
                          onCheckedChange={() => toggleDoc(doc.document_id)}
                        />
                        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">
                            {doc.document?.title || 'Unknown Document'}
                          </p>
                        </div>
                        <DocumentVersionBadge 
                          status={doc.document?.document_status as 'draft' | 'published' | 'archived' || 'draft'}
                          showVersion={false}
                          size="sm"
                        />
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>

              {/* Email notification option */}
              <div className="flex items-center gap-2 pt-2 border-t">
                <Checkbox
                  id="sendEmail"
                  checked={sendEmail}
                  onCheckedChange={(checked) => setSendEmail(!!checked)}
                />
                <label htmlFor="sendEmail" className="text-sm cursor-pointer flex items-center gap-1">
                  <Mail className="h-4 w-4" />
                  Send email notification to tenant
                </label>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={releasing}>
            Cancel
          </Button>
          <Button 
            onClick={handleRelease} 
            disabled={releasing || selectedDocs.size === 0}
          >
            {releasing ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-1" />
            )}
            Release {selectedDocs.size} Document{selectedDocs.size !== 1 ? 's' : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
