import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { 
  History, 
  Upload, 
  CheckCircle2, 
  Archive, 
  FileText, 
  Calendar,
  Loader2
} from 'lucide-react';
import { DocumentVersion, useDocumentVersions } from '@/hooks/useDocumentVersions';
import { DocumentVersionBadge } from './DocumentVersionBadge';
import { formatDistanceToNow } from 'date-fns';

interface DocumentVersionHistoryProps {
  documentId: number;
  documentTitle: string;
  canPublish?: boolean;
  onVersionPublished?: (versionId: string) => void;
}

export function DocumentVersionHistory({
  documentId,
  documentTitle,
  canPublish = true,
  onVersionPublished
}: DocumentVersionHistoryProps) {
  const { 
    versions, 
    loading, 
    publishing, 
    currentPublishedVersion,
    publishVersion 
  } = useDocumentVersions(documentId);
  
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [releaseNotes, setReleaseNotes] = useState('');

  const handlePublish = async () => {
    const versionId = await publishVersion(releaseNotes);
    if (versionId) {
      setPublishDialogOpen(false);
      setReleaseNotes('');
      onVersionPublished?.(versionId);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-AU', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getFileSize = (bytes: number | null) => {
    if (!bytes) return 'Unknown size';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <History className="h-4 w-4" />
                Version History
              </CardTitle>
              <CardDescription>
                {versions.length} version{versions.length !== 1 ? 's' : ''} • 
                {currentPublishedVersion 
                  ? ` v${currentPublishedVersion.version_number} published`
                  : ' No published version'
                }
              </CardDescription>
            </div>
            {canPublish && (
              <Button 
                size="sm" 
                onClick={() => setPublishDialogOpen(true)}
                disabled={publishing}
              >
                {publishing ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4 mr-1" />
                )}
                Publish New Version
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : versions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No versions yet</p>
              <p className="text-sm">Publish the first version to track changes</p>
            </div>
          ) : (
            <ScrollArea className="h-[300px]">
              <div className="space-y-3">
                {versions.map((version, index) => (
                  <VersionCard 
                    key={version.id} 
                    version={version} 
                    isLatest={index === 0}
                    formatDate={formatDate}
                    getFileSize={getFileSize}
                  />
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Publish Dialog */}
      <Dialog open={publishDialogOpen} onOpenChange={setPublishDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Publish New Version</DialogTitle>
            <DialogDescription>
              Create a new published version of "{documentTitle}". This will archive the current published version.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Release Notes (optional)</Label>
              <Textarea
                value={releaseNotes}
                onChange={(e) => setReleaseNotes(e.target.value)}
                placeholder="Describe the changes in this version..."
                rows={3}
              />
            </div>
            
            {currentPublishedVersion && (
              <div className="rounded-lg border p-3 bg-muted/50">
                <p className="text-sm text-muted-foreground">
                  Current published version: <strong>v{currentPublishedVersion.version_number}</strong>
                </p>
                <p className="text-sm text-muted-foreground">
                  New version will be: <strong>v{currentPublishedVersion.version_number + 1}</strong>
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPublishDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handlePublish} disabled={publishing}>
              {publishing ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Upload className="h-4 w-4 mr-1" />
              )}
              Publish
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function VersionCard({ 
  version, 
  isLatest,
  formatDate,
  getFileSize
}: { 
  version: DocumentVersion; 
  isLatest: boolean;
  formatDate: (date: string) => string;
  getFileSize: (bytes: number | null) => string;
}) {
  return (
    <div className={`p-3 rounded-lg border ${
      version.status === 'published' 
        ? 'border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-900/20' 
        : 'bg-muted/30'
    }`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono font-semibold">v{version.version_number}</span>
            <DocumentVersionBadge status={version.status} showVersion={false} size="sm" />
            {isLatest && (
              <Badge variant="secondary" className="text-xs">Latest</Badge>
            )}
          </div>
          
          {version.notes && (
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
              {version.notes}
            </p>
          )}
          
          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {formatDate(version.created_at)}
            </span>
            <span className="flex items-center gap-1">
              <FileText className="h-3 w-3" />
              {version.file_name}
            </span>
            <span>{getFileSize(version.file_size)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
