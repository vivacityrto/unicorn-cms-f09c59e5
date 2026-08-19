import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AppModal, AppModalContent, AppModalHeader, AppModalTitle, AppModalBody, AppModalFooter } from '@/components/ui/modals';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Send, CheckCircle, XCircle, Loader2, SkipForward, AlertTriangle, ShieldCheck, ShieldAlert, Square, RotateCcw, Clock } from 'lucide-react';
import { differenceInDays } from 'date-fns';
import { toast } from 'sonner';
import { useCscAssignments } from '@/hooks/useCscAssignments';
import { TenantFilterBar, type CscFilterOption } from '@/components/documents/bulk-generate/TenantFilterBar';
import {
  launcherCreateDelivery,
  launcherCancel,
  launcherRetry,
} from '@/components/documents/bulk-generate/useBulkGenerateLauncher';

interface GovernanceDeliveryDialogProps {
  documentId: number;
  documentVersionId: string;
  /** Preferred over versionNumber when present — e.g. "2026.00.00" vs a bare "v3". */
  displayVersion?: string | null;
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

interface JobItemRow {
  id: number;
  tenant_id: number;
  state: 'pending' | 'leased' | 'generated' | 'skipped' | 'failed' | 'cancelled';
  last_error: string | null;
  outcome: Record<string, unknown> | null;
}

function itemStatus(state: JobItemRow['state'], outcome: Record<string, unknown> | null): DeliveryStatus {
  if (state === 'pending') return 'pending';
  if (state === 'leased') return 'delivering';
  if (state === 'cancelled') return 'skipped';
  if (state === 'skipped') return 'skipped';
  if (state === 'failed') return 'failed';
  // 'generated' — the worker records this state even when
  // deliver-governance-document reported skipped:true (already delivered);
  // that distinction lives in outcome.skipped for display only.
  return outcome?.skipped ? 'skipped' : 'success';
}

function stalledReasonMessage(reason: string | undefined): string {
  if (!reason) return 'The delivery worker could not be started.';
  if (reason.startsWith('worker_kickoff_failed_')) {
    return 'The delivery worker rejected the request to start (a server configuration issue).';
  }
  if (reason === 'worker_kickoff_network_error') {
    return 'The delivery worker could not be reached.';
  }
  if (reason === 'jwt_near_expiry') {
    return 'Your session was about to expire mid-delivery, so it was paused.';
  }
  return `The delivery worker reported: ${reason}`;
}

export function GovernanceDeliveryDialog({
  documentId,
  documentVersionId,
  displayVersion,
  versionNumber,
  open,
  onOpenChange,
  onSuccess,
}: GovernanceDeliveryDialogProps) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [acknowledgeIncomplete, setAcknowledgeIncomplete] = useState(false);
  const [search, setSearch] = useState('');
  const [cscFilter, setCscFilter] = useState('all');

  const [jobId, setJobId] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [retrying, setRetrying] = useState(false);

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

  const allTenantIds = useMemo(() => (tenants || []).map((t) => t.id), [tenants]);
  const cscAssignments = useCscAssignments(allTenantIds);

  // Same "who counts as a CSC" definition TargetedMode uses, for the shared filter bar.
  const { data: cscOptions = [] } = useQuery({
    queryKey: ['delivery-dialog-csc-options'],
    enabled: open,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<CscFilterOption[]> => {
      const { data, error } = await supabase
        .from('users')
        .select('user_uuid, first_name, last_name, staff_teams, staff_team, archived, disabled')
        .eq('disabled', false)
        .order('archived', { ascending: true })
        .order('first_name', { ascending: true });
      if (error) throw error;
      return ((data ?? []) as any[])
        .filter((u) => {
          const inTeams = Array.isArray(u.staff_teams) && u.staff_teams.includes('client_success');
          const inTeam = u.staff_team === 'client_success';
          return inTeams || inTeam;
        })
        .map((u) => ({
          user_uuid: u.user_uuid,
          first_name: u.first_name,
          last_name: u.last_name,
          archived: !!u.archived,
        }));
    },
  });

