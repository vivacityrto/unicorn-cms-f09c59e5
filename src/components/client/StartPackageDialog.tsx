import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Loader2, Package2, User } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useClientPackageInstances } from '@/hooks/useClientPackageInstances';
import { useNavigate } from 'react-router-dom';

interface StartPackageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: number;
  tenantName: string;
  onSuccess?: () => void;
}

interface Package {
  id: number;
  name: string;
  full_text: string | null;
  status: string;
}

interface CscUser {
  user_uuid: string;
  first_name: string;
  last_name: string;
}

export function StartPackageDialog({
  open,
  onOpenChange,
  tenantId,
  tenantName,
  onSuccess
}: StartPackageDialogProps) {
  const navigate = useNavigate();
  const { startPackage, loading: starting } = useClientPackageInstances();
  const [packages, setPackages] = useState<Package[]>([]);
  const [cscUsers, setCscUsers] = useState<CscUser[]>([]);
  const [selectedPackageId, setSelectedPackageId] = useState<string>('');
  const [selectedCscId, setSelectedCscId] = useState<string>('');
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (open) {
      fetchData();
    }
  }, [open]);

  const fetchData = async () => {
    setLoadingData(true);
    try {
      // Fetch active packages
      const { data: packagesData } = await supabase
        .from('packages')
        .select('id, name, full_text, status')
        .eq('status', 'active')
        .order('name');

      setPackages(packagesData || []);

      // Fetch CSC users (Super Admin and Team Members)
      const usersResult = await (supabase
        .from('users' as any)
        .select('user_uuid, first_name, last_name')
        .in('unicorn_role', ['Super Admin', 'Team Member', 'Team Leader'])
        .eq('is_active', true)
        .order('first_name')) as { data: CscUser[] | null; error: any };
      const usersData = usersResult.data;

      setCscUsers(usersData || []);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoadingData(false);
    }
  };

  const handleStart = async () => {
    if (!selectedPackageId) return;

    const packageInstanceId = await startPackage(
      tenantId,
      parseInt(selectedPackageId),
      selectedCscId || undefined
    );

    if (packageInstanceId) {
      onOpenChange(false);
      onSuccess?.();
      // Navigate to tenant detail with the new package instance
      navigate(`/tenant/${tenantId}`);
    }
  };

  const handleClose = () => {
    setSelectedPackageId('');
    setSelectedCscId('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package2 className="h-5 w-5" />
            Start Package
          </DialogTitle>
          <DialogDescription>
            Create a new package instance for <strong>{tenantName}</strong>. This will create stages, tasks, and documents from the package template.
          </DialogDescription>
        </DialogHeader>

        {loadingData ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="package">Package *</Label>
              <Select value={selectedPackageId} onValueChange={setSelectedPackageId}>
                <SelectTrigger id="package">
                  <SelectValue placeholder="Select a package..." />
                </SelectTrigger>
                <SelectContent>
                  {packages.map((pkg) => (
                    <SelectItem key={pkg.id} value={pkg.id.toString()}>
                      {pkg.name}{pkg.full_text ? ` — ${pkg.full_text}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="csc" className="flex items-center gap-2">
                <User className="h-4 w-4" />
                Assign CSC (optional)
              </Label>
              <Select value={selectedCscId || "__none__"} onValueChange={(v) => setSelectedCscId(v === "__none__" ? "" : v)}>
                <SelectTrigger id="csc">
                  <SelectValue placeholder="Select a team member..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No assignment</SelectItem>
                  {cscUsers.map((user) => (
                    <SelectItem key={user.user_uuid} value={user.user_uuid}>
                      {user.first_name} {user.last_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleStart}
            disabled={!selectedPackageId || starting || loadingData}
          >
            {starting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Starting...
              </>
            ) : (
              'Start Package'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
