import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  FileText, 
  Folder, 
  Search, 
  ChevronRight, 
  ArrowLeft, 
  Cloud, 
  HardDrive,
  FileSpreadsheet,
  FileImage,
  Film,
  Music,
  Archive,
  ExternalLink,
  Loader2,
  AlertCircle
} from "lucide-react";
import { useSharePointBrowser, useDocumentLinks, DriveItem, Drive } from "@/hooks/useDocumentLinks";
import { useNavigate } from "react-router-dom";

interface SharePointDocumentPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultClientId?: number;
  defaultPackageId?: number;
  defaultTaskId?: string;
  defaultMeetingId?: string;
  onSuccess?: () => void;
}

const EVIDENCE_TYPES = [
  { value: "policy", label: "Policy" },
  { value: "procedure", label: "Procedure" },
  { value: "record", label: "Record" },
  { value: "form", label: "Form" },
  { value: "template", label: "Template" },
  { value: "other", label: "Other" },
];

function getFileIcon(item: DriveItem) {
  if (item.folder) return <Folder className="h-5 w-5 text-amber-500" />;
  
  const ext = item.name?.split('.').pop()?.toLowerCase();
  const mimeType = item.file?.mimeType || '';

  if (mimeType.includes('spreadsheet') || ['xlsx', 'xls', 'csv'].includes(ext || '')) {
    return <FileSpreadsheet className="h-5 w-5 text-green-600" />;
  }
  if (mimeType.includes('image') || ['png', 'jpg', 'jpeg', 'gif', 'svg'].includes(ext || '')) {
    return <FileImage className="h-5 w-5 text-purple-500" />;
  }
  if (mimeType.includes('video') || ['mp4', 'mov', 'avi'].includes(ext || '')) {
    return <Film className="h-5 w-5 text-red-500" />;
  }
  if (mimeType.includes('audio') || ['mp3', 'wav'].includes(ext || '')) {
    return <Music className="h-5 w-5 text-pink-500" />;
  }
  if (['zip', 'rar', '7z'].includes(ext || '')) {
    return <Archive className="h-5 w-5 text-gray-500" />;
  }

  return <FileText className="h-5 w-5 text-blue-500" />;
}

