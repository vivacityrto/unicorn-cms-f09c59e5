import { useState, useEffect } from "react";
import { Dialog, DialogPortal, DialogOverlay, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Layers, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
interface AddStageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  packageId?: number;
  stageData?: {
    id: number;
    stage_name: string;
    short_name: string | null;
    stage_description: string | null;
    video_url: string | null;
    order_number: number | null;
    is_active: boolean;
  } | null;
}
export function AddStageDialog({
  open,
  onOpenChange,
  onSuccess,
  packageId,
  stageData
}: AddStageDialogProps) {
  const {
    toast
  } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    stage_name: "",
    short_name: "",
    stage_description: "",
    video_url: "",
    order_number: 0,
    is_active: true
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
        is_active: stageData.is_active
      });
    } else {
      setFormData({
        stage_name: "",
        short_name: "",
        stage_description: "",
        video_url: "",
        order_number: 0,
        is_active: true
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
    if (!packageId) {
      toast({
        title: "Error",
        description: "No package selected for this stage",
        variant: "destructive"
      });
      return;
    }
    try {
      setIsLoading(true);
      if (stageData) {
        // Update existing stage
        const {
          error
        } = await supabase.from('package_stages').update({
          stage_name: formData.stage_name,
          short_name: formData.short_name || null,
          stage_description: formData.stage_description || null,
          video_url: formData.video_url || null,
          order_number: formData.order_number,
          is_active: formData.is_active
        } as any).eq('id', stageData.id);
        if (error) throw error;
        toast({
          title: "Success",
          description: "Stage updated successfully"
        });
      } else {
        // Create stage in documents_stages and get ID, then link to package
        const { data: newStage, error: stageError } = await supabase
          .from('documents_stages')
          .insert({
            title: formData.stage_name,
            short_name: formData.short_name || null,
            description: formData.stage_description || null,
            video_url: formData.video_url || null,
          })
          .select('id')
          .single();
        
        if (stageError) throw stageError;
        
        // Link to package - this is a dependent operation so must be sequential
        const { error } = await supabase.from('package_stages').insert({
          package_id: packageId,
          stage_id: newStage.id,
          stage_name: formData.stage_name,
          short_name: formData.short_name || null,
          stage_description: formData.stage_description || null,
          video_url: formData.video_url || null,
          order_number: formData.order_number,
          is_active: formData.is_active
        } as any);
        if (error) throw error;
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
        is_active: true
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
  return <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="z-[60] bg-black/70" />
        <DialogPrimitive.Content className={cn("fixed left-[50%] top-[50%] z-[60] flex flex-col w-full max-w-[90vw] max-h-[80vh] translate-x-[-50%] translate-y-[-50%] gap-4 border-[3px] border-[#dfdfdf] bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg")} style={{
        width: '650px'
      }}>
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
            <Input id="stage-name" value={formData.stage_name} onChange={e => setFormData({
              ...formData,
              stage_name: e.target.value
            })} placeholder="Enter stage name" autoFocus />
          </div>

          {/* Short Name */}
          <div className="space-y-2">
            <Label htmlFor="stage-short-name">Short Name</Label>
            <Input id="stage-short-name" value={formData.short_name} onChange={e => setFormData({
              ...formData,
              short_name: e.target.value
            })} placeholder="Enter short name" />
            <p className="text-xs text-muted-foreground">
              Used when the full stage name would be too long to display
            </p>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="stage-description">Description</Label>
            <Textarea id="stage-description" value={formData.stage_description} onChange={e => setFormData({
              ...formData,
              stage_description: e.target.value
            })} placeholder="Enter description" rows={4} className="resize-none" />
          </div>

          {/* Help Video URL */}
          <div className="space-y-2">
            <Label htmlFor="stage-video">Help Video URL</Label>
            <Input id="stage-video" type="url" value={formData.video_url} onChange={e => setFormData({
              ...formData,
              video_url: e.target.value
            })} placeholder="https://..." />
          </div>

          {/* Order Number */}
          

          {/* Active Status */}
          <div className="flex items-center justify-between space-x-2">
            <div className="space-y-0.5">
              <Label htmlFor="stage-active">Active Status</Label>
              <p className="text-xs text-muted-foreground">
                Inactive stages won't be visible to users
              </p>
            </div>
            <Switch id="stage-active" checked={formData.is_active} onCheckedChange={checked => setFormData({
              ...formData,
              is_active: checked
            })} />
          </div>
          
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading} className="hover:bg-[#40c6e524] hover:text-black">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isLoading || !formData.stage_name.trim()}>
            {isLoading ? <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {stageData ? 'Updating...' : 'Creating...'}
              </> : <>
                <Layers className="mr-2 h-4 w-4" />
                {stageData ? 'Update Stage' : 'Create Stage'}
              </>}
          </Button>
        </DialogFooter>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>;
}