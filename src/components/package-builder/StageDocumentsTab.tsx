import { useState } from 'react';
import { StageDocument } from '@/hooks/usePackageBuilder';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { 
  Plus, Trash2, FileText, GripVertical, Search, Eye, Download, Loader2
} from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface StageDocumentsTabProps {
  packageId: number;
  stageId: number;
  stageDocuments: StageDocument[];
  onAddDocument: (documentId: number, visibility: string, deliveryType: string) => Promise<void>;
  onUpdateDocument: (id: string, data: { visibility?: string; delivery_type?: string }) => Promise<void>;
  onRemoveDocument: (id: string, documentId: number) => Promise<void>;
  onReorderDocuments: (orderedIds: string[]) => Promise<void>;
}

interface Document {
  id: number;
  title: string;
  format: string | null;
  category: string | null;
}

function SortableDocumentRow({ 
  doc, 
  onUpdate, 
  onRemove 
}: { 
  doc: StageDocument; 
  onUpdate: (data: { visibility?: string; delivery_type?: string }) => void;
  onRemove: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: doc.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-start gap-2 p-3 rounded-lg border bg-muted/30"
    >
      <div {...attributes} {...listeners} className="cursor-grab">
        <GripVertical className="h-4 w-4 text-muted-foreground mt-0.5" />
      </div>
      <FileText className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="font-medium block truncate">{doc.document.title}</span>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {doc.document.format && (
            <Badge variant="outline" className="text-xs uppercase">{doc.document.format}</Badge>
          )}
          {doc.document.category && (
            <Badge variant="secondary" className="text-xs">{doc.document.category}</Badge>
          )}
        </div>
        <div className="flex items-center gap-2 mt-2">
          <Select 
            value={doc.visibility} 
            onValueChange={(value) => onUpdate({ visibility: value })}
          >
            <SelectTrigger className="h-7 text-xs w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="team_only">
                <span className="flex items-center gap-1">
                  <Eye className="h-3 w-3" /> Team Only
                </span>
              </SelectItem>
              <SelectItem value="tenant_download">
                <span className="flex items-center gap-1">
                  <Download className="h-3 w-3" /> Tenant Download
                </span>
              </SelectItem>
              <SelectItem value="both">Both</SelectItem>
            </SelectContent>
          </Select>
          <Select 
            value={doc.delivery_type} 
            onValueChange={(value) => onUpdate({ delivery_type: value })}
          >
            <SelectTrigger className="h-7 text-xs w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="manual">Manual</SelectItem>
              <SelectItem value="auto_generate">Auto-generate</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 flex-shrink-0"
        onClick={onRemove}
      >
        <Trash2 className="h-3 w-3" />
      </Button>
    </div>
  );
}

export function StageDocumentsTab({
  packageId,
  stageId,
  stageDocuments,
  onAddDocument,
  onUpdateDocument,
  onRemoveDocument,
  onReorderDocuments
}: StageDocumentsTabProps) {
  const { toast } = useToast();
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [availableDocuments, setAvailableDocuments] = useState<Document[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLinking, setIsLinking] = useState<number | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  );

  const linkedDocumentIds = stageDocuments.map(d => d.document_id);

  const fetchDocuments = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('documents')
        .select('id, title, format, category')
        .order('title', { ascending: true });

      if (error) throw error;

      setAvailableDocuments(data || []);
      
      // Extract unique categories
      const uniqueCategories = [...new Set(
        (data || [])
          .map(d => d.category)
          .filter(Boolean)
      )] as string[];
      setCategories(uniqueCategories);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to fetch documents',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenDialog = () => {
    setIsLinkDialogOpen(true);
    fetchDocuments();
  };

  const handleLinkDocument = async (documentId: number) => {
    setIsLinking(documentId);
    try {
      await onAddDocument(documentId, 'both', 'manual');
      toast({ title: 'Document linked' });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to link document',
        variant: 'destructive'
      });
    } finally {
      setIsLinking(null);
    }
  };

  const handleUpdateDocument = async (id: string, data: { visibility?: string; delivery_type?: string }) => {
    try {
      await onUpdateDocument(id, data);
      toast({ title: 'Document updated' });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update document',
        variant: 'destructive'
      });
    }
  };

  const handleRemoveDocument = async (id: string, documentId: number) => {
    try {
      await onRemoveDocument(id, documentId);
      toast({ title: 'Document unlinked' });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to unlink document',
        variant: 'destructive'
      });
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = stageDocuments.findIndex(d => d.id === active.id);
      const newIndex = stageDocuments.findIndex(d => d.id === over.id);
      
      const newOrder = arrayMove(stageDocuments, oldIndex, newIndex);
      const orderedIds = newOrder.map(d => d.id);
      
      try {
        await onReorderDocuments(orderedIds);
      } catch (error: any) {
        toast({
          title: 'Error',
          description: error.message || 'Failed to reorder documents',
          variant: 'destructive'
        });
      }
    }
  };

  const filteredDocuments = availableDocuments.filter(doc => {
    const matchesSearch = doc.title.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || doc.category === categoryFilter;
    const notAlreadyLinked = !linkedDocumentIds.includes(doc.id);
    return matchesSearch && matchesCategory && notAlreadyLinked;
  });

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Documents</CardTitle>
              <CardDescription>{stageDocuments.length} documents linked</CardDescription>
            </div>
            <Button size="sm" onClick={handleOpenDialog}>
              <Plus className="h-3 w-3 mr-1" />
              Link Document
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[350px]">
            {stageDocuments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <FileText className="h-10 w-10 text-muted-foreground mb-3" />
                <p className="text-muted-foreground">No documents linked to this stage.</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Click "Link Document" to add documents from the library.
                </p>
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={stageDocuments.map(d => d.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-2">
                    {stageDocuments.map((doc) => (
                      <SortableDocumentRow
                        key={doc.id}
                        doc={doc}
                        onUpdate={(data) => handleUpdateDocument(doc.id, data)}
                        onRemove={() => handleRemoveDocument(doc.id, doc.document_id)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Link Document Dialog */}
      <Dialog open={isLinkDialogOpen} onOpenChange={setIsLinkDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Link Document</DialogTitle>
            <DialogDescription>
              Select a document from the library to link to this stage.
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex gap-2 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search documents..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories.map(cat => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <ScrollArea className="h-[400px] border rounded-lg">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredDocuments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <FileText className="h-10 w-10 text-muted-foreground mb-3" />
                <p className="text-muted-foreground">No documents found</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {linkedDocumentIds.length > 0 
                    ? 'All matching documents are already linked'
                    : 'Try adjusting your search or filter'}
                </p>
              </div>
            ) : (
              <div className="divide-y">
                {filteredDocuments.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between p-3 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium truncate">{doc.title}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {doc.format && (
                            <Badge variant="outline" className="text-xs uppercase">{doc.format}</Badge>
                          )}
                          {doc.category && (
                            <Badge variant="secondary" className="text-xs">{doc.category}</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleLinkDocument(doc.id)}
                      disabled={isLinking === doc.id}
                    >
                      {isLinking === doc.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <>
                          <Plus className="h-3 w-3 mr-1" />
                          Link
                        </>
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}
