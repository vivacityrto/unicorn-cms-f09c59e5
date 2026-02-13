import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Building2, Loader2, AlertTriangle, ShieldAlert, ExternalLink } from 'lucide-react';

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

interface DuplicateMatch {
  tenant_id: number;
  name: string;
  legal_name: string | null;
  match_type: 'abn' | 'rto_id' | 'name';
  matched_value: string;
}

interface DuplicateResult {
  hard_block: boolean;
  block_reason?: string;
  matches: DuplicateMatch[];
}

export function AddTenantDialog({ open, onOpenChange, onSuccess, preSelectedPackageId }: AddTenantDialogProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);

  // Form fields
  const [legalName, setLegalName] = useState('');
  const [tradingName, setTradingName] = useState('');
  const [abn, setAbn] = useState('');
  const [rtoCode, setRtoCode] = useState('');
  const [selectedPackageId, setSelectedPackageId] = useState<string>('');
  const [autoAssignConsultant, setAutoAssignConsultant] = useState(true);

  // Duplicate detection state
  const [duplicateResult, setDuplicateResult] = useState<DuplicateResult | null>(null);
  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false);
  const [userAcknowledgedWarning, setUserAcknowledgedWarning] = useState(false);

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

  const checkDuplicates = async (): Promise<DuplicateResult | null> => {
    setChecking(true);
    try {
      const { data, error } = await supabase.rpc('check_tenant_duplicates', {
        p_abn: abn || null,
        p_rto_id: rtoCode || null,
        p_legal_name: legalName || null,
        p_trading_name: tradingName || null,
      });
      if (error) {
        console.error('[AddTenant] Duplicate check failed:', error);
        return null;
      }
      return data as unknown as DuplicateResult;
    } catch (err) {
      console.error('[AddTenant] Duplicate check error:', err);
      return null;
    } finally {
      setChecking(false);
    }
  };

  const handleSaveTenant = async () => {
    if (!legalName) {
      toast({ title: 'Validation Error', description: 'Legal name is required', variant: 'destructive' });
      return;
    }

    // Run duplicate check first
    const result = await checkDuplicates();
    if (result) {
      setDuplicateResult(result);

      if (result.hard_block) {
        // Hard block — show blocking modal, don't proceed
        setShowDuplicateWarning(true);
        return;
      }

      if (result.matches.length > 0 && !userAcknowledgedWarning) {
        // Soft warning — show warning modal, let user decide
        setShowDuplicateWarning(true);
        return;
      }
    }

    await createTenant();
  };

  const createTenant = async () => {
    setSaving(true);
    const displayName = tradingName || legalName;
    const tenantSlug = generateSlug(displayName);

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
          description: 'A tenant with a similar name already exists. Please use a different name.',
          variant: 'destructive',
        });
        setSaving(false);
        return;
      }

      const { error } = await supabase.from('tenants').insert([{
        name: displayName,
        slug: tenantSlug,
        status: 'active',
        risk_level: 'low',
        legal_name: legalName,
        rto_id: rtoCode || null,
        abn: abn || null,
        metadata: { source: 'manual' },
      }] as any);

      if (error) throw error;

      // Get newly created tenant ID
      const { data: newTenant } = await supabase
        .from('tenants')
        .select('id')
        .eq('slug', tenantSlug)
        .single();

      const newTenantId = newTenant?.id;

      // Insert canonical identifiers
      if (newTenantId) {
        const identifiers: Array<{ tenant_id: number; identifier_type: string; identifier_value: string }> = [];
        if (abn && abn.trim()) {
          identifiers.push({ tenant_id: newTenantId, identifier_type: 'abn', identifier_value: abn.trim() });
        }
        if (rtoCode && rtoCode.trim()) {
          identifiers.push({ tenant_id: newTenantId, identifier_type: 'rto_id', identifier_value: rtoCode.trim() });
        }
        if (identifiers.length > 0) {
          const { error: idError } = await supabase
            .from('tenant_identifiers' as any)
            .insert(identifiers as any);
          if (idError) {
            console.warn('[AddTenant] Identifier insert failed:', idError.message);
          }
        }
      }

      // Create package instance if a package was selected
      if (selectedPackageId && newTenantId) {
        try {
          const { error: piError } = await supabase.from('package_instances').insert({
            tenant_id: newTenantId,
            package_id: parseInt(selectedPackageId),
            is_complete: false,
            start_date: new Date().toISOString().split('T')[0],
            clo_id: 0,
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

      toast({ title: 'Success', description: 'Client created successfully' });

      // Auto-assign consultant (fire and forget)
      if (autoAssignConsultant && newTenantId) {
        try {
          supabase.rpc('rpc_auto_assign_consultant', { p_tenant_id: newTenantId })
            .then(({ error: assignError }) => {
              if (assignError) console.warn('[AddTenant] Auto-assign consultant failed:', assignError.message);
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
          }).then(({ error: provError }) => {
            if (provError) console.warn('[AddTenant] SharePoint provisioning failed:', provError.message);
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
        errorMessage = 'A client with a similar name already exists. Please use a different name.';
      }
      toast({ title: 'Error', description: errorMessage, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setLegalName('');
    setTradingName('');
    setAbn('');
    setRtoCode('');
    setSelectedPackageId(preSelectedPackageId ? String(preSelectedPackageId) : '');
    setAutoAssignConsultant(true);
    setDuplicateResult(null);
    setShowDuplicateWarning(false);
    setUserAcknowledgedWarning(false);
  };

  useEffect(() => {
    if (!open) resetForm();
  }, [open]);

  const matchTypeLabel = (type: string) => {
    switch (type) {
      case 'abn': return 'ABN';
      case 'rto_id': return 'RTO ID';
      case 'name': return 'Name';
      default: return type;
    }
  };

  // Duplicate warning/block overlay
  if (showDuplicateWarning && duplicateResult) {
    const isHardBlock = duplicateResult.hard_block;

    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-hidden flex flex-col border-[3px] border-[#dfdfdf]" style={{ width: '540px', maxWidth: '90vw' }}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {isHardBlock ? (
                <ShieldAlert className="h-5 w-5 text-destructive" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-amber-500" />
              )}
              {isHardBlock ? 'Duplicate Detected — Cannot Create' : 'Possible Duplicates Found'}
            </DialogTitle>
            <DialogDescription>
              {isHardBlock
                ? `A client with the same ${duplicateResult.block_reason === 'abn' ? 'ABN' : 'RTO ID'} already exists. You cannot create a duplicate.`
                : 'The following existing clients match the details you entered. Please review before continuing.'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto py-4 space-y-3">
            {duplicateResult.matches.map((match, idx) => (
              <div key={idx} className="rounded-lg border p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">{match.name}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                    {matchTypeLabel(match.match_type)} match
                  </span>
                </div>
                {match.legal_name && match.legal_name !== match.name && (
                  <p className="text-xs text-muted-foreground">Legal: {match.legal_name}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  Matched on: <span className="font-mono">{match.matched_value}</span>
                </p>
              </div>
            ))}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            {isHardBlock ? (
              <>
                <Button variant="outline" onClick={() => { setShowDuplicateWarning(false); }}>
                  Back to Form
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => { setShowDuplicateWarning(false); }}>
                  Back to Form
                </Button>
                <Button
                  onClick={() => {
                    setUserAcknowledgedWarning(true);
                    setShowDuplicateWarning(false);
                    createTenant();
                  }}
                  className="bg-amber-600 hover:bg-amber-700"
                >
                  Continue Create Anyway
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

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
              <Label htmlFor="legal-name">Legal Name *</Label>
              <Input
                id="legal-name"
                value={legalName}
                onChange={(e) => { setLegalName(e.target.value); setUserAcknowledgedWarning(false); }}
                placeholder="Registered legal entity name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="trading-name">Trading Name</Label>
              <Input
                id="trading-name"
                value={tradingName}
                onChange={(e) => setTradingName(e.target.value)}
                placeholder="Trading / display name (optional)"
              />
              <p className="text-xs text-muted-foreground">If blank, legal name is used as display name.</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="abn">ABN</Label>
                <Input
                  id="abn"
                  value={abn}
                  onChange={(e) => { setAbn(e.target.value); setUserAcknowledgedWarning(false); }}
                  placeholder="e.g. 51 824 753 556"
                  maxLength={14}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rto">RTO Code</Label>
                <Input
                  id="rto"
                  value={rtoCode}
                  onChange={(e) => { setRtoCode(e.target.value); setUserAcknowledgedWarning(false); }}
                  placeholder="e.g. 91262"
                />
              </div>
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
            disabled={saving || checking}
            className="hover:bg-[#40c6e524] hover:text-black"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSaveTenant}
            disabled={saving || checking || !legalName || !selectedPackageId}
          >
            {saving || checking ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {checking ? 'Checking...' : 'Creating...'}
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
