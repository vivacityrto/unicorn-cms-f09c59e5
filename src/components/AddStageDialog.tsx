import { useState, useEffect } from "react";
import { Dialog, DialogPortal, DialogOverlay, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Layers, Loader2, Circle, Clock, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface AddStageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  packageId?: number;
  tenantId?: number;
  stageData?: {
    id: number;
    stage_name: string;
    short_name: string | null;
    stage_description: string | null;
    video_url: string | null;
    order_number: number | null;
    status?: string | null;
  } | null;
}

export function AddStageDialog({
  open,
  onOpenChange,
  onSuccess,
  packageId,
  tenantId,
  stageData
}: AddStageDialogProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    stage_name: "",
    short_name: "",
    stage_description: "",
    video_url: "",
    order_number: 0,
    status: "not_started" as "not_started" | "in_progress" | "completed"
  });

  // Pre-fill form when editing
  useEffect(() => {
    if (stageData) {
      setFormData({
        stage_name: stageData.stage_name,
        short_name: stageData.short_name || "",
        stage_description: stageData.stage_description || "",
        video_url: stageData.video_url || "",
        order_number: stageData.order_number || 0,
        status: (stageData.status as "not_started" | "in_progress" | "completed") || "not_started"
      });
    } else {
      setFormData({
        stage_name: "",
        short_name: "",
        stage_description: "",
        video_url: "",
        order_number: 0,
        status: "not_started"
      });
    }
  }, [stageData, open]);

  const handleSave = async () => {
    if (!formData.stage_name.trim()) {
      toast({
        title: "Validation Error",
        description: "Name is required",
        variant: "destructive"
      });
      return;
    }

    try {
      setIsLoading(true);
      
      if (stageData) {
        // Update existing stage in documents_stages
        const { error } = await supabase
          .from('documents_stages')
          .update({
            title: formData.stage_name,
            short_name: formData.short_name || null,
            description: formData.stage_description || null,
            video_url: formData.video_url || null,
            status: formData.status,
          })
          .eq('id', stageData.id);
        
        if (error) throw error;
        toast({
          title: "Success",
          description: "Stage updated successfully"
        });
      } else {
        // Create new stage in documents_stages
        const { data: newStage, error: stageError } = await supabase
          .from('documents_stages')
          .insert({
            title: formData.stage_name,
            short_name: formData.short_name || null,
            description: formData.stage_description || null,
            video_url: formData.video_url || null,
            status: formData.status,
          })
          .select('id')
          .single();
        
        if (stageError) throw stageError;

        // If tenantId is provided, add the stage to tenant's stage_ids
        if (tenantId && newStage) {
          // Get current stage_ids
          const { data: tenantData, error: tenantFetchError } = await supabase
            .from('tenants')
            .select('stage_ids')
            .eq('id', tenantId)
            .single();

          if (tenantFetchError) throw tenantFetchError;

          const currentStageIds = tenantData?.stage_ids || [];
          const updatedStageIds = [...currentStageIds, newStage.id];

          // Update tenant with new stage_ids
          const { error: tenantUpdateError } = await supabase
            .from('tenants')
            .update({ stage_ids: updatedStageIds })
            .eq('id', tenantId);

          if (tenantUpdateError) throw tenantUpdateError;
        }

        toast({
          title: "Success",
          description: "Stage created successfully"
        });
      }

      // Reset form
      setFormData({
        stage_name: "",
        short_name: "",
        stage_description: "",
        video_url: "",
        order_number: 0,
        status: "not_started"
      });
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || `Failed to ${stageData ? 'update' : 'create'} stage`,
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="z-[60] bg-black/70" />
        <DialogPrimitive.Content
          className={cn(
            "fixed left-[50%] top-[50%] z-[60] flex flex-col w-full max-w-[90vw] max-h-[80vh] translate-x-[-50%] translate-y-[-50%] gap-4 border-[3px] border-[#dfdfdf] bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg"
          )}
          style={{ width: '650px' }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5" />
              {stageData ? 'Edit Stage' : 'Create New Stage'}
            </DialogTitle>
            <DialogDescription>
              {stageData ? 'Update the stage details' : 'Add a new stage to organize documents in your workflow'}
            </DialogDescription>
          </DialogHeader>

          <div className="overflow-y-auto scrollbar-hide flex-1 space-y-6 py-4 px-1">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="stage-name">Name</Label>
              <Input
                id="stage-name"
                value={formData.stage_name}
                onChange={e => setFormData({ ...formData, stage_name: e.target.value })}
                placeholder="Enter stage name"
                autoFocus
              />
            </div>

            {/* Short Name */}
            <div className="space-y-2">
              <Label htmlFor="stage-short-name">Short Name</Label>
              <Input
                id="stage-short-name"
                value={formData.short_name}
                onChange={e => setFormData({ ...formData, short_name: e.target.value })}
                placeholder="Enter short name"
              />
              <p className="text-xs text-muted-foreground">
                Used when the full stage name would be too long to display
              </p>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="stage-description">Description</Label>
              <Textarea
                id="stage-description"
                value={formData.stage_description}
                onChange={e => setFormData({ ...formData, stage_description: e.target.value })}
                placeholder="Enter description"
                rows={4}
                className="resize-none"
              />
            </div>

            {/* Help Video URL */}
            <div className="space-y-2">
              <Label htmlFor="stage-video">Help Video URL</Label>
              <Input
                id="stage-video"
                type="url"
                value={formData.video_url}
                onChange={e => setFormData({ ...formData, video_url: e.target.value })}
                placeholder="https://..."
              />
            </div>

            {/* Status */}
            <div className="space-y-2 w-1/2">
              <Label htmlFor="stage-status">Status</Label>
              <Select
                value={formData.status}
                onValueChange={(value: "not_started" | "in_progress" | "completed") => setFormData({ ...formData, status: value })}
              >
                <SelectTrigger id="stage-status">
                  <SelectValue placeholder="Select status">
                    {formData.status && (
                      <div className="flex items-center gap-2">
                        {formData.status === 'completed' && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                        {formData.status === 'in_progress' && <Clock className="h-4 w-4 text-blue-500" />}
                        {formData.status === 'not_started' && <Circle className="h-4 w-4 text-muted-foreground" />}
                        <span className="capitalize">{formData.status.replace('_', ' ')}</span>
                      </div>
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="bg-background">
                  <SelectItem value="not_started">
                    <div className="flex items-center gap-2">
                      <Circle className="h-4 w-4 text-muted-foreground" />
                      <span>Not Started</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="in_progress">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-blue-500" />
                      <span>In Progress</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="completed">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      <span>Completed</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
              className="hover:bg-[#40c6e524] hover:text-black"
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isLoading || !formData.stage_name.trim()}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {stageData ? 'Updating...' : 'Creating...'}
                </>
              ) : (
                <>
                  <Layers className="mr-2 h-4 w-4" />
                  {stageData ? 'Update Stage' : 'Create Stage'}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
