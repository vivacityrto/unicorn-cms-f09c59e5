import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Building2, Loader2, AlertTriangle, ShieldAlert, Merge, FolderOpen, Search, Sparkles, CheckCircle2, Circle, X } from 'lucide-react';
import { TenantMergeWizard } from '@/components/tenant/TenantMergeWizard';

interface TgaPreviewData {
  rto_number: string;
  legal_name: string | null;
  trading_name: string | null;
  abn: string | null;
  status: string | null;
  organisation_type: string | null;
}

type TgaDirtyField = 'legalName' | 'tradingName' | 'abn';

interface AddTenantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  preSelectedPackageId?: number;
}

interface PackageOption {
  id: number;
  name: string;
  full_text: string | null;
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
  // Cross-identifier conflict fields
  abn_tenant?: { tenant_id: number; name: string; identifier_type: string; identifier_value: string };
  rto_tenant?: { tenant_id: number; name: string; identifier_type: string; identifier_value: string };
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
  const [createSharePointFolders, setCreateSharePointFolders] = useState(true);
  const [selectedMembershipId, setSelectedMembershipId] = useState<string>('');

  // TGA lookup state (non-Kickstart)
  const [tgaLooking, setTgaLooking] = useState(false);
  const [tgaLookupError, setTgaLookupError] = useState<string | null>(null);
  const [confirmedTgaData, setConfirmedTgaData] = useState<TgaPreviewData | null>(null);
  const [tgaFilledFields, setTgaFilledFields] = useState<Set<TgaDirtyField>>(new Set());

  // Auto-link progress
  type LinkStep = 'idle' | 'creating' | 'linking' | 'importing' | 'done';
  const [linkStep, setLinkStep] = useState<LinkStep>('idle');

