import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Package2, ListTodo, Layers } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface CloseClientModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: number;
  tenantName: string;
  onSuccess: () => void;
}

interface TenantCloseStats {
  activePackages: number;
  openTasks: number;
  openStages: number;
}

export function CloseClientModal({ open, onOpenChange, tenantId, tenantName, onSuccess }: CloseClientModalProps) {
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<TenantCloseStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const { toast } = useToast();

  // Fetch stats when modal opens
  const fetchStats = async () => {
    setStatsLoading(true);
    try {
      // Active packages
      const { count: pkgCount } = await supabase
        .from('package_instances')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('is_complete', false);

      // Open stages via package_instances
      const { data: pkgIds } = await supabase
        .from('package_instances')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('is_complete', false);

      let openStageCount = 0;
      let openTaskCount = 0;

      if (pkgIds && pkgIds.length > 0) {
        const ids = pkgIds.map(p => p.id);

        const { count: stageCount } = await supabase
          .from('stage_instances')
          .select('id', { count: 'exact', head: true })
          .in('packageinstance_id', ids)
          .in('status', ['not_started', 'in_progress', '1', '3']);

        openStageCount = stageCount || 0;

        // Open tasks via stage_instances
        const { data: stageIds } = await supabase
          .from('stage_instances')
          .select('id')
          .in('packageinstance_id', ids);

        if (stageIds && stageIds.length > 0) {
          const sIds = stageIds.map(s => s.id);
          const { count: taskCount } = await supabase
            .from('client_task_instances')
            .select('id', { count: 'exact', head: true })
            .in('stageinstance_id', sIds)
            .in('status', [0, 2]);

          openTaskCount = taskCount || 0;
        }
      }

      setStats({
        activePackages: pkgCount || 0,
        openTasks: openTaskCount,
        openStages: openStageCount,
      });
    } catch (err) {
      console.error('Error fetching close stats:', err);
    } finally {
      setStatsLoading(false);
    }
  };

  // Fetch stats when dialog opens
  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      setReason('');
      setConfirmed(false);
      setStats(null);
      fetchStats();
    }
    onOpenChange(isOpen);
  };

  const handleClose = async () => {
    if (!reason.trim() || !confirmed) return;
    setLoading(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.access_token) throw new Error('Not authenticated');

      const response = await supabase.functions.invoke('tenant-lifecycle', {
        body: { tenant_id: tenantId, action: 'close', reason: reason.trim() },
      });

      if (response.error) throw new Error(response.error.message);

      const result = response.data;
      if (!result.ok) {
        throw new Error(result.detail || result.code || 'Close failed');
      }

      toast({
        title: 'Client Closed',
        description: `"${tenantName}" has been closed. ${result.data?.automation?.stages_closed || 0} stages closed, ${result.data?.automation?.tasks_cancelled || 0} tasks cancelled.`,
      });
      onOpenChange(false);
      onSuccess();
    } catch (err: any) {
      toast({
        title: 'Close Failed',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Close Client
          </DialogTitle>
          <DialogDescription>
            You are about to close <span className="font-semibold text-foreground">"{tenantName}"</span>. This will disable all access and close active workflows.
          </DialogDescription>
        </DialogHeader>

        {/* Impact Summary */}
        <div className="space-y-3">
          <p className="text-sm font-medium">Impact Summary</p>
          {statsLoading ? (
            <div className="grid grid-cols-3 gap-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-16" />)}
            </div>
          ) : stats ? (
            <div className="grid grid-cols-3 gap-3">
              <div className="flex flex-col items-center p-3 rounded-lg border bg-muted/30">
                <Package2 className="h-4 w-4 text-muted-foreground mb-1" />
                <span className="text-xl font-bold">{stats.activePackages}</span>
                <span className="text-xs text-muted-foreground">Active Packages</span>
              </div>
              <div className="flex flex-col items-center p-3 rounded-lg border bg-muted/30">
                <Layers className="h-4 w-4 text-muted-foreground mb-1" />
                <span className="text-xl font-bold">{stats.openStages}</span>
                <span className="text-xs text-muted-foreground">Open Stages</span>
              </div>
              <div className="flex flex-col items-center p-3 rounded-lg border bg-muted/30">
                <ListTodo className="h-4 w-4 text-muted-foreground mb-1" />
                <span className="text-xl font-bold">{stats.openTasks}</span>
                <span className="text-xs text-muted-foreground">Open Tasks</span>
              </div>
            </div>
          ) : null}

          <div className="space-y-2 text-sm text-muted-foreground bg-amber-500/5 border border-amber-200 rounded-lg p-3">
            <p className="font-medium text-amber-700">This action will:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Set lifecycle status to <Badge variant="outline" className="text-xs py-0 px-1.5">closed</Badge></li>
              <li>Disable tenant access</li>
              <li>Close all open stage instances</li>
              <li>Cancel all open tasks</li>
              <li>Block new consult logs and documents</li>
            </ul>
          </div>

          {/* Reason */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Reason for closure <span className="text-destructive">*</span>
            </label>
            <Textarea
              placeholder="e.g. Contract ended, Client requested closure, Non-renewal..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
          </div>

          {/* Confirmation checkbox */}
          <div className="flex items-start gap-3 p-3 rounded-lg border">
            <Checkbox
              id="confirm-close"
              checked={confirmed}
              onCheckedChange={(checked) => setConfirmed(checked === true)}
              className="mt-0.5"
            />
            <label htmlFor="confirm-close" className="text-sm cursor-pointer">
              I confirm that I have reviewed the impact and want to close this client. I understand this will disable all access and close active workflows.
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleClose}
            disabled={!reason.trim() || !confirmed || loading}
          >
            {loading ? 'Closing...' : 'Close Client'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
