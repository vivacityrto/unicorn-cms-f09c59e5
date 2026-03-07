/**
 * TenantStatusDropdown – Clickable status badge that allows changing tenant status.
 * Shows dd_status options with code >= 100.
 * Prompts to close open packages when switching away from 'active'.
 */

import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { CheckCircle2, XCircle, ChevronDown, Loader2, Pencil } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

interface StatusOption {
  code: number;
  value: string;
  description: string;
}

interface TenantStatusDropdownProps {
  tenantId: number;
  currentStatus: string;
  onStatusChange: (newStatus: string) => void;
  onNonActiveChange?: (statusDescription: string) => void;
}

export function TenantStatusDropdown({ tenantId, currentStatus, onStatusChange, onNonActiveChange }: TenantStatusDropdownProps) {
  const { toast } = useToast();
  const { profile } = useAuth();
  const [options, setOptions] = useState<StatusOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const [openPackageCount, setOpenPackageCount] = useState(0);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    supabase
      .from('dd_status')
      .select('code, value, description')
      .gte('code', 100)
      .order('code')
      .then(({ data }) => {
        if (data) setOptions(data as StatusOption[]);
      });
  }, []);

  const handleSelect = async (newValue: string) => {
    if (newValue === currentStatus) return;

    // If switching away from active, check for open packages
    if (currentStatus === 'active' && newValue !== 'active') {
      const { count } = await supabase
        .from('package_instances')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('is_complete', false);

      setPendingStatus(newValue);
      setOpenPackageCount(count || 0);
      setShowConfirm(true);
    } else {
      await applyStatusChange(newValue, false);
    }
  };

  const applyStatusChange = async (newStatus: string, closePackages: boolean) => {
    setSaving(true);
    try {
      // Update tenant status
      const { error } = await supabase
        .from('tenants')
        .update({ status: newStatus })
        .eq('id', tenantId);
      if (error) throw error;

      // Close open packages if requested
      if (closePackages) {
        const { error: pkgError } = await supabase
          .from('package_instances')
          .update({ is_complete: true, is_active: false })
          .eq('tenant_id', tenantId)
          .eq('is_complete', false);
        if (pkgError) throw pkgError;
      }

      // Audit log
      await supabase.from('client_audit_log').insert({
        tenant_id: tenantId,
        actor_user_id: profile?.user_uuid ?? '',
        action: 'tenant_status_changed',
        entity_type: 'tenant',
        entity_id: String(tenantId),
        details: {
          from: currentStatus,
          to: newStatus,
          packages_closed: closePackages,
        },
      });

      onStatusChange(newStatus);
      toast({
        title: 'Status Updated',
        description: `Tenant status changed to ${newStatus}${closePackages ? ' and open packages closed' : ''}.`,
      });

      // Trigger note initiation for non-active statuses
      if (newStatus !== 'active' && onNonActiveChange) {
        const statusDesc = options.find(o => o.value === newStatus)?.description || newStatus;
        onNonActiveChange(statusDesc);
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
      setShowConfirm(false);
      setPendingStatus(null);
    }
  };

  const isActive = currentStatus === 'active';
  const currentLabel = options.find(o => o.value === currentStatus)?.description || currentStatus;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild disabled={saving}>
          <button
            className="inline-flex items-center gap-1 cursor-pointer focus:outline-none"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
          >
            <Badge
              variant={isActive ? 'default' : 'destructive'}
              className={
                isActive
                  ? 'bg-green-500/20 text-green-600 hover:bg-green-500/30 border border-green-600 text-[0.75rem] py-[2px] px-[0.625rem] rounded-[11px]'
                  : 'bg-red-500/20 text-red-600 hover:bg-red-500/30 border border-red-600 text-[0.75rem] py-[2px] px-[0.625rem] rounded-[11px]'
              }
            >
              {saving ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : isActive ? (
                <CheckCircle2 className="mr-1 h-3 w-3" />
              ) : (
                <XCircle className="mr-1 h-3 w-3" />
              )}
              {currentLabel}
              {isHovered && <Pencil className="ml-1 h-3 w-3" />}
            </Badge>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {options.map((opt) => (
            <DropdownMenuItem
              key={opt.code}
              onClick={() => handleSelect(opt.value)}
              className={opt.value === currentStatus ? 'font-semibold bg-accent' : ''}
            >
              {opt.description}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change Tenant Status</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                You are changing this tenant from <strong>Active</strong> to{' '}
                <strong>{options.find(o => o.value === pendingStatus)?.description || pendingStatus}</strong>.
              </p>
              {openPackageCount > 0 ? (
                <p className="text-destructive font-medium">
                  This tenant has {openPackageCount} open package{openPackageCount > 1 ? 's' : ''}. Would you also like to close them?
                </p>
              ) : (
                <p className="text-muted-foreground">No open packages found.</p>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            {openPackageCount > 0 && (
              <Button
                variant="destructive"
                onClick={() => applyStatusChange(pendingStatus!, true)}
                disabled={saving}
              >
                {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                Change Status & Close Packages
              </Button>
            )}
            <AlertDialogAction
              onClick={() => applyStatusChange(pendingStatus!, false)}
              disabled={saving}
            >
              {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              {openPackageCount > 0 ? 'Change Status Only' : 'Confirm'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
