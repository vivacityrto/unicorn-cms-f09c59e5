import { useState, useEffect, useMemo, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Loader2, Package2, User, Link2, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useClientPackageInstances } from '@/hooks/useClientPackageInstances';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { getPackageStream, streamsConflict, STREAM_LABELS, type PackageStream } from '@/lib/packageStream';

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
  slug: string | null;
  status: string;
  total_hours: number | null;
  package_type: string | null;
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
  package_type: string | null;
  package_stream: PackageStream;
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

  const fetchData = useCallback(async () => {
    setLoadingData(true);
    try {
      // Fetch active packages
      const { data: packagesData } = await supabase
        .from('packages')
        .select('id, name, full_text, slug, status, total_hours, package_type')
        .eq('status', 'active')
        .order('name');

      setPackages((packagesData || []) as Package[]);

      // Fetch CSC users (users flagged as is_csc)
      const usersResult = await (supabase
        .from('users' as any)
        .select('user_uuid, first_name, last_name')
        .eq('is_csc', true)
        .eq('disabled', false)
        .eq('archived', false)
        .order('first_name')) as { data: CscUser[] | null; error: any };
      setCscUsers(usersResult.data || []);

      // Fetch active (non-complete, non-child) package instances for this tenant.
      // Excludes cancelled membership instances so they don't block re-starts.
      const { data: instancesData } = await (supabase as any)
        .from('package_instances')
        .select('id, package_id, manager_id, membership_state')
        .eq('tenant_id', tenantId)
        .eq('is_complete', false)
        .is('parent_instance_id', null)
        .order('start_date', { ascending: false });

      const liveInstances = (instancesData || []).filter(
        (i: any) => (i.membership_state ?? 'active') !== 'cancelled'
      );

      if (liveInstances.length > 0) {
        const pkgIds = [...new Set(liveInstances.map((i: any) => i.package_id))] as number[];
        const { data: pkgRows } = await supabase
          .from('packages')
          .select('id, name, full_text, slug, package_type')
          .in('id', pkgIds);
        const pkgMap = new Map(
          (pkgRows || []).map((p: any) => [p.id, p])
        );

        setActiveInstances(liveInstances.map((inst: any) => {
          const p = pkgMap.get(inst.package_id);
          return {
            id: inst.id,
            package_id: inst.package_id,
            package_name: (p as any)?.full_text || (p as any)?.name || `Package #${inst.package_id}`,
            package_type: (p as any)?.package_type ?? null,
            package_stream: getPackageStream((p as any)?.name, (p as any)?.slug),
            manager_id: inst.manager_id || null,
          };
        }));
      } else {
        setActiveInstances([]);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoadingData(false);
    }
  }, [tenantId]);

  useEffect(() => {
    if (open) {
      fetchData();
    }
  }, [open, fetchData]);

  // Compute duplicate-type conflict for the selected package, only for stand-alone starts.
  const selectedPackage = useMemo(
    () => packages.find(p => p.id === parseInt(selectedPackageId)) || null,
    [packages, selectedPackageId]
  );
  const selectedStream: PackageStream | null = useMemo(
    () => selectedPackage ? getPackageStream(selectedPackage.name, selectedPackage.slug) : null,
    [selectedPackage]
  );
  const conflictInstance = useMemo(() => {
    if (!selectedPackage || !selectedStream) return null;
    if (attachToInstanceId) return null; // add-ons are exempt
    return activeInstances.find(inst =>
      inst.package_type === selectedPackage.package_type &&
      streamsConflict(inst.package_stream, selectedStream)
    ) || null;
  }, [selectedPackage, selectedStream, attachToInstanceId, activeInstances]);

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
        // Link the new instance to the parent, save comments and hours_used
        const updatePayload: Record<string, any> = { parent_instance_id: parentId };
        if (comments.trim()) updatePayload.comments = comments.trim();
        if (hoursUsed) updatePayload.hours_used = parseFloat(hoursUsed);
        await (supabase as any)
          .from('package_instances')
          .update(updatePayload)
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
    setComments('');
    setHoursUsed('');
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
                  {packages.map((pkg) => {
                    const stream = getPackageStream(pkg.name, pkg.slug);
                    const label = STREAM_LABELS[stream];
                    return (
                      <SelectItem key={pkg.id} value={pkg.id.toString()}>
                        <span className="inline-flex items-center gap-2">
                          <span>{pkg.name}{pkg.full_text ? ` — ${pkg.full_text}` : ''}</span>
                          {label && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 leading-4">
                              {label}
                            </Badge>
                          )}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {conflictInstance && selectedPackage && (
                <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <div className="space-y-1">
                    <p className="font-medium">Cannot start this package</p>
                    <p className="text-xs leading-relaxed">
                      This client already has an active{' '}
                      <strong>{selectedPackage.package_type}</strong>
                      {STREAM_LABELS[conflictInstance.package_stream] ? ` (${STREAM_LABELS[conflictInstance.package_stream]})` : ''}{' '}
                      package: <strong>{conflictInstance.package_name}</strong>. Cancel or
                      complete it first, or attach this as an add-on below.
                    </p>
                  </div>
                </div>
              )}
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
                  <>
                    <p className="text-xs text-muted-foreground">
                      Hours from this package will be added to the parent's included hours and its time will roll into the parent burn-down.
                    </p>
                    <div className="grid grid-cols-2 gap-3 pt-2">
                      <div className="space-y-1">
                        <Label htmlFor="hours">Hours</Label>
                        <Input
                          id="hours"
                          type="number"
                          min="0"
                          step="0.5"
                          value={hoursUsed}
                          onChange={(e) => setHoursUsed(e.target.value)}
                          placeholder="0"
                        />
                      </div>
                    </div>
                    <div className="space-y-1 pt-1">
                      <Label htmlFor="comments">Comments</Label>
                      <Textarea
                        id="comments"
                        value={comments}
                        onChange={(e) => setComments(e.target.value)}
                        placeholder="e.g. Extra TAS days for Q2"
                        rows={2}
                      />
                    </div>
                  </>
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
            disabled={!selectedPackageId || starting || loadingData || !!conflictInstance}
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
