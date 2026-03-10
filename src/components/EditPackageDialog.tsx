import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface EditPackageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  packageData: {
    id: number;
    name: string;
    slug: string | null;
    full_text: string | null;
    details: string | null;
    status: string;
    duration_months?: number | null;
    total_hours?: number | null;
  } | null;
}

export const EditPackageDialog = ({ open, onOpenChange, onSuccess, packageData }: EditPackageDialogProps) => {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    full_text: "",
    details: "",
    status: "active",
    duration_months: "",
    total_hours: ""
  });
  const [showPropagateDialog, setShowPropagateDialog] = useState(false);
  const [pendingTotalHours, setPendingTotalHours] = useState(0);

  useEffect(() => {
    if (packageData) {
      setFormData({
        name: packageData.name || "",
        slug: packageData.slug || "",
        full_text: packageData.full_text || "",
        details: packageData.details || "",
        status: packageData.status || "active",
        duration_months: packageData.duration_months?.toString() || "",
        total_hours: packageData.total_hours?.toString() || ""
      });
    }
  }, [packageData]);

  const handleSave = async () => {
    if (!packageData) return;

    try {
      const newTotalHours = formData.total_hours ? parseInt(formData.total_hours) : null;
      const oldTotalHours = packageData.total_hours ?? null;

      const { error } = await supabase
        .from('packages')
        .update({
          name: formData.name,
          slug: formData.slug,
          full_text: formData.full_text,
          details: formData.details,
          status: formData.status,
          duration_months: formData.duration_months ? parseInt(formData.duration_months) : null,
          total_hours: newTotalHours
        })
        .eq('id', packageData.id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Package updated successfully'
      });
      onOpenChange(false);
      onSuccess();

      // If total_hours changed, prompt to propagate
      if (newTotalHours !== null && newTotalHours !== oldTotalHours) {
        setPendingTotalHours(newTotalHours);
        setShowPropagateDialog(true);
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      });
    }
  };

  const handlePropagateToInstances = async () => {
    if (!packageData) return;
    try {
      const client: any = supabase;
      const { error } = await client
        .from('package_instances')
        .update({ included_minutes: pendingTotalHours * 60 })
        .eq('package_id', packageData.id)
        .eq('status', 'active');
      if (error) throw error;
      toast({
        title: 'Instances Updated',
        description: `Active instances updated to ${pendingTotalHours}h included.`
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update instances',
        variant: 'destructive'
      });
    } finally {
      setShowPropagateDialog(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Package</DialogTitle>
            <DialogDescription>
              Update package information
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="name">Package Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Enter package name"
              />
            </div>

            <div>
              <Label htmlFor="slug">Slug</Label>
              <Input
                id="slug"
                value={formData.slug}
                onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                placeholder="Enter slug"
              />
            </div>

            <div>
              <Label htmlFor="full_text">Description</Label>
              <Textarea
                id="full_text"
                value={formData.full_text}
                onChange={(e) => setFormData({ ...formData, full_text: e.target.value })}
                placeholder="Enter description"
                rows={3}
              />
            </div>

            <div>
              <Label htmlFor="details">Details</Label>
              <Textarea
                id="details"
                value={formData.details}
                onChange={(e) => setFormData({ ...formData, details: e.target.value })}
                placeholder="Enter package details"
                rows={5}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="duration_months">Duration (months)</Label>
                <Input
                  id="duration_months"
                  type="number"
                  min="1"
                  value={formData.duration_months}
                  onChange={(e) => setFormData({ ...formData, duration_months: e.target.value })}
                  placeholder="Enter duration in months"
                />
              </div>
              <div>
                <Label htmlFor="total_hours">Total Hours</Label>
                <Input
                  id="total_hours"
                  type="number"
                  min="0"
                  value={formData.total_hours}
                  onChange={(e) => setFormData({ ...formData, total_hours: e.target.value })}
                  placeholder="Enter total hours"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="status">Status</Label>
              <Select value={formData.status} onValueChange={(value) => setFormData({ ...formData, status: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} className="hover:bg-[#40c6e524] hover:text-black">
              Cancel
            </Button>
            <Button onClick={handleSave}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={showPropagateDialog}
        onOpenChange={setShowPropagateDialog}
        variant="warning"
        title="Update Active Package Instances?"
        description={`This will update the included hours to ${pendingTotalHours}h for all active instances of this package. Instances that should keep their current hours can be edited individually.`}
        confirmText="Update Active Instances"
        cancelText="Skip"
        onConfirm={handlePropagateToInstances}
      />
    </>
  );
};
