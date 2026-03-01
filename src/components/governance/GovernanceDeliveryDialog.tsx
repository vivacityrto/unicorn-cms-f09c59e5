import { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AppModal, AppModalContent, AppModalHeader, AppModalTitle, AppModalBody, AppModalFooter } from '@/components/ui/modals';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Send, CheckCircle, XCircle, Loader2, SkipForward, AlertTriangle, ShieldCheck, ShieldAlert, Square, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';

interface GovernanceDeliveryDialogProps {
  documentId: number;
  documentVersionId: string;
  versionNumber: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

interface TenantRow {
  id: number;
  name: string;
  hasGovernanceFolder: boolean;
  alreadyDelivered: boolean;
}

interface TenantTailoring {
  completeness: number;
  missingFields: string[];
  riskLevel: 'complete' | 'partial' | 'incomplete';
}

type DeliveryStatus = 'pending' | 'delivering' | 'success' | 'skipped' | 'failed';

interface DeliveryState {
  [tenantId: number]: { status: DeliveryStatus; error?: string };
}

const THROTTLE_DELAY_MS = 1500;

export function GovernanceDeliveryDialog({
  documentId,
  documentVersionId,
  versionNumber,
  open,
  onOpenChange,
  onSuccess,
}: GovernanceDeliveryDialogProps) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [delivering, setDelivering] = useState(false);
  const [deliveryState, setDeliveryState] = useState<DeliveryState>({});
  const [acknowledgeIncomplete, setAcknowledgeIncomplete] = useState(false);
  const cancelledRef = useRef(false);
  const [cancelled, setCancelled] = useState(false);

