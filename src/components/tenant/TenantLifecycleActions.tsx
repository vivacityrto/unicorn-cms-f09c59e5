import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
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
  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const executeAction = async (action: string) => {
    setLoading(true);
    try {
      const response = await supabase.functions.invoke('tenant-lifecycle', {
        body: { tenant_id: tenantId, action },
      });

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
    }
  };

  // Determine available actions based on lifecycle_status
  const canSuspend = lifecycleStatus === 'active';
  const canClose = lifecycleStatus === 'active';
  const canArchive = lifecycleStatus === 'closed' && isSuperAdmin;
  const canReactivate = (lifecycleStatus === 'suspended') || (lifecycleStatus === 'archived' && isSuperAdmin);

  const hasAnyAction = canSuspend || canClose || canArchive || canReactivate;
  if (!hasAnyAction) return null;

  const confirmLabels: Record<string, { title: string; description: string; actionLabel: string }> = {
    suspend: {
      title: 'Suspend Client',
      description: `Are you sure you want to suspend "${tenantName}"? This will disable access but preserve all data. The client can be reactivated later.`,
      actionLabel: 'Suspend',
    },
    archive: {
      title: 'Archive Client',
      description: `Are you sure you want to archive "${tenantName}"? This is a permanent administrative action. Only SuperAdmins can reactivate archived clients.`,
      actionLabel: 'Archive',
    },
    reactivate: {
      title: 'Reactivate Client',
      description: `Are you sure you want to reactivate "${tenantName}"? This will re-enable access and set the client back to active status.`,
      actionLabel: 'Reactivate',
    },
  };

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

      {/* Simple confirm dialog for suspend/archive/reactivate */}
      {confirmAction && confirmLabels[confirmAction] && (
        <AlertDialog open={!!confirmAction} onOpenChange={(open) => { if (!open) setConfirmAction(null); }}>
          <AlertDialogContent className="max-w-md" onClick={(e) => e.stopPropagation()}>
            <AlertDialogHeader>
              <AlertDialogTitle>{confirmLabels[confirmAction].title}</AlertDialogTitle>
              <AlertDialogDescription>{confirmLabels[confirmAction].description}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => executeAction(confirmAction)}
                disabled={loading}
                className={confirmAction === 'reactivate' ? 'bg-green-600 hover:bg-green-700' : 'bg-destructive hover:bg-destructive/90 text-destructive-foreground'}
              >
                {loading ? 'Processing...' : confirmLabels[confirmAction].actionLabel}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Close modal with full details */}
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
