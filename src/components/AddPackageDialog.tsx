import { useState, useEffect } from 'react';
import { Dialog, DialogPortal, DialogOverlay, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Package2, Loader2, Plus, Calendar } from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
interface AddPackageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  packageToEdit?: {
    id: number;
    name: string;
    full_text: string;
    details: string;
    status: string;
    duration_months?: number | null;
  } | null;
}
export function AddPackageDialog({
  open,
  onOpenChange,
  onSuccess,
  packageToEdit
}: AddPackageDialogProps) {
  const {
    toast
  } = useToast();
  const [packageAbbr, setPackageAbbr] = useState('');
  const [packageFullText, setPackageFullText] = useState('');
  const [details, setDetails] = useState('');
  const [durationMonths, setDurationMonths] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (packageToEdit && open) {
      setPackageAbbr(packageToEdit.name || '');
      setPackageFullText(packageToEdit.full_text || '');
      setDetails(packageToEdit.details || '');
      setDurationMonths(packageToEdit.duration_months?.toString() || '');
      setIsActive(packageToEdit.status === 'active');
    }
  }, [packageToEdit, open]);
  const handleSavePackage = async () => {
    if (!packageAbbr.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Package abbreviation is required',
        variant: 'destructive'
      });
      return;
    }
    if (!packageFullText.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Package name is required',
        variant: 'destructive'
      });
      return;
    }
    setSaving(true);
    try {
      if (packageToEdit) {
        // Update existing package
        const {
          error: packageError
        } = await supabase.from('packages').update({
          name: packageAbbr.trim(),
          full_text: packageFullText.trim(),
          details: details.trim(),
          duration_months: durationMonths ? parseInt(durationMonths) : null,
          status: isActive ? 'active' : 'inactive'
        }).eq('id', packageToEdit.id);
        if (packageError) throw packageError;
        toast({
          title: 'Success',
          description: 'Package updated successfully'
        });
      } else {
        // Insert new package - use RPC or explicit column selection to avoid type issues
        const {
          data: newPackage,
          error: packageError
        } = await supabase.from('packages').insert([{
          name: packageAbbr.trim(),
          full_text: packageFullText.trim(),
          details: details.trim(),
          duration_months: durationMonths ? parseInt(durationMonths) : null,
          status: isActive ? 'active' : 'inactive'
        }] as any).select('id').single();
        if (packageError) throw packageError;
        toast({
          title: 'Success',
          description: 'Package created successfully'
        });
      }
      resetForm();
      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || `Failed to ${packageToEdit ? 'update' : 'create'} package`,
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };
  const resetForm = () => {
    setPackageAbbr('');
    setPackageFullText('');
    setDetails('');
    setDurationMonths('');
    setIsActive(true);
  };
  useEffect(() => {
    if (!open) {
      resetForm();
    }
  }, [open]);
  return <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="z-[70] bg-black/70" />
        <DialogPrimitive.Content className="fixed left-[50%] top-[50%] z-[70] grid w-full max-h-[90vh] translate-x-[-50%] translate-y-[-50%] gap-4 overflow-y-auto border-[3px] border-[#dfdfdf] bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg" style={{
        width: '650px',
        maxWidth: '90vw'
      }}>
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="flex items-center gap-2">
                <Package2 className="h-5 w-5" />
                {packageToEdit ? 'Edit Package' : 'Add New Package'}
              </DialogTitle>
              <DialogDescription>
                {packageToEdit ? 'Update package information' : 'Create a new package'}
              </DialogDescription>
            </div>
            
            {packageToEdit && (
              <Badge
                variant={isActive ? "default" : "secondary"}
                className={`cursor-pointer px-4 py-1.5 ${!isActive ? 'bg-muted text-muted-foreground hover:bg-muted/80' : 'hover:opacity-80'}`}
                onClick={() => setIsActive(!isActive)}
              >
                {isActive ? 'Active' : 'Inactive'}
              </Badge>
            )}
          </div>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="package-abbr">Package Abbr. *</Label>
            <Input id="package-abbr" placeholder="Enter package abbreviation..." value={packageAbbr} onChange={e => setPackageAbbr(e.target.value)} autoFocus />
          </div>

          <div className="space-y-2">
            <Label htmlFor="package-full-text">Package Name *</Label>
            <Input id="package-full-text" placeholder="Enter full package name..." value={packageFullText} onChange={e => setPackageFullText(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="details">Details</Label>
            <Textarea id="details" placeholder="Enter package details..." value={details} onChange={e => setDetails(e.target.value)} rows={6} className="min-h-[150px]" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="duration">Duration (months)</Label>
            <Input 
              id="duration" 
              type="number" 
              min="1"
              placeholder="Enter duration in months..." 
              value={durationMonths} 
              onChange={e => setDurationMonths(e.target.value)} 
            />
          </div>
        </div>

        <DialogFooter className="flex-row items-center justify-between sm:justify-between">
          <div className="flex items-center gap-2 text-muted-foreground" style={{ fontSize: '14px' }}>
            <Calendar className="h-4 w-4" />
            <span>Created {new Date().toLocaleDateString()}</span>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving} className="hover:bg-[#40c6e524] hover:text-black">
              Cancel
            </Button>
            <Button onClick={handleSavePackage} disabled={saving || !packageAbbr.trim() || !packageFullText.trim()}>
              {saving ? <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {packageToEdit ? 'Updating...' : 'Creating...'}
                </> : <>
                  <Package2 className="mr-2 h-4 w-4" />
                  {packageToEdit ? 'Update Package' : 'Create Package'}
                </>}
            </Button>
          </div>
        </DialogFooter>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>;
}