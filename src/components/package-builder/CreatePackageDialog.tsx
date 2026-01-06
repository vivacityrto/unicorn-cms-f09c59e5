import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePackageBuilder } from '@/hooks/usePackageBuilder';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Package } from 'lucide-react';

interface CreatePackageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreatePackageDialog({ open, onOpenChange }: CreatePackageDialogProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { createPackage } = usePackageBuilder();
  
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    full_text: '',
    details: '',
    package_type: 'project',
    duration_months: 12,
    total_hours: 0
  });

  const handleCreate = async () => {
    if (!formData.name.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Package abbreviation is required',
        variant: 'destructive'
      });
      return;
    }

    if (!formData.full_text.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Package name is required',
        variant: 'destructive'
      });
      return;
    }

    try {
      setIsLoading(true);
      const newPackage = await createPackage({
        name: formData.name,
        full_text: formData.full_text,
        details: formData.details,
        package_type: formData.package_type,
        duration_months: formData.duration_months,
        total_hours: formData.total_hours,
        status: 'inactive' // Start as draft
      });

      toast({
        title: 'Package Created',
        description: `"${formData.full_text}" has been created. Add stages to configure it.`
      });

      onOpenChange(false);
      setFormData({
        name: '',
        full_text: '',
        details: '',
        package_type: 'project',
        duration_months: 12,
        total_hours: 0
      });

      // Navigate to the package builder
      navigate(`/admin/package-builder/${newPackage.id}`);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create package',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Create New Package
          </DialogTitle>
          <DialogDescription>
            Create a new package template. You'll be able to add stages and configure details after creation.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Abbreviation *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., KS-RTO"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="package_type">Package Type</Label>
              <Select 
                value={formData.package_type} 
                onValueChange={(value) => setFormData({ ...formData, package_type: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="project">Project</SelectItem>
                  <SelectItem value="membership">Membership</SelectItem>
                  <SelectItem value="regulatory_submission">Regulatory Submission</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="full_text">Package Name *</Label>
            <Input
              id="full_text"
              value={formData.full_text}
              onChange={(e) => setFormData({ ...formData, full_text: e.target.value })}
              placeholder="e.g., Kickstart RTO Package"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="details">Description</Label>
            <Textarea
              id="details"
              value={formData.details}
              onChange={(e) => setFormData({ ...formData, details: e.target.value })}
              placeholder="Describe what this package includes..."
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="duration">Duration (months)</Label>
              <Input
                id="duration"
                type="number"
                min={1}
                value={formData.duration_months}
                onChange={(e) => setFormData({ ...formData, duration_months: parseInt(e.target.value) || 12 })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hours">Total Hours</Label>
              <Input
                id="hours"
                type="number"
                min={0}
                value={formData.total_hours}
                onChange={(e) => setFormData({ ...formData, total_hours: parseInt(e.target.value) || 0 })}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              'Create Package'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}