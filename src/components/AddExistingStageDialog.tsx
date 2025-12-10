import { useState, useEffect } from "react";
import { Dialog, DialogPortal, DialogOverlay, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Search, Plus, Archive, Layers, FileText, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface AddExistingStageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  packageId: number | undefined;
  onSuccess: () => void;
}

interface ExistingStage {
  id: number;
  stage_id: number;
  stage_name: string;
  package_id: number;
  package_name: string;
  package_full_text: string;
  is_active: boolean;
  document_count: number;
}

export function AddExistingStageDialog({
  open,
  onOpenChange,
  packageId,
  onSuccess,
}: AddExistingStageDialogProps) {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [stages, setStages] = useState<ExistingStage[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentStageIds, setCurrentStageIds] = useState<number[]>([]);
  const [confirmStage, setConfirmStage] = useState<ExistingStage | null>(null);
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);

  useEffect(() => {
    if (open && packageId) {
      fetchCurrentStages();
      fetchExistingStages();
    }
  }, [open, packageId]);

  const fetchCurrentStages = async () => {
    if (!packageId) return;
    
    try {
      const { data, error } = await (supabase
        .from('package_stages' as any)
        .select('id')
        .eq('package_id', packageId) as any);

      if (error) throw error;
      setCurrentStageIds(data?.map((s: any) => s.id) || []);
    } catch (error: any) {
      console.error('Error fetching current stages:', error);
    }
  };

  const fetchExistingStages = async () => {
    try {
      setLoading(true);
      
      // Fetch all stages from package_stages with joined documents_stages data
      const { data: stagesData, error } = await (supabase
        .from('package_stages' as any)
        .select('id, package_id, stage_id, order_number, documents_stages(id, title, short_name)')
        .order('order_number') as any);

      if (error) throw error;

      // Get unique package IDs to fetch package names and full_text
      const packageIds = [...new Set(stagesData?.map((s: any) => s.package_id) || [])] as number[];
      
      const { data: packagesData, error: packagesError } = await supabase
        .from('packages')
        .select('id, name, full_text')
        .in('id', packageIds);

      if (packagesError) throw packagesError;

      // Fetch document counts for each stage
      const stageIds = stagesData?.map((s: any) => s.id) || [];
      const { data: documentCounts, error: docError } = await supabase
        .from('package_documents')
        .select('stage_id')
        .in('stage_id', stageIds);

      if (docError) throw docError;

      // Create a map of stage ID to document count
      const docCountMap = new Map<number, number>();
      documentCounts?.forEach(doc => {
        if (doc.stage_id) {
          docCountMap.set(doc.stage_id, (docCountMap.get(doc.stage_id) || 0) + 1);
        }
      });

      // Create a map of package ID to package data
      const packageMap = new Map(packagesData?.map(p => [p.id, { name: p.name, full_text: p.full_text }]) || []);

      const formattedStages: ExistingStage[] = (stagesData || []).map((stage: any) => ({
        id: stage.id,
        stage_id: stage.stage_id,
        stage_name: stage.documents_stages?.title || 'Unnamed Stage',
        package_id: stage.package_id,
        package_name: packageMap.get(stage.package_id)?.name || 'Unknown Package',
        package_full_text: packageMap.get(stage.package_id)?.full_text || '',
        is_active: true,
        document_count: docCountMap.get(stage.id) || 0,
      }));

      setStages(formattedStages);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to fetch stages',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleStageClick = (stage: ExistingStage) => {
    setConfirmStage(stage);
    setIsConfirmDialogOpen(true);
  };

  const handleAddStage = async () => {
    if (!confirmStage) return;
    if (!packageId) return;

    try {
      // Insert the new stage with the stage_id reference
      const { data: newStage, error: stageError } = await (supabase
        .from('package_stages' as any)
        .insert({
          package_id: packageId,
          stage_id: confirmStage.stage_id,
          stage_name: confirmStage.stage_name,
        })
        .select()
        .single() as any);

      if (stageError) throw stageError;

      // Then, copy all documents from the original stage to the new stage
      const { data: documents, error: docError } = await supabase
        .from('package_documents')
        .select('*')
        .eq('stage_id', confirmStage.id);

      if (docError) throw docError;

      if (documents && documents.length > 0) {
        const documentCopies = documents.map(doc => ({
          package_id: packageId,
          stage_id: newStage.id,
          document_name: doc.document_name,
          description: doc.description,
          order_number: doc.order_number,
          file_type: doc.file_type,
          is_client_doc: doc.is_client_doc,
          categories_id: doc.categories_id,
        }));

        const { error: insertError } = await supabase
          .from('package_documents')
          .insert(documentCopies);

        if (insertError) throw insertError;
      }

      toast({
        title: 'Success',
        description: `Stage added with ${documents?.length || 0} document(s)`,
      });

      setIsConfirmDialogOpen(false);
      setConfirmStage(null);
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to add stage',
        variant: 'destructive',
      });
    }
  };

  const filteredStages = stages.filter(
    (stage) =>
      stage.stage_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      stage.package_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      stage.package_full_text.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="z-[60] bg-black/70" />
        <DialogPrimitive.Content
          className={cn(
            "fixed left-[50%] top-[50%] z-[60] grid w-full sm:max-w-[650px] max-w-[90vw] max-h-[600px] translate-x-[-50%] translate-y-[-50%] gap-4 border-[3px] border-[#dfdfdf] bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg flex flex-col"
          )}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5" />
              Add Existing Stage
            </DialogTitle>
            <p className="text-sm text-muted-foreground mt-2">
              Search and select a stage to add to this package
            </p>
          </DialogHeader>

          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search stage by name or package..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 text-[15px]"
            />
          </div>

          <div className="flex-1 overflow-y-auto rounded-lg border border-border/50">
            {loading ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                Loading stages...
              </div>
            ) : filteredStages.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                No available stages found
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {filteredStages.map((stage, index) => (
                  <div
                    key={stage.id}
                    onClick={() => handleStageClick(stage)}
                    className="group flex items-center gap-4 p-4 hover:bg-primary/5 transition-all duration-200 cursor-pointer animate-fade-in"
                    style={{ animationDelay: `${index * 30}ms` }}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors">
                        {stage.stage_name}
                      </p>
                      <div className="flex items-center gap-1.5 mt-1">
                        <Archive className="h-3 w-3 text-muted-foreground" />
                        <p className="text-xs text-muted-foreground truncate">
                          {stage.package_full_text || stage.package_name}
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline" className="shrink-0 flex items-center gap-1.5 bg-primary/5 border-primary/20 text-primary font-medium px-3 py-1">
                      <FileText className="h-3.5 w-3.5" />
                      <span>{stage.document_count}</span>
                      <span className="text-xs opacity-80">documents</span>
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>

      {/* Confirmation Dialog */}
      <Dialog open={isConfirmDialogOpen} onOpenChange={setIsConfirmDialogOpen}>
        <DialogPortal>
          <DialogOverlay className="z-[70]" />
          <DialogPrimitive.Content className="z-[70] fixed left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] max-w-md w-full bg-background p-6 shadow-lg rounded-lg border">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-primary" />
                Confirm Add Stage
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground mt-2">
                Are you sure you want to add this stage to the package?
              </DialogDescription>
            </DialogHeader>
            {confirmStage && (
              <div className="my-6 p-4 bg-muted/30 rounded-lg border border-border/50">
                <div className="space-y-2">
                  <div>
                    <span className="text-sm font-semibold text-foreground">{confirmStage.stage_name}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Archive className="h-3 w-3" />
                    <span>{confirmStage.package_full_text || confirmStage.package_name}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant="outline" className="flex items-center gap-1.5 bg-primary/5 border-primary/20 text-primary font-medium px-3 py-1">
                      <FileText className="h-3.5 w-3.5" />
                      <span>{confirmStage.document_count}</span>
                      <span className="text-xs opacity-80">documents</span>
                    </Badge>
                  </div>
                </div>
              </div>
            )}
            <DialogFooter className="flex gap-2">
              <Button variant="outline" onClick={() => {
                setIsConfirmDialogOpen(false);
                setConfirmStage(null);
              }}>
                Cancel
              </Button>
              <Button onClick={handleAddStage}>
                Add Stage
              </Button>
            </DialogFooter>
          </DialogPrimitive.Content>
        </DialogPortal>
      </Dialog>
    </Dialog>
  );
}
