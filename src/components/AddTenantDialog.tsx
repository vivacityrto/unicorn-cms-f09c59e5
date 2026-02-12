import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Building2, Loader2 } from 'lucide-react';

interface AddTenantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  preSelectedPackageId?: number;
}

interface PackageOption {
  id: number;
  name: string;
  package_type: string;
}

export function AddTenantDialog({ open, onOpenChange, onSuccess, preSelectedPackageId }: AddTenantDialogProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  
  // Form fields
  const [tenantName, setTenantName] = useState('');
  const [rtoCode, setRtoCode] = useState('');
  const [selectedPackageId, setSelectedPackageId] = useState<string>('');
  const [autoAssignConsultant, setAutoAssignConsultant] = useState(true);

  // Package options
  const [packages, setPackages] = useState<PackageOption[]>([]);
  const [loadingPackages, setLoadingPackages] = useState(false);

  const generateSlug = (name: string): string => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  };

  // Fetch available packages
  useEffect(() => {
    if (!open) return;
    const fetchPackages = async () => {
      setLoadingPackages(true);
      const { data, error } = await supabase
        .from('packages')
        .select('id, name, package_type')
        .order('name');
      if (!error && data) {
        setPackages(data);
      }
      setLoadingPackages(false);
    };
    fetchPackages();
  }, [open]);

  // Set pre-selected package when available
  useEffect(() => {
    if (preSelectedPackageId) {
      setSelectedPackageId(String(preSelectedPackageId));
    }
  }, [preSelectedPackageId]);

  const handleSaveTenant = async () => {
    if (!tenantName) {
      toast({
        title: 'Validation Error',
        description: 'Tenant name is required',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    const tenantSlug = generateSlug(tenantName);

    try {
      // Check if slug already exists
      const { data: existingTenant } = await supabase
        .from('tenants')
        .select('id')
        .eq('slug', tenantSlug)
        .maybeSingle();

      if (existingTenant) {
        toast({
          title: 'Slug Already Exists',
          description: `A tenant with a similar name already exists. Please use a different name.`,
          variant: 'destructive',
        });
        setSaving(false);
        return;
      }

      const { error } = await supabase.from('tenants').insert([{
        name: tenantName,
        slug: tenantSlug,
        status: 'active',
        risk_level: 'low',
        rto_id: rtoCode || null,
        metadata: {
          source: 'manual'
        }
      }] as any);

      if (error) throw error;

      // Get newly created tenant ID
      const { data: newTenant } = await supabase
        .from('tenants')
        .select('id')
        .eq('slug', tenantSlug)
        .single();

      const newTenantId = newTenant?.id;

      // Create package instance if a package was selected
      if (selectedPackageId && newTenantId) {
        try {
          const { error: piError } = await supabase.from('package_instances').insert({
            tenant_id: newTenantId,
            package_id: parseInt(selectedPackageId),
            is_complete: false,
            start_date: new Date().toISOString().split('T')[0],
            clo_id: 0, // Will be updated when consultant is assigned
          });
          if (piError) {
            console.warn('[AddTenant] Package instance creation failed:', piError.message);
            toast({
              title: 'Warning',
              description: 'Client created but package assignment failed. You can assign it manually.',
            });
          }
        } catch (piErr) {
          console.warn('[AddTenant] Package instance error:', piErr);
        }
      }

      toast({
        title: 'Success',
        description: 'Client created successfully',
      });

      // Auto-assign consultant (fire and forget)
      if (autoAssignConsultant && newTenantId) {
        try {
          supabase.rpc('rpc_auto_assign_consultant', { p_tenant_id: newTenantId })
            .then(({ data: assignData, error: assignError }) => {
              if (assignError) {
                console.warn('[AddTenant] Auto-assign consultant failed:', assignError.message);
              } else {
                console.log('[AddTenant] Consultant auto-assigned:', assignData);
              }
            });
        } catch (assignErr) {
          console.warn('[AddTenant] Auto-assign error:', assignErr);
        }
      }

      // Auto-provision SharePoint folder (fire and forget)
      if (newTenantId) {
        try {
          supabase.functions.invoke('provision-tenant-sharepoint-folder', {
            body: { tenant_id: newTenantId }
          }).then(({ data, error: provError }) => {
            if (provError || !data?.success) {
              console.warn('[AddTenant] SharePoint provisioning failed:', provError?.message || data?.error);
            } else {
              console.log('[AddTenant] SharePoint folder provisioned:', data.folder_name);
            }
          });
        } catch (provErr) {
          console.warn('[AddTenant] SharePoint provisioning error:', provErr);
        }
      }

      resetForm();
      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      let errorMessage = error.message || 'Failed to create client';
      if (error.message?.includes('tenants_slug_key')) {
        errorMessage = `A client with a similar name already exists. Please use a different name.`;
      }
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setTenantName('');
    setRtoCode('');
    setSelectedPackageId(preSelectedPackageId ? String(preSelectedPackageId) : '');
    setAutoAssignConsultant(true);
  };

  useEffect(() => {
    if (!open) {
      resetForm();
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-hidden flex flex-col border-[3px] border-[#dfdfdf]" style={{ width: '500px', maxWidth: '90vw' }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Add New Client
          </DialogTitle>
          <DialogDescription>
            Enter client details to create a new tenant
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-4 px-1">
          <div className="space-y-4 px-1">
            <div className="space-y-2">
              <Label htmlFor="name">Client Name *</Label>
              <Input
                id="name"
                value={tenantName}
                onChange={(e) => setTenantName(e.target.value)}
                placeholder="Organisation name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="rto">RTO Code</Label>
              <Input
                id="rto"
                value={rtoCode}
                onChange={(e) => setRtoCode(e.target.value)}
                placeholder="e.g. 91262"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="package">Package *</Label>
              <Select
                value={selectedPackageId}
                onValueChange={setSelectedPackageId}
                disabled={!!preSelectedPackageId}
              >
                <SelectTrigger id="package">
                  <SelectValue placeholder={loadingPackages ? "Loading packages..." : "Select a package"} />
                </SelectTrigger>
                <SelectContent>
                  {packages.map((pkg) => (
                    <SelectItem key={pkg.id} value={String(pkg.id)}>
                      {pkg.name} <span className="text-muted-foreground ml-1">({pkg.package_type})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="auto-assign">Auto-assign Consultant</Label>
                <p className="text-xs text-muted-foreground">
                  Automatically assign a consultant based on capacity
                </p>
              </div>
              <Switch
                id="auto-assign"
                checked={autoAssignConsultant}
                onCheckedChange={setAutoAssignConsultant}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
            className="hover:bg-[#40c6e524] hover:text-black"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSaveTenant}
            disabled={saving || !tenantName || !selectedPackageId}
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              'Create Client'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
