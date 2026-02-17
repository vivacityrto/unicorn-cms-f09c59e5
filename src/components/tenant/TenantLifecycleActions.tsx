import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CloseClientModal } from './CloseClientModal';
import { MoreHorizontal, Pause, XCircle, Archive, RotateCcw } from 'lucide-react';

interface TenantLifecycleActionsProps {
  tenantId: number;
  tenantName: string;
  lifecycleStatus: string;
  onSuccess: () => void;
}

export function TenantLifecycleActions({ tenantId, tenantName, lifecycleStatus, onSuccess }: TenantLifecycleActionsProps) {
  const { profile } = useAuth();
  const { toast } = useToast();
  const isSuperAdmin = profile?.unicorn_role === 'Super Admin';

  const [confirmAction, setConfirmAction] = useState<string | null>(null);
  const [actionReason, setActionReason] = useState('');
  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const executeAction = async (action: string, reason?: string) => {
    setLoading(true);
    try {
      const body: Record<string, unknown> = { tenant_id: tenantId, action };
      if (reason) body.reason = reason;

      const response = await supabase.functions.invoke('tenant-lifecycle', { body });

      if (response.error) throw new Error(response.error.message);

      const result = response.data;
      if (!result.ok) {
        throw new Error(result.detail || result.code || 'Action failed');
      }

      const labels: Record<string, string> = {
        suspend: 'suspended',
        archive: 'archived',
        reactivate: 'reactivated',
      };

      toast({
        title: 'Success',
        description: `"${tenantName}" has been ${labels[action] || action}.`,
      });
      onSuccess();
    } catch (err: any) {
      toast({
        title: 'Action Failed',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
      setConfirmAction(null);
      setActionReason('');
    }
  };

  const canSuspend = lifecycleStatus === 'active';
  const canClose = lifecycleStatus === 'active';
  const canArchive = lifecycleStatus === 'closed' && isSuperAdmin;
  const canReactivate = (lifecycleStatus === 'suspended') || (lifecycleStatus === 'archived' && isSuperAdmin);

  const hasAnyAction = canSuspend || canClose || canArchive || canReactivate;
  if (!hasAnyAction) return null;

  const needsReason = confirmAction === 'reactivate';

  const confirmConfig: Record<string, { title: string; description: string; actionLabel: string; variant: 'default' | 'destructive' }> = {
    suspend: {
      title: 'Suspend Client',
      description: `Are you sure you want to suspend "${tenantName}"? This will disable access but preserve all data. The client can be reactivated later.`,
      actionLabel: 'Suspend',
      variant: 'destructive',
    },
    archive: {
      title: 'Archive Client',
      description: `Are you sure you want to archive "${tenantName}"? This is a permanent administrative action. Only SuperAdmins can reactivate archived clients.`,
      actionLabel: 'Archive',
      variant: 'destructive',
    },
    reactivate: {
      title: 'Reactivate Client',
      description: `Reactivating "${tenantName}" will re-enable access and set the client back to active status. Please provide a reason for reactivation.`,
      actionLabel: 'Reactivate',
      variant: 'default',
    },
  };

  const currentConfig = confirmAction ? confirmConfig[confirmAction] : null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={(e) => e.stopPropagation()}>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48 bg-popover z-50">
          {canSuspend && (
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setConfirmAction('suspend'); }}>
              <Pause className="mr-2 h-4 w-4 text-amber-500" />
              Suspend Client
            </DropdownMenuItem>
          )}
          {canClose && (
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setCloseModalOpen(true); }}>
              <XCircle className="mr-2 h-4 w-4 text-red-500" />
              Close Client
            </DropdownMenuItem>
          )}
          {(canSuspend || canClose) && (canArchive || canReactivate) && <DropdownMenuSeparator />}
          {canArchive && (
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setConfirmAction('archive'); }}>
              <Archive className="mr-2 h-4 w-4 text-muted-foreground" />
              Archive Client
            </DropdownMenuItem>
          )}
          {canReactivate && (
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setConfirmAction('reactivate'); }}>
              <RotateCcw className="mr-2 h-4 w-4 text-green-500" />
              Reactivate Client
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Confirm dialog with optional reason */}
      {confirmAction && currentConfig && (
        <Dialog open={!!confirmAction} onOpenChange={(open) => { if (!open) { setConfirmAction(null); setActionReason(''); } }}>
          <DialogContent className="max-w-md" onClick={(e) => e.stopPropagation()}>
            <DialogHeader>
              <DialogTitle>{currentConfig.title}</DialogTitle>
              <DialogDescription>{currentConfig.description}</DialogDescription>
            </DialogHeader>

            {needsReason && (
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Reason <span className="text-destructive">*</span>
                </label>
                <Textarea
                  placeholder="e.g. Contract renewed, Error correction, Client requested reactivation..."
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                  rows={3}
                />
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => { setConfirmAction(null); setActionReason(''); }} disabled={loading}>
                Cancel
              </Button>
              <Button
                variant={currentConfig.variant === 'destructive' ? 'destructive' : 'default'}
                onClick={() => executeAction(confirmAction, needsReason ? actionReason.trim() : undefined)}
                disabled={loading || (needsReason && !actionReason.trim())}
                className={currentConfig.variant === 'default' ? 'bg-green-600 hover:bg-green-700 text-white' : ''}
              >
                {loading ? 'Processing...' : currentConfig.actionLabel}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Close modal */}
      <CloseClientModal
        open={closeModalOpen}
        onOpenChange={setCloseModalOpen}
        tenantId={tenantId}
        tenantName={tenantName}
        onSuccess={onSuccess}
      />
    </>
  );
}
