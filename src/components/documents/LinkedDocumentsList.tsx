import { useState, useEffect } from "react";
import { format } from "date-fns";
import { 
  FileText, 
  ExternalLink, 
  RefreshCw, 
  AlertTriangle, 
  Check, 
  MoreVertical,
  FileSpreadsheet,
  FileImage,
  Film,
  Archive,
  Plus
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { useDocumentLinks, DocumentLink } from "@/hooks/useDocumentLinks";
import { SharePointDocumentPicker } from "./SharePointDocumentPicker";

interface LinkedDocumentsListProps {
  clientId?: number;
  packageId?: number;
  taskId?: string;
  meetingId?: string;
  title?: string;
  showAddButton?: boolean;
}

const EVIDENCE_TYPE_LABELS: Record<string, string> = {
  policy: "Policy",
  procedure: "Procedure",
  record: "Record",
  form: "Form",
  template: "Template",
  other: "Other",
};

function getFileIcon(doc: DocumentLink) {
  const ext = doc.file_extension?.toLowerCase();
  const mimeType = doc.mime_type || '';

  if (mimeType.includes('spreadsheet') || ['xlsx', 'xls', 'csv'].includes(ext || '')) {
    return <FileSpreadsheet className="h-5 w-5 text-green-600" />;
  }
  if (mimeType.includes('image') || ['png', 'jpg', 'jpeg', 'gif', 'svg'].includes(ext || '')) {
    return <FileImage className="h-5 w-5 text-purple-500" />;
  }
  if (mimeType.includes('video') || ['mp4', 'mov', 'avi'].includes(ext || '')) {
    return <Film className="h-5 w-5 text-red-500" />;
  }
  if (['zip', 'rar', '7z'].includes(ext || '')) {
    return <Archive className="h-5 w-5 text-gray-500" />;
  }

  return <FileText className="h-5 w-5 text-blue-500" />;
}

function formatFileSize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function LinkedDocumentsList({
  clientId,
  packageId,
  taskId,
  meetingId,
  title = "Linked Documents",
  showAddButton = true,
}: LinkedDocumentsListProps) {
  const { 
    documents, 
    isLoading, 
    refetch,
    checkVersion,
    confirmVersion,
    isConfirmingVersion
  } = useDocumentLinks({
    clientId,
    packageId,
    taskId,
    meetingId,
  });

  const [pickerOpen, setPickerOpen] = useState(false);
  const [versionStatus, setVersionStatus] = useState<Record<string, { hasChanged: boolean; checking: boolean }>>({});

  // Check versions on mount
  useEffect(() => {
    const checkVersions = async () => {
      for (const doc of documents) {
        if (doc.version_id) {
          setVersionStatus(prev => ({ ...prev, [doc.id]: { hasChanged: false, checking: true } }));
          try {
            const result = await checkVersion(doc.id);
            setVersionStatus(prev => ({ 
              ...prev, 
              [doc.id]: { hasChanged: result.hasChanged, checking: false } 
            }));
          } catch (e) {
            setVersionStatus(prev => ({ ...prev, [doc.id]: { hasChanged: false, checking: false } }));
          }
        }
      }
    };

    if (documents.length > 0) {
      checkVersions();
    }
  }, [documents.length]); // Only on doc count change to prevent loop

  const handleConfirmVersion = (docId: string) => {
    confirmVersion(docId, {
      onSuccess: () => {
        setVersionStatus(prev => ({ ...prev, [docId]: { hasChanged: false, checking: false } }));
      }
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {title}
              {documents.length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {documents.length}
                </Badge>
              )}
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => refetch()}>
                <RefreshCw className="h-4 w-4" />
              </Button>
              {showAddButton && (
                <Button size="sm" onClick={() => setPickerOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Link Document
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {documents.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p>No documents linked yet</p>
              {showAddButton && (
                <Button variant="outline" size="sm" className="mt-4" onClick={() => setPickerOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Link Document
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {documents.map((doc) => {
                const status = versionStatus[doc.id];
                const hasVersionChange = status?.hasChanged;
                
                return (
                  <div
                    key={doc.id}
                    className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                  >
                    {getFileIcon(doc)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{doc.file_name}</span>
                        {doc.evidence_type && (
                          <Badge variant="outline" className="text-xs">
                            {EVIDENCE_TYPE_LABELS[doc.evidence_type] || doc.evidence_type}
                          </Badge>
                        )}
                        {hasVersionChange && (
                          <Badge variant="secondary" className="text-xs bg-amber-500/10 text-amber-600 border-amber-500/30">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            Updated in SharePoint
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                        <span>{formatFileSize(doc.file_size)}</span>
                        <span>•</span>
                        <span>Linked {format(new Date(doc.created_at), "MMM d, yyyy")}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {hasVersionChange && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleConfirmVersion(doc.id)}
                          disabled={isConfirmingVersion}
                        >
                          <Check className="h-4 w-4 mr-1" />
                          Confirm
                        </Button>
                      )}
                      <a
                        href={doc.web_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-muted"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => window.open(doc.web_url, '_blank')}>
                            <ExternalLink className="h-4 w-4 mr-2" />
                            Open in SharePoint
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <SharePointDocumentPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        defaultClientId={clientId}
        defaultPackageId={packageId}
        defaultTaskId={taskId}
        defaultMeetingId={meetingId}
        onSuccess={() => refetch()}
      />
    </>
  );
}