  // Fetch required tags for this document
  const { data: requiredTags } = useQuery({
    queryKey: ['delivery-required-tags', documentId],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase
        .from('document_fields')
        .select('field:dd_fields(tag)')
        .eq('document_id', documentId);
      return (data || []).map((r: any) => r.field?.tag).filter(Boolean) as string[];
    },
  });

  // Fetch active tenants with governance folder status
  const { data: tenants, isLoading } = useQuery({
    queryKey: ['delivery-tenants', documentId, documentVersionId],
    enabled: open,
    queryFn: async () => {
      const { data: allTenants } = await supabase
        .from('tenants')
        .select('id, name')
        .eq('status', 'active')
        .order('name');

      if (!allTenants) return [];

      const { data: spSettings } = await supabase
        .from('tenant_sharepoint_settings')
        .select('tenant_id, governance_folder_item_id')
        .not('governance_folder_item_id', 'is', null);

      const folderSet = new Set(spSettings?.map((s) => s.tenant_id) || []);

      const { data: deliveries } = await supabase
        .from('governance_document_deliveries')
        .select('tenant_id')
        .eq('document_version_id', documentVersionId)
        .eq('status', 'success');

      const deliveredSet = new Set(deliveries?.map((d) => d.tenant_id) || []);

      return allTenants.map((t): TenantRow => ({
        id: t.id,
        name: t.name,
        hasGovernanceFolder: folderSet.has(t.id),
        alreadyDelivered: deliveredSet.has(t.id),
      }));
    },
  });

  // Fetch merge field data for all eligible tenants
  const eligibleTenantIds = useMemo(
    () => (tenants || []).filter((t) => t.hasGovernanceFolder && !t.alreadyDelivered).map((t) => t.id),
    [tenants]
  );

  const { data: tenantMergeData } = useQuery({
    queryKey: ['delivery-tenant-merge-data', eligibleTenantIds],
    enabled: open && eligibleTenantIds.length > 0 && (requiredTags || []).length > 0,
    queryFn: async () => {
      if (eligibleTenantIds.length === 0) return {};
      const { data } = await supabase
        .from('v_tenant_merge_fields')
        .select('tenant_id, field_tag, value')
        .in('tenant_id', eligibleTenantIds);

      const byTenant: Record<number, Record<string, string>> = {};
      for (const row of data || []) {
        if (!byTenant[row.tenant_id]) byTenant[row.tenant_id] = {};
        byTenant[row.tenant_id][row.field_tag] = row.value ?? '';
      }
      return byTenant;
    },
  });

  // Calculate per-tenant tailoring
  const tenantTailoring = useMemo(() => {
    const result: Record<number, TenantTailoring> = {};
    const tags = requiredTags || [];
    if (tags.length === 0) {
      for (const id of eligibleTenantIds) {
        result[id] = { completeness: 100, missingFields: [], riskLevel: 'complete' };
      }
      return result;
    }

    for (const tenantId of eligibleTenantIds) {
      const data = tenantMergeData?.[tenantId] || {};
      const missing = tags.filter((tag) => !data[tag] || data[tag].trim() === '');
      const populated = tags.length - missing.length;
      const pct = Math.round((populated / tags.length) * 100);
      let risk: 'complete' | 'partial' | 'incomplete';
      if (pct === 100) risk = 'complete';
      else if (pct >= 75) risk = 'partial';
      else risk = 'incomplete';
      result[tenantId] = { completeness: pct, missingFields: missing, riskLevel: risk };
    }
    return result;
  }, [requiredTags, tenantMergeData, eligibleTenantIds]);

  // Auto-select eligible tenants on load
  useEffect(() => {
    if (tenants && !delivering) {
      const eligible = tenants
        .filter((t) => t.hasGovernanceFolder && !t.alreadyDelivered)
        .map((t) => t.id);
      setSelected(new Set(eligible));
    }
  }, [tenants, delivering]);

  const eligibleTenants = tenants?.filter((t) => t.hasGovernanceFolder && !t.alreadyDelivered) || [];

  const toggleTenant = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === eligibleTenants.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(eligibleTenants.map((t) => t.id)));
    }
  };

  // Check if any selected tenant is incomplete
  const hasIncompleteSelected = useMemo(() => {
    return Array.from(selected).some((id) => tenantTailoring[id]?.riskLevel === 'incomplete');
  }, [selected, tenantTailoring]);

  // Summary counts
  const summary = useMemo(() => {
    let complete = 0, partial = 0, incomplete = 0;
    for (const id of eligibleTenantIds) {
      const t = tenantTailoring[id];
      if (t?.riskLevel === 'complete') complete++;
      else if (t?.riskLevel === 'partial') partial++;
      else incomplete++;
    }
    return { complete, partial, incomplete };
  }, [eligibleTenantIds, tenantTailoring]);

  const canDeliver = selected.size > 0 && (!hasIncompleteSelected || acknowledgeIncomplete);

  /** Core delivery loop — used for initial delivery and retry */
  const runDeliveryLoop = async (tenantIds: number[]) => {
    cancelledRef.current = false;
    setCancelled(false);
    setDelivering(true);

    // Initialise state for these tenants
    setDeliveryState((prev) => {
      const next = { ...prev };
      tenantIds.forEach((id) => (next[id] = { status: 'pending' }));
      return next;
    });

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < tenantIds.length; i++) {
      const tenantId = tenantIds[i];

      // Check cancellation
      if (cancelledRef.current) {
        setCancelled(true);
        break;
      }

      setDeliveryState((prev) => ({
        ...prev,
        [tenantId]: { status: 'delivering' },
      }));

      const isIncomplete = tenantTailoring[tenantId]?.riskLevel === 'incomplete';

      try {
        const { data, error } = await supabase.functions.invoke(
          'deliver-governance-document',
          {
            body: {
              tenant_id: tenantId,
              document_version_id: documentVersionId,
              ...(isIncomplete ? { allow_incomplete: true } : {}),
            },
          },
        );

        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        setDeliveryState((prev) => ({
          ...prev,
          [tenantId]: { status: data?.skipped ? 'skipped' : 'success' },
        }));
        successCount++;
      } catch (err: any) {
        setDeliveryState((prev) => ({
          ...prev,
          [tenantId]: { status: 'failed', error: err.message },
        }));
        failCount++;
      }

      // Throttle delay between requests (skip after last)
      if (i < tenantIds.length - 1 && !cancelledRef.current) {
        await new Promise((r) => setTimeout(r, THROTTLE_DELAY_MS));
      }
    }

    const wasCancelled = cancelledRef.current;

    // Insert batch audit record
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const failedIds = tenantIds.filter(
          (id) => deliveryState[id]?.status === 'failed'
        );
        await supabase.from('document_activity_log').insert({
          tenant_id: tenantIds[0],
          document_id: documentId,
          activity_type: 'governance_bulk_delivery_complete',
          actor_user_id: user.id,
          metadata: {
            document_version_id: documentVersionId,
            total: tenantIds.length,
            success: successCount,
            failed: failCount,
            cancelled: wasCancelled,
            failed_tenant_ids: failedIds,
            all_tenant_ids: tenantIds,
          },
        });
      }
    } catch (auditErr) {
      console.error('Failed to write batch audit record:', auditErr);
    }

    if (wasCancelled) {
      toast.info(`Stopped — ${successCount} of ${tenantIds.length} delivered`);
    } else {
      toast.success(`Delivery complete: ${successCount} succeeded, ${failCount} failed`);
    }
    onSuccess();
  };

  const handleDeliver = async () => {
    if (!canDeliver) return;
    const ids = Array.from(selected);
    setDeliveryState({});
    await runDeliveryLoop(ids);
  };

  const handleStop = () => {
    cancelledRef.current = true;
    setCancelled(true);
  };

  const handleRetryFailed = async () => {
    const failedIds = Object.entries(deliveryState)
      .filter(([, s]) => s.status === 'failed')
      .map(([id]) => Number(id));
    if (failedIds.length === 0) return;
    await runDeliveryLoop(failedIds);
  };

  const completedCount = Object.values(deliveryState).filter(
    (s) => s.status === 'success' || s.status === 'skipped' || s.status === 'failed',
  ).length;
  const totalCount = Object.keys(deliveryState).length;
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
  const hasFailures = Object.values(deliveryState).some((s) => s.status === 'failed');
  const isFinished = delivering && (completedCount === totalCount || cancelled) && totalCount > 0;

  const statusIcon = (status: DeliveryStatus) => {
    switch (status) {
      case 'delivering':
        return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
      case 'success':
        return <CheckCircle className="h-4 w-4 text-emerald-600" />;
      case 'skipped':
        return <SkipForward className="h-4 w-4 text-muted-foreground" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-destructive" />;
      default:
        return null;
    }
  };

  const tailoringIndicator = (tenantId: number) => {
    const t = tenantTailoring[tenantId];
    if (!t) return null;

    if (t.riskLevel === 'complete') {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <ShieldCheck className="h-4 w-4 text-emerald-600 flex-shrink-0" />
            </TooltipTrigger>
            <TooltipContent><p>All required fields populated</p></TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    if (t.riskLevel === 'partial') {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />
            </TooltipTrigger>
            <TooltipContent>
              <p className="font-medium">{t.completeness}% complete</p>
              <p className="text-xs">Missing: {t.missingFields.join(', ')}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <ShieldAlert className="h-4 w-4 text-destructive flex-shrink-0" />
          </TooltipTrigger>
          <TooltipContent>
            <p className="font-medium">{t.completeness}% complete</p>
            <p className="text-xs">Missing: {t.missingFields.join(', ')}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  return (
    <AppModal open={open} onOpenChange={delivering ? undefined : onOpenChange}>
      <AppModalContent size="lg">
        <AppModalHeader>
          <AppModalTitle>Deliver v{versionNumber} to Clients</AppModalTitle>
        </AppModalHeader>
        <AppModalBody>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading tenants…</p>
          ) : delivering ? (
            <div className="space-y-4">
              <Progress value={progress} showValue label="Delivery progress" />
              <ScrollArea className="h-[320px]">
                <div className="space-y-2">
                  {tenants
                    ?.filter((t) => t.id in deliveryState)
                    .map((t) => {
                      const ds = deliveryState[t.id];
                      return (
                        <div key={t.id} className="flex items-center justify-between px-2 py-1.5 rounded border">
                          <span className="text-sm">{t.name}</span>
                          <div className="flex items-center gap-2">
                            {ds && statusIcon(ds.status)}
                            {ds?.error && (
                              <span className="text-xs text-destructive max-w-[200px] truncate">
                                {ds.error}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </ScrollArea>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Summary banner */}
              {(requiredTags || []).length > 0 && (
                <div className="flex items-center gap-3 text-xs p-2 rounded bg-muted/50 border">
                  <span className="text-emerald-600 font-medium">{summary.complete} fully tailored</span>
                  {summary.partial > 0 && <span className="text-amber-500 font-medium">{summary.partial} partial</span>}
                  {summary.incomplete > 0 && <span className="text-destructive font-medium">{summary.incomplete} incomplete</span>}
                </div>
              )}

              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">
                  {selected.size} of {eligibleTenants.length} selected
                </span>
                <Button variant="ghost" size="sm" onClick={toggleAll}>
                  {selected.size === eligibleTenants.length ? 'Deselect All' : 'Select All'}
                </Button>
              </div>
              <ScrollArea className="h-[280px]">
                <div className="space-y-1">
                  {tenants?.map((t) => {
                    const disabled = !t.hasGovernanceFolder || t.alreadyDelivered;
                    return (
                      <label
                        key={t.id}
                        className={`flex items-center gap-3 px-2 py-1.5 rounded cursor-pointer hover:bg-muted/50 ${
                          disabled ? 'opacity-50 cursor-not-allowed' : ''
                        }`}
                      >
                        <Checkbox
                          checked={selected.has(t.id)}
                          disabled={disabled}
                          onCheckedChange={() => toggleTenant(t.id)}
                        />
                        <span className="text-sm flex-1">{t.name}</span>
                        {!disabled && tailoringIndicator(t.id)}
                        {t.alreadyDelivered && (
                          <Badge variant="outline" className="text-xs">Already delivered</Badge>
                        )}
                        {!t.hasGovernanceFolder && (
                          <Badge variant="outline" className="text-xs text-warning">No folder</Badge>
                        )}
                      </label>
                    );
                  })}
                </div>
              </ScrollArea>

              {/* Incomplete acknowledgement */}
              {hasIncompleteSelected && (
                <label className="flex items-center gap-2 p-2 rounded border border-destructive/30 bg-destructive/5 cursor-pointer">
                  <Checkbox
                    checked={acknowledgeIncomplete}
                    onCheckedChange={(v) => setAcknowledgeIncomplete(!!v)}
                  />
                  <span className="text-xs text-destructive">
                    I acknowledge that some selected tenants have incomplete tailoring (&lt;75% fields populated)
                  </span>
                </label>
              )}
            </div>
          )}
        </AppModalBody>
        <AppModalFooter>
          {isFinished ? (
            <div className="flex items-center gap-2">
              {hasFailures && (
                <Button variant="outline" onClick={handleRetryFailed}>
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Retry Failed
                </Button>
              )}
              <Button onClick={() => onOpenChange(false)}>Close</Button>
            </div>
          ) : delivering ? (
            <Button variant="destructive" onClick={handleStop}>
              <Square className="h-4 w-4 mr-2" />
              Stop
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={handleDeliver} disabled={!canDeliver}>
                <Send className="h-4 w-4 mr-2" />
                Deliver to {selected.size} Client{selected.size !== 1 ? 's' : ''}
              </Button>
            </>
          )}
        </AppModalFooter>
      </AppModalContent>
    </AppModal>
  );
}
