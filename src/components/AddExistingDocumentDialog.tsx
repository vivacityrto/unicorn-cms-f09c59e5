import { useState, useEffect } from "react";
import { Dialog, DialogPortal, DialogOverlay, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectSeparator } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Search, Loader2, FileText, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useDocumentCategories } from "@/hooks/useDocumentCategories";
interface AddExistingDocumentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  packageId?: number;
  stageId?: number;
}
interface Document {
  id: number;
  title: string;
  description: string | null;
  isclientdoc: boolean | null;
  package_id: number | null;
  stage: number | null;
  category: string | null;
  uploaded_files: string[] | null;
}
export function AddExistingDocumentDialog({
  open,
  onOpenChange,
  onSuccess,
  packageId,
  stageId
}: AddExistingDocumentDialogProps) {
  const {
    toast
  } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [documents, setDocuments] = useState<Document[]>([]);
  const [filteredDocuments, setFilteredDocuments] = useState<Document[]>([]);
  const [selectedDocuments, setSelectedDocuments] = useState<Document[]>([]);
  const [loadingDocuments, setLoadingDocuments] = useState(false);
  const { categories: ddCategories, valueLabelMap } = useDocumentCategories();
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);
  useEffect(() => {
    if (open) {
      fetchDocuments();
    }
  }, [open]);
  useEffect(() => {
    let filtered = documents;

    // Filter by search query
    if (searchQuery.trim() !== "") {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(doc => doc.title.toLowerCase().includes(query) || doc.id.toString().includes(query) || doc.description?.toLowerCase().includes(query));
    }

    // Filter by selected category
    if (selectedCategory !== "all") {
      filtered = filtered.filter(doc => doc.category === selectedCategory);
    }

    // Sort by name
    filtered = [...filtered].sort((a, b) => a.title.localeCompare(b.title));
    
    setFilteredDocuments(filtered);
  }, [searchQuery, documents, selectedCategory]);
  const fetchDocuments = async () => {
    try {
      setLoadingDocuments(true);
      const {
        data,
        error
      } = await supabase
        .from('documents')
        .select('id, title, description, isclientdoc, package_id, stage, category, uploaded_files')
        .order('title');
      if (error) throw error;
      setDocuments(data || []);
      setFilteredDocuments(data || []);
    } catch (error: any) {
      console.error('Error fetching documents:', error);
      toast({
        title: "Error",
        description: "Failed to fetch documents",
        variant: "destructive"
      });
    } finally {
      setLoadingDocuments(false);
    }
  };
  const toggleDocumentSelection = (doc: Document) => {
    setSelectedDocuments(prev => {
      const isSelected = prev.some(d => d.id === doc.id);
      if (isSelected) {
        return prev.filter(d => d.id !== doc.id);
      } else {
        return [...prev, doc];
      }
    });
  };

  const handleSelectAllInCategory = (checked: boolean) => {
    if (checked && selectedCategory !== "all") {
      // Select all documents in the current category
      const docsInCategory = filteredDocuments.filter(
        doc => doc.category === selectedCategory
      );
      setSelectedDocuments(prev => {
        const newDocs = docsInCategory.filter(doc => !prev.some(d => d.id === doc.id));
        return [...prev, ...newDocs];
      });
    } else if (!checked && selectedCategory !== "all") {
      // Deselect all documents in the current category
      setSelectedDocuments(prev =>
        prev.filter(doc => doc.category !== selectedCategory)
      );
    }
  };

  const areAllCategoryDocsSelected = () => {
    if (selectedCategory === "all") return false;
    const docsInCategory = filteredDocuments.filter(
      doc => doc.category === selectedCategory
    );
    return docsInCategory.length > 0 && docsInCategory.every(doc =>
      selectedDocuments.some(d => d.id === doc.id)
    );
  };
  const handleAddDocument = async () => {
    if (selectedDocuments.length === 0) {
      toast({
        title: "Validation Error",
        description: "Please select at least one document",
        variant: "destructive"
      });
      return;
    }
    setIsConfirmDialogOpen(true);
  };

  const handleConfirmAddDocument = async () => {
    if (!packageId || !stageId) {
      toast({
        title: "Error",
        description: "Package and stage must be selected",
        variant: "destructive"
      });
      return;
    }
    try {
      setIsLoading(true);

      // Check which documents are already linked to this package/stage
      const { data: existingLinks, error: checkError } = await supabase
        .from('documents')
        .select('id')
        .eq('package_id', packageId)
        .eq('stage', stageId);

      if (checkError) throw checkError;

      const existingDocIds = new Set((existingLinks || []).map(link => link.id));

      // Filter out documents that are already in this stage
      const newDocuments = selectedDocuments.filter(doc => !existingDocIds.has(doc.id));
      const alreadyLinkedCount = selectedDocuments.length - newDocuments.length;

      if (newDocuments.length === 0) {
        toast({
          title: "Info",
          description: "All selected documents are already linked to this stage",
        });
        setIsConfirmDialogOpen(false);
        return;
      }

      // Update documents to link them to this package/stage and auto-release (no duplication - just update their package_id and stage)
      const updatePromises = newDocuments.map(selectedDoc => 
        supabase.from('documents')
          .update({
            package_id: packageId,
            stage: stageId,
            is_released: true,
          })
          .eq('id', selectedDoc.id)
      );
      const results = await Promise.all(updatePromises);
      const errors = results.filter(r => r.error);
      if (errors.length > 0) {
        throw new Error(`Failed to add ${errors.length} document(s)`);
      }

      const message = alreadyLinkedCount > 0 
        ? `${newDocuments.length} document(s) linked. ${alreadyLinkedCount} already existed.`
        : `${newDocuments.length} document(s) linked to stage successfully`;

      toast({
        title: "Success",
        description: message
      });
      setSelectedDocuments([]);
      setSearchQuery("");
      setIsConfirmDialogOpen(false);
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to add document",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };
  return <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="z-[70] bg-black/70" />
        <DialogPrimitive.Content className={cn("fixed left-[50%] top-[50%] z-[70] flex flex-col w-full sm:max-w-[600px] max-w-[90vw] max-h-[85vh] translate-x-[-50%] translate-y-[-50%] gap-4 overflow-hidden border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg")}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Add Existing Document
            </DialogTitle>
            <DialogDescription>
              Search and select documents to add to this stage
              {selectedDocuments.length > 0 && <span className="block mt-1 text-primary font-medium">
                  {selectedDocuments.length} document(s) selected
                </span>}
            </DialogDescription>
          </DialogHeader>

          {/* Search and Filters */}
          <div className="space-y-3">
            {/* Search Input with Sort/Filter */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search Document by name or ID..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-10" />
              </div>

              {/* Category Filter Dropdown */}
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="w-[180px] bg-background border-border pointer-events-auto hover:bg-[hsl(196deg_100%_93.53%)] hover:text-black transition-colors">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent className="bg-background border-border z-[100] pointer-events-auto">
                  <SelectItem 
                    value="all" 
                    className="hover:!bg-[hsl(196deg_100%_93.53%)] hover:!text-black data-[state=checked]:bg-[hsl(196deg_100%_93.53%)] data-[state=checked]:text-black cursor-pointer py-3"
                  >
                    All Categories
                  </SelectItem>
                  <Separator className="my-1" />
                  {ddCategories.map((category, index) => (
                    <>
                      <SelectItem 
                        key={category.value} 
                        value={category.value}
                        className="hover:!bg-[hsl(196deg_100%_93.53%)] hover:!text-black data-[state=checked]:bg-[hsl(196deg_100%_93.53%)] data-[state=checked]:text-black cursor-pointer py-3"
                      >
                        {category.label}
                      </SelectItem>
                      {index < ddCategories.length - 1 && <Separator className="my-1" />}
                    </>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Select All in Category */}
            {selectedCategory !== "all" && filteredDocuments.length > 0 && (
              <div className="flex items-center gap-2 px-1">
                <Checkbox
                  id="select-all-category"
                  checked={areAllCategoryDocsSelected()}
                  onCheckedChange={handleSelectAllInCategory}
                />
                <label
                  htmlFor="select-all-category"
                  className="text-sm text-muted-foreground cursor-pointer"
                >
                  Select all in {ddCategories.find(c => c.value === selectedCategory)?.label}
                </label>
              </div>
            )}
          </div>

          {/* Documents List */}
          <ScrollArea className="flex-1 min-h-0 -mx-6 px-6 h-[500px]">
            {loadingDocuments ? <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div> : filteredDocuments.length === 0 ? <div className="flex flex-col items-center justify-center py-8 text-center">
                <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-sm text-muted-foreground">
                  {searchQuery ? "No documents found" : "No documents available"}
                </p>
              </div> : <div className="space-y-2 pb-4 max-h-[500px] overflow-y-auto">
                {filteredDocuments.map(doc => {
              const isSelected = selectedDocuments.some(d => d.id === doc.id);
              return <button key={doc.id} onClick={() => toggleDocumentSelection(doc)} className={cn("w-[97%] text-left p-4 rounded-lg border transition-all hover:bg-muted/50", isSelected ? "border-primary bg-primary/5" : "border-border")}>
                      <div className="flex items-start gap-3 w-full">
                        <Checkbox checked={isSelected} className="mt-0.5 flex-shrink-0" />
                        <div className="flex items-start justify-between gap-3 flex-1 min-w-0">
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm truncate">{doc.title}</div>
                            <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
                              {doc.category && <>
                                <span>{valueLabelMap.get(doc.category) || doc.category}</span>
                                <span>•</span>
                              </>}
                              <span>Status: {doc.package_id ? 'in package' : 'available'}</span>
                            </div>
                            {doc.description && <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                {doc.description}
                              </div>}
                          </div>
                          <Badge variant={doc.package_id ? "secondary" : "default"} className="flex-shrink-0">
                            {doc.package_id ? 'In Use' : 'Available'}
                          </Badge>
                        </div>
                      </div>
                    </button>;
            })}
              </div>}
          </ScrollArea>

          <DialogFooter className="gap-2">
            <Button variant="outline" className="hover:bg-[hsl(196deg_100%_93.53%)] hover:text-black" style={{
              boxShadow: "var(--tw-ring-offset-shadow, 0 0 #0000), var(--tw-ring-shadow, 0 0 #0000), var(--tw-shadow)",
              border: "1px solid #00000052"
            }} onClick={() => {
            setSelectedDocuments([]);
            setSearchQuery("");
            setSelectedCategory("all");
            onOpenChange(false);
          }} disabled={isLoading}>
              Cancel
            </Button>
            <Button onClick={handleAddDocument} disabled={isLoading || selectedDocuments.length === 0}>
              {isLoading ? <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Adding...
                </> : <>
                  <FileText className="mr-2 h-4 w-4" />
                  Add {selectedDocuments.length > 0 ? `${selectedDocuments.length} ` : ''}Document{selectedDocuments.length !== 1 ? 's' : ''}
                </>}
            </Button>
          </DialogFooter>
        </DialogPrimitive.Content>
      </DialogPortal>

      {/* Confirmation Dialog */}
      <Dialog open={isConfirmDialogOpen} onOpenChange={setIsConfirmDialogOpen}>
        <DialogPortal>
          <DialogOverlay className="z-[80]" />
          <DialogPrimitive.Content className="z-[80] fixed left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] max-w-md w-full bg-background p-6 shadow-lg rounded-lg border">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-primary" />
                Confirm Add Documents
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground mt-2">
                Are you sure you want to add {selectedDocuments.length} document{selectedDocuments.length !== 1 ? 's' : ''} to this stage?
              </DialogDescription>
            </DialogHeader>
            <div className="my-6 max-h-[300px] overflow-y-auto">
              <div className="space-y-2">
                {selectedDocuments.map((doc) => {
                  return (
                    <div key={doc.id} className="p-3 bg-muted/30 rounded-lg border border-border/50">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-sm text-foreground truncate">{doc.title}</div>
                          {doc.category && (
                            <div className="text-xs text-muted-foreground mt-1">{valueLabelMap.get(doc.category) || doc.category}</div>
                          )}
                        </div>
                        <Badge variant="outline" className="shrink-0 text-xs">
                          <FileText className="h-3 w-3 mr-1" />
                          Doc
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <DialogFooter className="flex gap-2">
              <Button variant="outline" className="hover:bg-[hsl(196deg_100%_93.53%)] hover:text-black" style={{
                boxShadow: "var(--tw-ring-offset-shadow, 0 0 #0000), var(--tw-ring-shadow, 0 0 #0000), var(--tw-shadow)",
                border: "1px solid #00000052"
              }} onClick={() => {
                setIsConfirmDialogOpen(false);
              }}>
                Cancel
              </Button>
              <Button onClick={handleConfirmAddDocument} disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Adding...
                  </>
                ) : (
                  <>Add Documents</>
                )}
              </Button>
            </DialogFooter>
          </DialogPrimitive.Content>
        </DialogPortal>
      </Dialog>
    </Dialog>;
}