import { useState, useEffect } from "react";
import { Dialog, DialogPortal, DialogOverlay, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Search, Layers, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface AddExistingStageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  packageId: number | undefined;
  tenantId?: number;
  onSuccess: () => void;
}

interface ExistingStage {
  id: number;
  title: string;
  short_name: string | null;
  description: string | null;
  video_url: string | null;
  created_at: string;
}

export function AddExistingStageDialog({
  open,
  onOpenChange,
  packageId,
  tenantId,
  onSuccess,
}: AddExistingStageDialogProps) {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [stages, setStages] = useState<ExistingStage[]>([]);
  const [currentStageIds, setCurrentStageIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirmStage, setConfirmStage] = useState<ExistingStage | null>(null);
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);

  useEffect(() => {
    if (open) {
      fetchCurrentTenantStages();
      fetchExistingStages();
    }
  }, [open, tenantId]);

  const fetchCurrentTenantStages = async () => {
    if (!tenantId) return;
    
    try {
      const { data, error } = await supabase
        .from('tenants')
        .select('stage_ids')
        .eq('id', tenantId)
        .single();

      if (error) throw error;
      setCurrentStageIds(data?.stage_ids || []);
    } catch (error: any) {
      console.error('Error fetching current tenant stages:', error);
    }
  };

  const fetchExistingStages = async () => {
    try {
      setLoading(true);
      
      // Fetch all stages from documents_stages
      const { data: stagesData, error } = await supabase
        .from('documents_stages')
        .select('*')
        .order('title');

      if (error) throw error;

      setStages(stagesData || []);
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
    // Check if phase is already added to this tenant
    if (currentStageIds.includes(stage.id)) {
      toast({
        title: 'Stage Already Added',
        description: 'This stage is already assigned to this client',
        variant: 'destructive',
      });
      return;
    }
    setConfirmStage(stage);
    setIsConfirmDialogOpen(true);
  };

  const handleAddStage = async () => {
    if (!confirmStage || !tenantId) return;

    try {
      // Add stage ID to tenant's stage_ids array
      const updatedStageIds = [...currentStageIds, confirmStage.id];

      const { error } = await supabase
        .from('tenants')
        .update({ stage_ids: updatedStageIds })
        .eq('id', tenantId);

      if (error) throw error;

      toast({
        title: 'Stage Added',
        description: `"${confirmStage.title}" has been added to this client`,
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
      stage.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (stage.short_name && stage.short_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (stage.description && stage.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Filter out stages already assigned to this tenant
  const availableStages = filteredStages.filter(stage => !currentStageIds.includes(stage.id));

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
              Search and select a stage to add to this client
            </p>
          </DialogHeader>

          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search stage by name..."
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
            ) : availableStages.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                {stages.length === 0 ? "No stages found. Create a new stage first." : "No available stages found (all stages may already be assigned)"}
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {availableStages.map((stage, index) => (
                  <div
                    key={stage.id}
                    onClick={() => handleStageClick(stage)}
                    className="group flex items-center gap-4 p-4 hover:bg-primary/5 transition-all duration-200 cursor-pointer animate-fade-in"
                    style={{ animationDelay: `${index * 30}ms` }}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors">
                        {stage.title}
                      </p>
                      {stage.short_name && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Short: {stage.short_name}
                        </p>
                      )}
                      {stage.description && (
                        <p className="text-xs text-muted-foreground mt-1 truncate">
                          {stage.description}
                        </p>
                      )}
                    </div>
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
                Are you sure you want to add this stage to this client?
              </DialogDescription>
            </DialogHeader>
            {confirmStage && (
              <div className="my-6 p-4 bg-muted/30 rounded-lg border border-border/50">
                <div className="space-y-2">
                  <div>
                    <span className="text-sm font-semibold text-foreground">{confirmStage.title}</span>
                  </div>
                  {confirmStage.short_name && (
                    <div className="text-xs text-muted-foreground">
                      Short name: {confirmStage.short_name}
                    </div>
                  )}
                  {confirmStage.description && (
                    <div className="text-xs text-muted-foreground">
                      {confirmStage.description}
                    </div>
                  )}
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
