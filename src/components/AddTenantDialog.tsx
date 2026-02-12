import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Building2, Loader2 } from 'lucide-react';

interface AddTenantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  preSelectedPackageId?: number;
}

export function AddTenantDialog({ open, onOpenChange, onSuccess, preSelectedPackageId }: AddTenantDialogProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  
  // Form fields
  const [tenantName, setTenantName] = useState('');
  const [tenantSlug, setTenantSlug] = useState('');
  const [rtoCode, setRtoCode] = useState('');
  const [abn, setAbn] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [autoAssignConsultant, setAutoAssignConsultant] = useState(true);

  const generateSlug = (name: string): string => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  };

  const handleSaveTenant = async () => {
    if (!tenantName || !tenantSlug) {
      toast({
        title: 'Validation Error',
        description: 'Tenant name and slug are required',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
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
          description: `The slug "${tenantSlug}" is already in use. Please choose a different slug.`,
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
        package_id: preSelectedPackageId || null,
        metadata: {
          rto_code: rtoCode,
          abn: abn,
          address: address,
          notes: notes,
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

      toast({
        title: 'Success',
        description: 'Tenant created successfully',
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
      // Provide user-friendly message for common errors
      let errorMessage = error.message || 'Failed to create tenant';
      if (error.message?.includes('tenants_slug_key')) {
        errorMessage = `The slug "${tenantSlug}" is already in use. Please choose a different slug.`;
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
    setTenantSlug('');
    setRtoCode('');
    setAbn('');
    setAddress('');
    setNotes('');
    setAutoAssignConsultant(true);
  };

  useEffect(() => {
    if (!open) {
      resetForm();
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-hidden flex flex-col border-[3px] border-[#dfdfdf]" style={{ width: '650px', maxWidth: '90vw' }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Add New Tenant
          </DialogTitle>
          <DialogDescription>
            Enter tenant details manually
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-4 px-1">
          <div className="space-y-4 px-1">
            <div className="space-y-2">
              <Label htmlFor="name">Tenant Name *</Label>
              <Input
                id="name"
                value={tenantName}
                onChange={(e) => {
                  setTenantName(e.target.value);
                  setTenantSlug(generateSlug(e.target.value));
                }}
                placeholder="Organisation name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="slug">Slug *</Label>
              <Input
                id="slug"
                value={tenantSlug}
                onChange={(e) => setTenantSlug(e.target.value)}
                placeholder="tenant-slug"
              />
              <p className="text-xs text-muted-foreground">
                URL-friendly identifier (lowercase, hyphens only)
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="rto">RTO Code</Label>
                <Input
                  id="rto"
                  value={rtoCode}
                  onChange={(e) => setRtoCode(e.target.value)}
                  placeholder="12345"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="abn">ABN</Label>
                <Input
                  id="abn"
                  value={abn}
                  onChange={(e) => setAbn(e.target.value)}
                  placeholder="12 345 678 901"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Street, City, State, Postcode"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Additional information about this tenant"
                rows={3}
              />
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
            disabled={saving || !tenantName || !tenantSlug}
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              'Create Tenant'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
