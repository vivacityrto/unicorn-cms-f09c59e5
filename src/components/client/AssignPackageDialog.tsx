import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Package2, Loader2 } from 'lucide-react';

interface AssignPackageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: number;
  tenantName: string;
  onSuccess?: () => void;
}

interface PackageOption {
  id: number;
  name: string;
  package_type: string;
}

export function AssignPackageDialog({ open, onOpenChange, tenantId, tenantName, onSuccess }: AssignPackageDialogProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [selectedPackageId, setSelectedPackageId] = useState<string>('');
  const [packages, setPackages] = useState<PackageOption[]>([]);
  const [loadingPackages, setLoadingPackages] = useState(false);

  useEffect(() => {
    if (!open) {
      setSelectedPackageId('');
      return;
    }
    const fetchPackages = async () => {
      setLoadingPackages(true);
      const { data, error } = await supabase
        .from('packages')
        .select('id, name, package_type')
        .order('name');
      if (!error && data) setPackages(data);
      setLoadingPackages(false);
    };
    fetchPackages();
  }, [open]);

  const handleAssign = async () => {
    if (!selectedPackageId) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('package_instances').insert({
        tenant_id: tenantId,
        package_id: parseInt(selectedPackageId),
        is_complete: false,
        start_date: new Date().toISOString().split('T')[0],
        clo_id: 0,
      });
      if (error) throw error;

      toast({ title: 'Success', description: 'Package assigned successfully' });
      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to assign package', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent style={{ width: '450px', maxWidth: '90vw' }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package2 className="h-5 w-5" />
            Assign Package
          </DialogTitle>
          <DialogDescription>
            Assign a package to {tenantName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="assign-package">Package</Label>
            <Select value={selectedPackageId} onValueChange={setSelectedPackageId}>
              <SelectTrigger id="assign-package">
                <SelectValue placeholder={loadingPackages ? "Loading..." : "Select a package"} />
              </SelectTrigger>
              <SelectContent>
                {packages.map((pkg) => (
                  <SelectItem key={pkg.id} value={String(pkg.id)}>
                    {pkg.name} ({pkg.package_type})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleAssign} disabled={saving || !selectedPackageId}>
            {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Assigning...</> : 'Assign Package'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