function formatFileSize(bytes?: number) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function SharePointDocumentPicker({
  open,
  onOpenChange,
  defaultClientId,
  defaultPackageId,
  defaultTaskId,
  defaultMeetingId,
  onSuccess,
}: SharePointDocumentPickerProps) {
  const navigate = useNavigate();
  const {
    drives,
    items,
    isLoadingDrives,
    isLoadingItems,
    hasConnection,
    error,
    fetchDrives,
    fetchItems,
    searchItems,
  } = useSharePointBrowser();

  const { linkDocument, isLinking } = useDocumentLinks();

  const [step, setStep] = useState<'drives' | 'browse' | 'confirm'>('drives');
  const [selectedDrive, setSelectedDrive] = useState<Drive | null>(null);
  const [folderPath, setFolderPath] = useState<{ id: string; name: string }[]>([]);
  const [selectedItem, setSelectedItem] = useState<DriveItem | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  
  // Link options
  const [evidenceType, setEvidenceType] = useState<string>("");
  const [notes, setNotes] = useState("");

  // Load drives when modal opens
  useEffect(() => {
    if (open) {
      fetchDrives();
      setStep('drives');
      setSelectedDrive(null);
      setFolderPath([]);
      setSelectedItem(null);
      setSearchQuery("");
      setEvidenceType("");
      setNotes("");
    }
  }, [open, fetchDrives]);

  const handleDriveSelect = (drive: Drive) => {
    setSelectedDrive(drive);
    setFolderPath([]);
    setStep('browse');
    fetchItems(drive.id);
  };

  const handleFolderOpen = (folder: DriveItem) => {
    if (!selectedDrive) return;
    setFolderPath([...folderPath, { id: folder.id, name: folder.name }]);
    fetchItems(selectedDrive.id, folder.id);
  };

  const handleBack = () => {
    if (step === 'confirm') {
      setStep('browse');
      setSelectedItem(null);
    } else if (folderPath.length > 0) {
      const newPath = folderPath.slice(0, -1);
      setFolderPath(newPath);
      if (selectedDrive) {
        fetchItems(selectedDrive.id, newPath[newPath.length - 1]?.id);
      }
    } else {
      setStep('drives');
      setSelectedDrive(null);
    }
  };

  const handleFileSelect = (item: DriveItem) => {
    if (item.folder) {
      handleFolderOpen(item);
    } else {
      setSelectedItem(item);
      setStep('confirm');
    }
  };

  const handleSearch = () => {
    if (!selectedDrive || !searchQuery.trim()) return;
    setIsSearching(true);
    searchItems(selectedDrive.id, searchQuery);
  };

  const handleClearSearch = () => {
    setSearchQuery("");
    setIsSearching(false);
    if (selectedDrive) {
      fetchItems(selectedDrive.id, folderPath[folderPath.length - 1]?.id);
    }
  };

  const handleLink = () => {
    if (!selectedDrive || !selectedItem) return;

    linkDocument(
      {
        drive_id: selectedDrive.id,
        item_id: selectedItem.id,
        client_id: defaultClientId,
        package_id: defaultPackageId,
        task_id: defaultTaskId,
        meeting_id: defaultMeetingId,
        evidence_type: evidenceType || undefined,
        notes: notes || undefined,
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          onSuccess?.();
        },
      }
    );
  };

  const handleConnectMicrosoft = () => {
    navigate("/settings?tab=calendar");
  };

  if (hasConnection === false) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Cloud className="h-5 w-5" />
              Connect Microsoft Account
            </DialogTitle>
          </DialogHeader>
          <div className="text-center py-8">
            <Cloud className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground mb-4">
              Connect your Microsoft account to browse OneDrive and SharePoint files.
            </p>
            <Button onClick={handleConnectMicrosoft}>
              <ExternalLink className="h-4 w-4 mr-2" />
              Connect Microsoft
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Cloud className="h-5 w-5" />
            {step === 'drives' && "Select Drive"}
            {step === 'browse' && (selectedDrive?.name || "Browse Files")}
            {step === 'confirm' && "Link Document"}
          </DialogTitle>
        </DialogHeader>

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        {/* Drives list */}
        {step === 'drives' && (
          <div className="flex-1 overflow-hidden">
            {isLoadingDrives ? (
              <div className="space-y-3 p-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : drives.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <HardDrive className="h-10 w-10 mx-auto mb-3 opacity-50" />
                <p>No drives available</p>
              </div>
            ) : (
              <ScrollArea className="h-[400px]">
                <div className="space-y-2 p-2">
                  {drives.map((drive) => (
                    <button
                      key={drive.id}
                      onClick={() => handleDriveSelect(drive)}
                      className="w-full flex items-center gap-3 p-4 rounded-lg border hover:bg-muted/50 transition-colors text-left"
                    >
                      {drive.type === 'personal' ? (
                        <HardDrive className="h-6 w-6 text-blue-500" />
                      ) : (
                        <Cloud className="h-6 w-6 text-blue-600" />
                      )}
                      <div className="flex-1">
                        <div className="font-medium">{drive.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {drive.type === 'personal' ? 'OneDrive' : 'SharePoint'}
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        )}

        {/* File browser */}
        {step === 'browse' && (
          <div className="flex-1 overflow-hidden flex flex-col gap-3">
            {/* Breadcrumb and search */}
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={handleBack}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="flex items-center gap-1 text-sm text-muted-foreground flex-1 min-w-0">
                <span className="truncate">{selectedDrive?.name}</span>
                {folderPath.map((folder) => (
                  <span key={folder.id} className="flex items-center gap-1">
                    <ChevronRight className="h-3 w-3" />
                    <span className="truncate">{folder.name}</span>
                  </span>
                ))}
              </div>
            </div>

            {/* Search */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search files..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  className="pl-9"
                />
              </div>
              {isSearching ? (
                <Button variant="outline" onClick={handleClearSearch}>
                  Clear
                </Button>
              ) : (
                <Button variant="outline" onClick={handleSearch} disabled={!searchQuery.trim()}>
                  Search
                </Button>
              )}
            </div>

            {/* Files list */}
            {isLoadingItems ? (
              <div className="space-y-2">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : items.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="h-10 w-10 mx-auto mb-3 opacity-50" />
                <p>{isSearching ? 'No files match your search' : 'This folder is empty'}</p>
              </div>
            ) : (
              <ScrollArea className="flex-1 min-h-0">
                <div className="space-y-1">
                  {items.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => handleFileSelect(item)}
                      className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors text-left"
                    >
                      {getFileIcon(item)}
                      <div className="flex-1 min-w-0">
                        <div className="truncate">{item.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {item.folder 
                            ? `${item.folder.childCount || 0} items`
                            : formatFileSize(item.size)
                          }
                        </div>
                      </div>
                      {item.folder && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                    </button>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        )}

        {/* Confirmation step */}
        {step === 'confirm' && selectedItem && (
          <div className="space-y-4">
            <Button variant="ghost" size="sm" onClick={handleBack} className="mb-2">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to files
            </Button>

            {/* Selected file preview */}
            <div className="flex items-center gap-3 p-4 rounded-lg border bg-muted/50">
              {getFileIcon(selectedItem)}
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{selectedItem.name}</div>
                <div className="text-sm text-muted-foreground">
                  {formatFileSize(selectedItem.size)}
                </div>
              </div>
              <a 
                href={selectedItem.webUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>

            {/* Link options */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Evidence Type (optional)</Label>
                <Select value={evidenceType} onValueChange={setEvidenceType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select type..." />
                  </SelectTrigger>
                  <SelectContent>
                    {EVIDENCE_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Notes (optional)</Label>
                <Textarea
                  placeholder="Add any notes about this document..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          </div>
        )}

        {step === 'confirm' && (
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleLink} disabled={isLinking}>
              {isLinking ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Linking...
                </>
              ) : (
                "Link Document"
              )}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
