import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Package2, User, Link2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useClientPackageInstances } from '@/hooks/useClientPackageInstances';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';

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
  total_hours: number | null;
}

interface CscUser {
  user_uuid: string;
  first_name: string;
  last_name: string;
}

interface ActiveInstance {
  id: number;
  package_id: number;
  package_name: string;
  manager_id: string | null;
}

export function StartPackageDialog({
  open,
  onOpenChange,
  tenantId,
  tenantName,
  onSuccess
}: StartPackageDialogProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { startPackage, loading: starting } = useClientPackageInstances();
  const [packages, setPackages] = useState<Package[]>([]);
  const [cscUsers, setCscUsers] = useState<CscUser[]>([]);
  const [activeInstances, setActiveInstances] = useState<ActiveInstance[]>([]);
  const [selectedPackageId, setSelectedPackageId] = useState<string>('');
  const [selectedCscId, setSelectedCscId] = useState<string>('');
  const [attachToInstanceId, setAttachToInstanceId] = useState<string>('');
  const [comments, setComments] = useState('');
  const [hoursUsed, setHoursUsed] = useState<string>('');
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
        .select('id, name, full_text, status, total_hours')
        .eq('status', 'active')
        .order('name');

      setPackages(packagesData || []);

      // Fetch CSC users (users flagged as is_csc)
      const usersResult = await (supabase
        .from('users' as any)
        .select('user_uuid, first_name, last_name')
        .eq('is_csc', true)
        .eq('disabled', false)
        .eq('archived', false)
        .order('first_name')) as { data: CscUser[] | null; error: any };
      setCscUsers(usersResult.data || []);

      // Fetch active (non-complete, non-child) package instances for this tenant
      const { data: instancesData } = await (supabase as any)
        .from('package_instances')
        .select('id, package_id, manager_id')
        .eq('tenant_id', tenantId)
        .eq('is_complete', false)
        .is('parent_instance_id', null)
        .order('start_date', { ascending: false });

      if (instancesData && instancesData.length > 0) {
        const pkgIds = [...new Set(instancesData.map((i: any) => i.package_id))] as number[];
        const { data: pkgNames } = await supabase
          .from('packages')
          .select('id, name, full_text')
          .in('id', pkgIds);
        const nameMap = new Map((pkgNames || []).map(p => [p.id, (p as any).full_text || p.name]));
        
        setActiveInstances(instancesData.map((inst: any) => ({
          id: inst.id,
          package_id: inst.package_id,
          package_name: nameMap.get(inst.package_id) || `Package #${inst.package_id}`,
          manager_id: inst.manager_id || null,
        })));
      } else {
        setActiveInstances([]);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoadingData(false);
    }
  };

  // Auto-fill CSC when attaching to a parent package
  const handleAttachChange = (value: string) => {
    const id = value === '__none__' ? '' : value;
    setAttachToInstanceId(id);
    if (id) {
      const parent = activeInstances.find(inst => inst.id === parseInt(id));
      if (parent?.manager_id) {
        setSelectedCscId(parent.manager_id);
      }
      // Auto-fill hours from the selected package's total_hours
      const selectedPkg = packages.find(p => p.id === parseInt(selectedPackageId));
      setHoursUsed(selectedPkg?.total_hours?.toString() || '');
    } else {
      setHoursUsed('');
      setComments('');
    }
  };

  const handleStart = async () => {
    if (!selectedPackageId) return;

    const cscToUse = selectedCscId || (attachToInstanceId 
      ? activeInstances.find(i => i.id === parseInt(attachToInstanceId))?.manager_id 
      : undefined) || undefined;

    const packageInstanceId = await startPackage(
      tenantId,
      parseInt(selectedPackageId),
      cscToUse
    );

    if (packageInstanceId) {
      const parentId = attachToInstanceId ? parseInt(attachToInstanceId) : null;

      if (parentId) {
        // Link the new instance to the parent
        await (supabase as any)
          .from('package_instances')
          .update({ parent_instance_id: parentId })
          .eq('id', packageInstanceId);

        // Get the new package's total_hours to add to parent's hours_added
        const selectedPkg = packages.find(p => p.id === parseInt(selectedPackageId));
        const hoursToAdd = selectedPkg?.total_hours || 0;

        if (hoursToAdd > 0) {
          // Get current hours_added on parent
          const { data: parentData } = await (supabase as any)
            .from('package_instances')
            .select('hours_added')
            .eq('id', parentId)
            .single();

          const currentAdded = parentData?.hours_added || 0;
          await (supabase as any)
            .from('package_instances')
            .update({ hours_added: currentAdded + hoursToAdd })
            .eq('id', parentId);
        }

        toast({
          title: 'Package attached',
          description: `+${hoursToAdd}h added to parent package`,
        });
      }

      onOpenChange(false);
      onSuccess?.();
      navigate(`/tenant/${tenantId}`);
    }
  };

  const handleClose = () => {
    setSelectedPackageId('');
    setSelectedCscId('');
    setAttachToInstanceId('');
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

            {activeInstances.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="attach" className="flex items-center gap-2">
                  <Link2 className="h-4 w-4" />
                  Attach to package (optional)
                </Label>
                <Select value={attachToInstanceId || "__none__"} onValueChange={handleAttachChange}>
                  <SelectTrigger id="attach">
                    <SelectValue placeholder="Stand-alone package" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Stand-alone (no parent)</SelectItem>
                    {activeInstances.map((inst) => (
                      <SelectItem key={inst.id} value={inst.id.toString()}>
                        {inst.package_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {attachToInstanceId && attachToInstanceId !== '__none__' && (
                  <p className="text-xs text-muted-foreground">
                    Hours from this package will be added to the parent's included hours and its time will roll into the parent burn-down.
                  </p>
                )}
              </div>
            )}
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
