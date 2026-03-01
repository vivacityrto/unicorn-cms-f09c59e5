import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AppModal, AppModalContent, AppModalHeader, AppModalTitle, AppModalBody, AppModalFooter } from '@/components/ui/modals';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, CheckCircle, XCircle, Loader2, SkipForward } from 'lucide-react';
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

type DeliveryStatus = 'pending' | 'delivering' | 'success' | 'skipped' | 'failed';

interface DeliveryState {
  [tenantId: number]: { status: DeliveryStatus; error?: string };
}

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

  // Fetch active tenants with governance folder status
  const { data: tenants, isLoading } = useQuery({
    queryKey: ['delivery-tenants', documentId, documentVersionId],
    enabled: open,
    queryFn: async () => {
      // Get active tenants
      const { data: allTenants } = await supabase
        .from('tenants')
        .select('id, name')
        .eq('status', 'active')
        .order('name');

      if (!allTenants) return [];

      // Get tenants with governance folders
      const { data: spSettings } = await supabase
        .from('tenant_sharepoint_settings')
        .select('tenant_id, governance_folder_item_id')
        .not('governance_folder_item_id', 'is', null);

      const folderSet = new Set(spSettings?.map((s) => s.tenant_id) || []);

      // Get existing deliveries for this version
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

  const handleDeliver = async () => {
    if (selected.size === 0) return;
    setDelivering(true);

    const ids = Array.from(selected);
    const state: DeliveryState = {};
    ids.forEach((id) => (state[id] = { status: 'pending' }));
    setDeliveryState(state);

    let successCount = 0;
    let failCount = 0;

    for (const tenantId of ids) {
      setDeliveryState((prev) => ({
        ...prev,
        [tenantId]: { status: 'delivering' },
      }));

      try {
        const { data, error } = await supabase.functions.invoke(
          'deliver-governance-document',
          { body: { tenant_id: tenantId, document_version_id: documentVersionId } },
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
    }

    toast.success(`Delivery complete: ${successCount} succeeded, ${failCount} failed`);
    onSuccess();
  };

  const completedCount = Object.values(deliveryState).filter(
    (s) => s.status === 'success' || s.status === 'skipped' || s.status === 'failed',
  ).length;
  const totalCount = Object.keys(deliveryState).length;
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

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
                    ?.filter((t) => selected.has(t.id))
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
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">
                  {selected.size} of {eligibleTenants.length} selected
                </span>
                <Button variant="ghost" size="sm" onClick={toggleAll}>
                  {selected.size === eligibleTenants.length ? 'Deselect All' : 'Select All'}
                </Button>
              </div>
              <ScrollArea className="h-[320px]">
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
            </div>
          )}
        </AppModalBody>
        <AppModalFooter>
          {delivering && completedCount === totalCount && totalCount > 0 ? (
            <Button onClick={() => onOpenChange(false)}>Close</Button>
          ) : !delivering ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={handleDeliver} disabled={selected.size === 0}>
                <Send className="h-4 w-4 mr-2" />
                Deliver to {selected.size} Client{selected.size !== 1 ? 's' : ''}
              </Button>
            </>
          ) : null}
        </AppModalFooter>
      </AppModalContent>
    </AppModal>
  );
}