  // Duplicate detection state
  const [duplicateResult, setDuplicateResult] = useState<DuplicateResult | null>(null);
  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false);
  const [userAcknowledgedWarning, setUserAcknowledgedWarning] = useState(false);

  // Merge wizard state
  const [showMergeWizard, setShowMergeWizard] = useState(false);

  // Package options
  const [packages, setPackages] = useState<PackageOption[]>([]);
  const [loadingPackages, setLoadingPackages] = useState(false);

  // Derived state
  const selectedPackage = packages.find(p => String(p.id) === selectedPackageId) || null;
  const isKickStart = selectedPackage?.package_type === 'regulatory_submission';
  const membershipOptions = packages.filter(p => p.package_type === 'membership');

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
        .select('id, name, full_text, package_type')
        .eq('status', 'active')
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

  // Update rtoCode; clear any confirmed TGA snapshot when the number changes
  const handleRtoCodeChange = (raw: string) => {
    const cleaned = raw.replace(/\D/g, '').slice(0, 6);
    setRtoCode(cleaned);
    setUserAcknowledgedWarning(false);
    setTgaLookupError(null);
    if (confirmedTgaData && confirmedTgaData.rto_number !== cleaned) {
      setConfirmedTgaData(null);
      setTgaFilledFields(new Set());
    }
  };

  const rtoCodeValid = /^\d{4,6}$/.test(rtoCode.trim());

  const runTgaLookup = async () => {
    if (!rtoCodeValid || tgaLooking) return;
    setTgaLooking(true);
    setTgaLookupError(null);
    try {
      const { data, error } = await supabase.functions.invoke('tga-rto-preview', {
        body: { rtoId: rtoCode.trim() },
      });
      let payload: any = data;
      if (error && !payload) {
        const ctx: any = (error as any).context;
        if (ctx && typeof ctx.json === 'function') {
          try { payload = await ctx.json(); } catch { /* ignore */ }
        }
      }
      if (!payload?.success) {
        setTgaLookupError(payload?.error || `RTO ${rtoCode} not found on training.gov.au`);
        setConfirmedTgaData(null);
        return;
      }
      const d = payload.data || {};
      setConfirmedTgaData({
        rto_number: String(d.code || rtoCode.trim()),
        legal_name: d.legal_name || null,
        trading_name: d.trading_name || null,
        abn: d.abn || null,
        status: d.status || null,
        organisation_type: d.organisation_type || null,
      });
    } catch (err: any) {
      setTgaLookupError(err?.message || 'Unexpected error during TGA lookup.');
    } finally {
      setTgaLooking(false);
    }
  };

  const applyTgaDetails = () => {
    if (!confirmedTgaData) return;
    const filled = new Set<TgaDirtyField>();
    if (confirmedTgaData.legal_name) {
      setLegalName(confirmedTgaData.legal_name);
      filled.add('legalName');
    }
    if (confirmedTgaData.trading_name) {
      setTradingName(confirmedTgaData.trading_name);
      filled.add('tradingName');
    }
    if (confirmedTgaData.abn && !abn.trim()) {
      setAbn(confirmedTgaData.abn);
      filled.add('abn');
    }
    setTgaFilledFields(filled);
    setUserAcknowledgedWarning(false);
  };

  const clearTgaField = (field: TgaDirtyField) => {
    if (!tgaFilledFields.has(field)) return;
    setTgaFilledFields((prev) => {
      const next = new Set(prev);
      next.delete(field);
      return next;
    });
  };

  const tgaStatusIsActive = (() => {
    const s = (confirmedTgaData?.status || '').toLowerCase();
    return !!s && (s.includes('current') || s.includes('active') || s.includes('registered'));
  })();


  const handleSaveTenant = async () => {
    const isKickStart = selectedPackage?.package_type === 'regulatory_submission';
    if (!isKickStart && !legalName) {
      toast({ title: 'Validation Error', description: 'Legal name is required', variant: 'destructive' });
      return;
    }
    if (isKickStart && !tradingName) {
      toast({ title: 'Validation Error', description: 'Trading name is required for KickStart clients', variant: 'destructive' });
      return;
    }

    // Run duplicate check first
    const result = await checkDuplicates();
    if (result) {
      setDuplicateResult(result);

      if (result.hard_block) {
        setShowDuplicateWarning(true);
        return;
      }

      if (result.matches.length > 0 && !userAcknowledgedWarning) {
        setShowDuplicateWarning(true);
        return;
      }
    }

    await createTenant();
  };

  const createTenant = async () => {
    setSaving(true);
    const isKickStartLocal = selectedPackage?.package_type === 'regulatory_submission';
    const shouldAutoLinkTga =
      !isKickStartLocal &&
      !!confirmedTgaData &&
      confirmedTgaData.rto_number === rtoCode.trim();
    setLinkStep(shouldAutoLinkTga ? 'creating' : 'idle');
    const displayName = tradingName || legalName;
    const tenantSlug = generateSlug(displayName);

    try {
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

      // Create package instance(s)
      if (selectedPackageId && newTenantId) {
        try {
          const { error: piError } = await supabase.rpc('start_client_package', {
            p_tenant_id: newTenantId,
            p_package_id: parseInt(selectedPackageId, 10),
            p_assigned_csc_user_id: null,
          });
          if (piError) {
            console.warn('[AddTenant] Package instance creation failed:', piError.message);
            toast({ title: 'Warning', description: 'Client created but package assignment failed.' });
          }
        } catch (piErr) {
          console.warn('[AddTenant] Package instance error:', piErr);
        }
      }

      // Create accompanying membership instance if selected
      if (selectedMembershipId && newTenantId) {
        try {
          const { error: memError } = await supabase.rpc('start_client_package', {
            p_tenant_id: newTenantId,
            p_package_id: parseInt(selectedMembershipId, 10),
            p_assigned_csc_user_id: null,
          });
          if (memError) {
            console.warn('[AddTenant] Membership instance creation failed:', memError.message);
          }
        } catch (memErr) {
          console.warn('[AddTenant] Membership instance error:', memErr);
        }
      }

      // Auto-link to TGA + fire-and-forget sync (non-Kickstart with confirmed lookup)
      let tgaLinkFailed = false;
      if (shouldAutoLinkTga && newTenantId) {
        setLinkStep('linking');
        try {
          const { error: linkErr } = await supabase.rpc('client_tga_link_set', {
            p_tenant_id: newTenantId,
            p_rto_number: rtoCode.trim(),
          });
          if (linkErr) throw linkErr;
          const { error: verifyErr } = await supabase.rpc('client_tga_link_verify', {
            p_tenant_id: newTenantId,
          });
          if (verifyErr) throw verifyErr;
        } catch (linkError: any) {
          tgaLinkFailed = true;
          console.warn('[AddTenant] TGA link failed:', linkError?.message);
        }

        if (!tgaLinkFailed) {
          setLinkStep('importing');
          // Fire-and-forget sync
          supabase.functions.invoke('tga-rto-sync', {
            body: { tenantId: newTenantId, rtoId: rtoCode.trim() },
          }).catch((err) => {
            console.warn('[AddTenant] TGA sync invoke failed:', err?.message);
          });
        }
        setLinkStep('done');
      }

      if (shouldAutoLinkTga && !tgaLinkFailed) {
        toast({ title: 'Success', description: 'Client created — TGA sync in progress' });
      } else if (shouldAutoLinkTga && tgaLinkFailed) {
        toast({
          title: 'Client created',
          description: 'TGA link failed — use the Integrations tab to retry.',
        });
      } else {
        toast({ title: 'Success', description: 'Client created successfully' });
      }

      // Auto-assign consultant (fire and forget)
      if (autoAssignConsultant && newTenantId) {
        supabase.rpc('rpc_auto_assign_consultant', { p_tenant_id: newTenantId })
          .then(({ error: assignError }) => {
            if (assignError) console.warn('[AddTenant] Auto-assign failed:', assignError.message);
          });
      }

      // Provision SharePoint folders (opt-in, fire and forget)
      if (createSharePointFolders && newTenantId) {
        // Client Success Team site folder
        supabase.functions.invoke('provision-tenant-sharepoint-folder', {
          body: { tenant_id: newTenantId }
        }).then(({ error: provError }) => {
          if (provError) console.warn('[AddTenant] SharePoint provisioning failed:', provError.message);
        });
        // Governance site folder
        supabase.functions.invoke('verify-compliance-folder', {
          body: { tenant_id: newTenantId, create_category_subfolders: true }
        }).then(({ error: govError }) => {
          if (govError) console.warn('[AddTenant] Governance folder failed:', govError.message);
        });
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
    setSelectedMembershipId('');
    setAutoAssignConsultant(true);
    setCreateSharePointFolders(true);
    setDuplicateResult(null);
    setShowDuplicateWarning(false);
    setUserAcknowledgedWarning(false);
    setShowMergeWizard(false);
    setConfirmedTgaData(null);
    setTgaFilledFields(new Set());
    setTgaLookupError(null);
    setTgaLooking(false);
    setLinkStep('idle');
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

  // ── Merge wizard (shown when conflict requires merge) ──
  if (showMergeWizard && duplicateResult?.abn_tenant && duplicateResult?.rto_tenant) {
    return (
      <TenantMergeWizard
        open={open}
        onOpenChange={(v) => {
          if (!v) {
            setShowMergeWizard(false);
            setShowDuplicateWarning(false);
          }
          onOpenChange(v);
        }}
        targetTenant={duplicateResult.abn_tenant}
        sourceTenant={duplicateResult.rto_tenant}
        reason={`ABN (${duplicateResult.abn_tenant.identifier_value}) and RTO ID (${duplicateResult.rto_tenant.identifier_value}) resolve to different tenants`}
        onComplete={() => {
          resetForm();
          onSuccess?.();
        }}
      />
    );
  }

  // ── Duplicate warning/block overlay ──
  if (showDuplicateWarning && duplicateResult) {
    const isConflict = duplicateResult.block_reason === 'identifier_conflict_requires_merge';
    const isHardBlock = duplicateResult.hard_block;

    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-hidden flex flex-col border-[3px] border-[#dfdfdf]" style={{ width: '540px', maxWidth: '90vw' }}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {isConflict ? (
                <Merge className="h-5 w-5 text-destructive" />
              ) : isHardBlock ? (
                <ShieldAlert className="h-5 w-5 text-destructive" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-amber-500" />
              )}
              {isConflict
                ? 'Identifier Conflict — Merge Required'
                : isHardBlock
                  ? 'Duplicate Detected — Cannot Create'
                  : 'Possible Duplicates Found'}
            </DialogTitle>
            <DialogDescription>
              {isConflict
                ? 'The ABN and RTO ID you entered belong to different existing tenants. You must merge them before proceeding.'
                : isHardBlock
                  ? `A client with the same ${duplicateResult.block_reason === 'abn' ? 'ABN' : 'RTO ID'} already exists.`
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
            {isConflict ? (
              <>
                <Button variant="outline" onClick={() => setShowDuplicateWarning(false)}>
                  Back to Form
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    setShowDuplicateWarning(false);
                    setShowMergeWizard(true);
                  }}
                >
                  <Merge className="h-4 w-4 mr-2" />
                  Merge Now
                </Button>
              </>
            ) : isHardBlock ? (
              <Button variant="outline" onClick={() => setShowDuplicateWarning(false)}>
                Back to Form
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setShowDuplicateWarning(false)}>
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

  // ── Main create form ──
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
            {/* Package first */}
            <div className="space-y-2">
              <Label htmlFor="package">Package *</Label>
              <Select
                value={selectedPackageId}
                onValueChange={(v) => {
                  setSelectedPackageId(v);
                  setSelectedMembershipId('');
                }}
                disabled={!!preSelectedPackageId}
              >
                <SelectTrigger id="package">
                  <SelectValue placeholder={loadingPackages ? "Loading packages..." : "Select a package"} />
                </SelectTrigger>
                <SelectContent>
                  {packages.map((pkg) => (
                    <SelectItem key={pkg.id} value={String(pkg.id)}>
                      {pkg.name}{pkg.full_text ? ` — ${pkg.full_text}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Membership upsell for KickStart */}
            {isKickStart && (
              <div className="space-y-2">
                <Label htmlFor="membership">Accompanying Membership</Label>
                <Select value={selectedMembershipId || "__none__"} onValueChange={(v) => setSelectedMembershipId(v === "__none__" ? "" : v)}>
                  <SelectTrigger id="membership">
                    <SelectValue placeholder="Select a membership..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No membership</SelectItem>
                    {membershipOptions.map((pkg) => (
                      <SelectItem key={pkg.id} value={String(pkg.id)}>
                        {pkg.name}{pkg.full_text ? ` — ${pkg.full_text}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Optionally add a membership package alongside the KickStart.</p>
              </div>
            )}

            {/* RTO-first hero card (non-Kickstart only) */}
            {!isKickStart && selectedPackageId && (
              <div
                className="rounded-xl p-[2px]"
                style={{ background: 'linear-gradient(135deg, #7130A0, #ED1878)' }}
              >
                <div className="rounded-[10px] bg-background p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="rto" className="text-sm font-semibold">RTO Number</Label>
                    <span
                      className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full text-white"
                      style={{ background: 'linear-gradient(135deg, #7130A0, #ED1878)' }}
                    >
                      <Sparkles className="h-3 w-3" />
                      Auto-fills from TGA
                    </span>
                  </div>

                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <Input
                        id="rto"
                        value={rtoCode}
                        onChange={(e) => handleRtoCodeChange(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            runTgaLookup();
                          }
                        }}
                        placeholder="e.g. 40888"
                        inputMode="numeric"
                        disabled={tgaLooking}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="default"
                      onClick={runTgaLookup}
                      disabled={!rtoCodeValid || tgaLooking}
                    >
                      {tgaLooking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                      <span className="ml-1.5">{tgaLooking ? 'Looking up…' : 'Look up TGA'}</span>
                    </Button>
                  </div>

                  {rtoCode && !rtoCodeValid && (
                    <p className="text-[11px] text-destructive">RTO Number must be 4–6 digits.</p>
                  )}

                  <p className="text-[11px] text-muted-foreground">
                    We'll fetch the legal name, trading name, ABN and registration status from training.gov.au — you can still edit anything before saving.
                  </p>

                  {tgaLookupError && (
                    <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                      {tgaLookupError}
                    </div>
                  )}

                  {confirmedTgaData && (
                    <div className="rounded-md border bg-muted/30 p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          training.gov.au match
                        </span>
                        <span
                          className={
                            'text-[10px] font-medium px-2 py-0.5 rounded-full ' +
                            (tgaStatusIsActive
                              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                              : 'bg-amber-500/15 text-amber-700 dark:text-amber-400')
                          }
                        >
                          {tgaStatusIsActive ? 'Currently registered' : (confirmedTgaData.status || 'Status unknown')}
                        </span>
                      </div>
                      <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1 text-xs">
                        <dt className="text-muted-foreground">Legal name</dt>
                        <dd className="font-medium">{confirmedTgaData.legal_name || '—'}</dd>
                        <dt className="text-muted-foreground">Trading name</dt>
                        <dd className="font-medium">{confirmedTgaData.trading_name || '—'}</dd>
                        <dt className="text-muted-foreground">ABN</dt>
                        <dd className="font-mono">{confirmedTgaData.abn || '—'}</dd>
                        <dt className="text-muted-foreground">Org type</dt>
                        <dd>{confirmedTgaData.organisation_type || '—'}</dd>
                      </dl>
                      <div className="flex flex-wrap gap-2 pt-1">
                        <Button type="button" size="sm" onClick={applyTgaDetails}>
                          Use these details
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setConfirmedTgaData(null);
                            setTgaFilledFields(new Set());
                            setTgaLookupError(null);
                            setTimeout(() => document.getElementById('rto')?.focus(), 0);
                          }}
                        >
                          <X className="h-3.5 w-3.5 mr-1" />
                          Try a different number
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* For KickStart: Trading Name is primary (legal comes from TGA later) */}
            {isKickStart ? (
              <div className="space-y-2">
                <Label htmlFor="trading-name">Trading Name *</Label>
                <Input
                  id="trading-name"
                  value={tradingName}
                  onChange={(e) => setTradingName(e.target.value)}
                  placeholder="Client trading / display name"
                />
                <p className="text-xs text-muted-foreground">Legal name will be sourced from TGA once registered.</p>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="legal-name" className="flex items-center gap-2">
                    Legal Name *
                    {tgaFilledFields.has('legalName') && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                        from TGA
                      </span>
                    )}
                  </Label>
                  <Input
                    id="legal-name"
                    value={legalName}
                    onChange={(e) => { setLegalName(e.target.value); setUserAcknowledgedWarning(false); clearTgaField('legalName'); }}
                    placeholder="Registered legal entity name"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="trading-name" className="flex items-center gap-2">
                      Trading Name
                      {tgaFilledFields.has('tradingName') && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                          from TGA
                        </span>
                      )}
                    </Label>
                    <Input
                      id="trading-name"
                      value={tradingName}
                      onChange={(e) => { setTradingName(e.target.value); clearTgaField('tradingName'); }}
                      placeholder="Trading / display name (optional)"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="abn" className="flex items-center gap-2">
                      ABN
                      {tgaFilledFields.has('abn') && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                          from TGA
                        </span>
                      )}
                    </Label>
                    <Input
                      id="abn"
                      value={abn}
                      onChange={(e) => { setAbn(e.target.value); setUserAcknowledgedWarning(false); clearTgaField('abn'); }}
                      placeholder="e.g. 51 824 753 556"
                      maxLength={14}
                    />
                  </div>
                </div>
              </>
            )}

            {/* Kickstart-only: keep original ABN + RTO row */}
            {isKickStart && (
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
            )}


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

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="create-sp-folders" className="flex items-center gap-1.5">
                  <FolderOpen className="h-3.5 w-3.5" />
                  Create SharePoint client folders
                </Label>
                <p className="text-xs text-muted-foreground">
                  Provision Client Success and Governance folders in SharePoint
                </p>
              </div>
              <Switch
                id="create-sp-folders"
                checked={createSharePointFolders}
                onCheckedChange={setCreateSharePointFolders}
              />
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {saving && linkStep !== 'idle' && linkStep !== 'done' && (
            <div className="flex-1 rounded-md border bg-muted/30 px-3 py-2 space-y-1 text-xs">
              {([
                { key: 'creating', label: 'Creating client', hint: null },
                { key: 'linking', label: 'Linking to TGA', hint: null },
                { key: 'importing', label: 'Importing TGA data', hint: 'Started — continues in background' },
              ] as { key: 'creating' | 'linking' | 'importing'; label: string; hint: string | null }[]).map((step) => {
                const order = ['creating', 'linking', 'importing'] as const;
                const currentIdx = order.indexOf(linkStep as any);
                const stepIdx = order.indexOf(step.key);
                const done = stepIdx < currentIdx;
                const active = stepIdx === currentIdx;
                return (
                  <div key={step.key} className="flex items-center gap-2">
                    {done ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    ) : active ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                    ) : (
                      <Circle className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                    <span className={done ? 'text-muted-foreground line-through' : active ? 'font-medium' : 'text-muted-foreground'}>
                      {step.label}
                    </span>
                    {step.hint && active && (
                      <span className="text-[10px] text-muted-foreground">— {step.hint}</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <div className="flex gap-2 justify-end">
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
              disabled={saving || checking || !selectedPackageId || (isKickStart ? !tradingName : !legalName)}
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
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