  const filteredTenants = useMemo(() => {
    const q = search.trim().toLowerCase();
    const cscMap = cscAssignments.data ?? {};
    return (tenants ?? []).filter((t) => {
      if (q && !t.name.toLowerCase().includes(q)) return false;
      if (cscFilter === 'all') return true;
      const cscId = cscMap[t.id]?.csc_user_id ?? null;
      if (cscFilter === 'unassigned') return !cscId;
      return cscId === cscFilter;
    });
  }, [tenants, search, cscFilter, cscAssignments.data]);

  // Fetch merge field data for all eligible tenants
  const eligibleTenantIds = useMemo(
    () => (tenants || []).filter((t) => t.hasGovernanceFolder && !t.alreadyDelivered).map((t) => t.id),
    [tenants]
  );

  // Fetch latest snapshot per tenant for staleness indicators
  const { data: snapshotData } = useQuery({
    queryKey: ['delivery-tenant-snapshots', eligibleTenantIds],
    enabled: open && eligibleTenantIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from('tga_rto_snapshots')
        .select('id, tenant_id, created_at')
        .in('tenant_id', eligibleTenantIds)
        .order('created_at', { ascending: false });

      const map = new Map<number, { id: string; created_at: string }>();
      for (const s of data || []) {
        if (!map.has(s.tenant_id)) {
          map.set(s.tenant_id, { id: s.id, created_at: s.created_at });
        }
      }
      return map;
    },
  });

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

  const eligibleTenants = tenants?.filter((t) => t.hasGovernanceFolder && !t.alreadyDelivered) || [];

  // Auto-select every eligible tenant currently passing the filter — the
  // filter narrows which tenants are visible/selectable, it doesn't persist
  // a separate selection set.
  const eligibleFilteredIds = useMemo(
    () => filteredTenants.filter((t) => t.hasGovernanceFolder && !t.alreadyDelivered).map((t) => t.id),
    [filteredTenants],
  );

  const toggleTenant = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    const allSelected = eligibleFilteredIds.length > 0 && eligibleFilteredIds.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of eligibleFilteredIds) {
        if (allSelected) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  };

  // Check if any selected tenant is incomplete
  const hasIncompleteSelected = useMemo(() => {
    return Array.from(selected).some((id) => tenantTailoring[id]?.riskLevel === 'incomplete');
  }, [selected, tenantTailoring]);

  // Summary counts
  const summary = useMemo(() => {
    let complete = 0, partial = 0, incomplete = 0;
    let missingSnapshot = 0;
    for (const id of eligibleTenantIds) {
      const t = tenantTailoring[id];
      if (t?.riskLevel === 'complete') complete++;
      else if (t?.riskLevel === 'partial') partial++;
      else incomplete++;
      if (!snapshotData?.has(id)) missingSnapshot++;
    }
    return { complete, partial, incomplete, missingSnapshot };
  }, [eligibleTenantIds, tenantTailoring, snapshotData]);

  const canDeliver = selected.size > 0 && (!hasIncompleteSelected || acknowledgeIncomplete) && !launching;

  const handleDeliver = async () => {
    if (!canDeliver) return;
    setLaunching(true);
    try {
      const selectedIds = Array.from(selected);
      const snapshotIds: Record<string, string> = {};
      for (const id of selectedIds) {
        const snap = snapshotData?.get(id);
        if (snap) snapshotIds[String(id)] = snap.id;
      }
      const allowIncompleteTenantIds = selectedIds.filter(
        (id) => tenantTailoring[id]?.riskLevel === 'incomplete',
      );
      const { job_id } = await launcherCreateDelivery({
        document_id: documentId,
        document_version_id: documentVersionId,
        tenant_ids: selectedIds,
        snapshot_ids: snapshotIds,
        allow_incomplete_tenant_ids: allowIncompleteTenantIds,
      });
      setJobId(job_id);
    } catch (e) {
      toast.error((e as Error).message || 'Could not start delivery');
    } finally {
      setLaunching(false);
    }
  };

  // Poll the job row + its items while a job is active. Same tables/shape
  // Bulk Generate's job progress page reads — this is the same engine.
  const { data: jobRow } = useQuery({
    queryKey: ['delivery-job', jobId],
    enabled: !!jobId,
    refetchInterval: (query) => {
      const status = (query.state.data as { status?: string } | undefined)?.status;
      return status === 'running' ? 2000 : false;
    },
    queryFn: async () => {
      const { data } = await supabase
        .from('bulk_document_jobs')
        .select('status, error_summary, created_at')
        .eq('id', jobId!)
        .maybeSingle();
      return data as { status: string; error_summary: Record<string, unknown> | null; created_at: string } | null;
    },
  });

  // The launcher's kickoff to bulk-generate-documents-worker is fire-and-forget;
  // if that never lands (e.g. the worker rejects it), the job flips to
  // 'stalled' server-side. Surface that plainly instead of leaving the bar
  // frozen at 0% with no explanation.
  const isStalled = jobRow?.status === 'stalled';
  const stalledReason = (jobRow?.error_summary as { stalled_reason?: string } | null)?.stalled_reason;

  const { data: jobItems } = useQuery({
    queryKey: ['delivery-job-items', jobId],
    enabled: !!jobId,
    refetchInterval: jobRow?.status === 'running' ? 2000 : false,
    queryFn: async () => {
      // See BulkDocumentJobProgress.tsx: PostgREST caps rows per request, so
      // page through in case a delivery ever spans more tenants than that cap.
      const PAGE_SIZE = 1000;
      const all: JobItemRow[] = [];
      let from = 0;
      while (true) {
        const { data } = await supabase
          .from('bulk_document_job_items')
          .select('id, tenant_id, state, last_error, outcome')
          .eq('job_id', jobId!)
          .order('id', { ascending: true })
          .range(from, from + PAGE_SIZE - 1);
        const page = (data || []) as JobItemRow[];
        all.push(...page);
        if (page.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }
      return all;
    },
  });

  const itemByTenant = useMemo(() => {
    const map = new Map<number, JobItemRow>();
    for (const item of jobItems || []) map.set(item.tenant_id, item);
    return map;
  }, [jobItems]);

  // Soft client-side watchdog: even a job that's genuinely still 'running'
  // server-side can look identical to a silently-stuck one from the UI's
  // point of view. Flag it after a generous delay so the user isn't left
  // guessing while waiting for the (usually fast) server-side stall detection.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (jobRow?.status !== 'running') return;
    const t = setInterval(() => setNow(Date.now()), 2000);
    return () => clearInterval(t);
  }, [jobRow?.status]);
  const elapsedMs = jobRow?.created_at ? now - new Date(jobRow.created_at).getTime() : 0;
  const looksStuck = jobRow?.status === 'running' && (jobItems || []).every((i) => i.state === 'pending') && elapsedMs > 20_000;

  const completedCount = (jobItems || []).filter((i) => i.state !== 'pending' && i.state !== 'leased').length;
  const totalCount = (jobItems || []).length;
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
  const hasFailures = (jobItems || []).some((i) => i.state === 'failed');
  const isFinished = !!jobId && jobRow?.status !== undefined && jobRow.status !== 'running';
  const canRetry = hasFailures || isStalled;

  const handleStop = async () => {
    if (!jobId) return;
    setCancelling(true);
    try {
      await launcherCancel(jobId, 'Stopped by staff');
    } catch (e) {
      toast.error((e as Error).message || 'Could not stop delivery');
    } finally {
      setCancelling(false);
    }
  };

  const handleRetryFailed = async () => {
    if (!jobId) return;
    setRetrying(true);
    try {
      await launcherRetry(jobId);
    } catch (e) {
      toast.error((e as Error).message || 'Could not retry failed deliveries');
    } finally {
      setRetrying(false);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    if (jobId) onSuccess();
    setSelected(new Set());
    setAcknowledgeIncomplete(false);
    setJobId(null);
  };

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

  const snapshotStalenessIndicator = (tenantId: number) => {
    const snap = snapshotData?.get(tenantId);
    if (!snap) {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0" />
            </TooltipTrigger>
            <TooltipContent><p>No TGA snapshot available</p></TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }
    const days = differenceInDays(new Date(), new Date(snap.created_at));
    if (days >= 90) {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Clock className="h-4 w-4 text-amber-500 flex-shrink-0" />
            </TooltipTrigger>
            <TooltipContent><p>Snapshot is {days} days old</p></TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }
    return null;
  };

  const versionLabel = displayVersion || `v${versionNumber}`;

  return (
    <AppModal open={open} onOpenChange={jobId && !isFinished ? undefined : (o) => (o ? onOpenChange(o) : handleClose())}>
      <AppModalContent size="lg">
        <AppModalHeader>
          <AppModalTitle>Deliver {versionLabel} to Clients</AppModalTitle>
        </AppModalHeader>
        <AppModalBody>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading tenants…</p>
          ) : jobId ? (
            <div className="space-y-4">
              {isStalled && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Delivery didn't start</AlertTitle>
                  <AlertDescription>
                    {stalledReasonMessage(stalledReason)} Nothing was sent to clients yet — click Retry to try again.
                  </AlertDescription>
                </Alert>
              )}
              {!isStalled && looksStuck && (
                <Alert variant="warning">
                  <Clock className="h-4 w-4" />
                  <AlertTitle>Still waiting to start</AlertTitle>
                  <AlertDescription>
                    This delivery has been running for over {Math.round(elapsedMs / 1000)}s with no clients
                    processed yet. It may still catch up — if it doesn't, stop it and try again.
                  </AlertDescription>
                </Alert>
              )}
              <Progress value={progress} showValue label="Delivery progress" />
              <p className="text-xs text-muted-foreground">
                {completedCount} of {totalCount} client{totalCount !== 1 ? 's' : ''} processed
              </p>
              <ScrollArea className="h-[320px]">
                <div className="space-y-2">
                  {tenants
                    ?.filter((t) => itemByTenant.has(t.id))
                    .map((t) => {
                      const item = itemByTenant.get(t.id)!;
                      const status = itemStatus(item.state, item.outcome);
                      return (
                        <div key={t.id} className="flex items-center justify-between px-2 py-1.5 rounded border">
                          <span className="text-sm">{t.name}</span>
                          <div className="flex items-center gap-2">
                            {statusIcon(status)}
                            {item.last_error && (
                              <span className="text-xs text-destructive max-w-[200px] truncate">
                                {item.last_error}
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
              {summary.missingSnapshot > 0 && (
                <div className="flex items-center gap-2 text-xs p-2 rounded bg-muted/50 border text-destructive">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <span className="font-medium">{summary.missingSnapshot} tenant{summary.missingSnapshot !== 1 ? 's' : ''} missing TGA snapshot</span>
                </div>
              )}

              <TenantFilterBar
                search={search}
                onSearchChange={setSearch}
                cscFilter={cscFilter}
                onCscFilterChange={setCscFilter}
                cscOptions={cscOptions}
              />

              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">
                  {selected.size} of {eligibleTenants.length} selected
                </span>
                <Button variant="ghost" size="sm" onClick={toggleAll}>
                  {eligibleFilteredIds.length > 0 && eligibleFilteredIds.every((id) => selected.has(id)) ? 'Deselect All' : 'Select All'}
                </Button>
              </div>
              <ScrollArea className="h-[280px]">
                <div className="space-y-1">
                  {filteredTenants.map((t) => {
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
                        {!disabled && snapshotStalenessIndicator(t.id)}
                        {t.alreadyDelivered && (
                          <Badge variant="outline" className="text-xs">Already delivered</Badge>
                        )}
                        {!t.hasGovernanceFolder && (
                          <Badge variant="outline" className="text-xs text-warning">No folder</Badge>
                        )}
                      </label>
                    );
                  })}
                  {filteredTenants.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-6">No clients match this filter.</p>
                  )}
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
              {canRetry && (
                <Button variant="outline" onClick={handleRetryFailed} disabled={retrying}>
                  {retrying ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-2" />}
                  {isStalled && !hasFailures ? 'Retry' : 'Retry Failed'}
                </Button>
              )}
              <Button onClick={handleClose}>Close</Button>
            </div>
          ) : jobId ? (
            <Button variant="destructive" onClick={handleStop} disabled={cancelling}>
              {cancelling ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Square className="h-4 w-4 mr-2" />}
              Stop
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={handleDeliver} disabled={!canDeliver}>
                {launching ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                Deliver to {selected.size} Client{selected.size !== 1 ? 's' : ''}
              </Button>
            </>
          )}
        </AppModalFooter>
      </AppModalContent>
    </AppModal>
  );
}
