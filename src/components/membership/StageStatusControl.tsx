import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import type { StageStatus, ClientPackageStageState } from '@/types/membership';
import { Circle, CircleDot, CircleCheck, CirclePause, CircleX, SkipForward } from 'lucide-react';

interface StageStatusControlProps {
  stageState: ClientPackageStageState;
  onStatusChange?: () => void;
  compact?: boolean;
}

const STATUS_OPTIONS: { value: StageStatus; label: string; icon: React.ReactNode; color: string }[] = [
  { value: 'not_started', label: 'Not Started', icon: <Circle className="h-3 w-3" />, color: 'bg-muted text-muted-foreground' },
  { value: 'in_progress', label: 'In Progress', icon: <CircleDot className="h-3 w-3" />, color: 'bg-blue-100 text-blue-700' },
  { value: 'blocked', label: 'Blocked', icon: <CirclePause className="h-3 w-3" />, color: 'bg-red-100 text-red-700' },
  { value: 'waiting', label: 'Waiting', icon: <CircleX className="h-3 w-3" />, color: 'bg-amber-100 text-amber-700' },
  { value: 'complete', label: 'Complete', icon: <CircleCheck className="h-3 w-3" />, color: 'bg-green-100 text-green-700' },
  { value: 'skipped', label: 'Skipped', icon: <SkipForward className="h-3 w-3" />, color: 'bg-gray-100 text-gray-600' },
];

export function StageStatusControl({ stageState, onStatusChange, compact = false }: StageStatusControlProps) {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<StageStatus | null>(null);
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const currentOption = STATUS_OPTIONS.find(opt => opt.value === stageState.status) || STATUS_OPTIONS[0];

  const handleStatusSelect = (newStatus: StageStatus) => {
    if (newStatus === stageState.status) return;

    // Blocked and waiting require a reason
    if (newStatus === 'blocked' || newStatus === 'waiting') {
      setPendingStatus(newStatus);
      setReason('');
      setIsDialogOpen(true);
      return;
    }

    // Skipped only allowed for non-required
    if (newStatus === 'skipped' && stageState.is_required) {
      toast({
        title: 'Cannot skip required stage',
        description: 'This stage is required and cannot be skipped.',
        variant: 'destructive',
      });
      return;
    }

    // Direct transition
    transitionStatus(newStatus);
  };

  const transitionStatus = async (newStatus: StageStatus, statusReason?: string) => {
    setIsSubmitting(true);
    try {
      // Use raw SQL query since table isn't in generated types yet
      const updateData = {
        status: newStatus,
        updated_at: new Date().toISOString(),
        updated_by: profile?.user_uuid,
        blocked_at: newStatus === 'blocked' ? new Date().toISOString() : null,
        blocked_reason: newStatus === 'blocked' ? statusReason : null,
        waiting_at: newStatus === 'waiting' ? new Date().toISOString() : null,
        waiting_reason: newStatus === 'waiting' ? statusReason : null,
        completed_at: newStatus === 'complete' || newStatus === 'skipped' ? new Date().toISOString() : null,
        started_at: newStatus === 'in_progress' && !stageState.started_at ? new Date().toISOString() : stageState.started_at,
      };
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('client_package_stage_state')
        .update(updateData)
        .eq('id', stageState.id);

      // Also insert audit log
      await (supabase as any)
        .from('stage_state_audit_log')
        .insert({
          client_package_stage_state_id: stageState.id,
          previous_status: stageState.status,
          new_status: newStatus,
          reason: statusReason || null,
          changed_by: profile?.user_uuid,
        });

      if (error) throw error;

      toast({
        title: 'Stage updated',
        description: `Stage marked as ${STATUS_OPTIONS.find(o => o.value === newStatus)?.label || newStatus}.`,
      });

      setIsDialogOpen(false);
      setPendingStatus(null);
      setReason('');
      onStatusChange?.();
    } catch (error: any) {
      toast({
        title: 'Error updating stage',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReasonSubmit = () => {
    if (!pendingStatus || !reason.trim()) return;
    transitionStatus(pendingStatus, reason);
  };

  if (compact) {
    return (
      <Badge variant="outline" className={`${currentOption.color} gap-1`}>
        {currentOption.icon}
        {currentOption.label}
      </Badge>
    );
  }

  return (
    <>
      <Select value={stageState.status} onValueChange={(val) => handleStatusSelect(val as StageStatus)}>
        <SelectTrigger className="w-[160px] h-8 text-xs">
          <SelectValue>
            <span className="flex items-center gap-1.5">
              {currentOption.icon}
              {currentOption.label}
            </span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {STATUS_OPTIONS.map((option) => {
            // Hide skipped for required stages
            if (option.value === 'skipped' && stageState.is_required) return null;
            
            return (
              <SelectItem key={option.value} value={option.value}>
                <span className="flex items-center gap-1.5">
                  {option.icon}
                  {option.label}
                </span>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pendingStatus === 'blocked' ? 'Block Stage' : 'Set Waiting'}
            </DialogTitle>
            <DialogDescription>
              {pendingStatus === 'blocked' 
                ? 'Please provide a reason why this stage is blocked.'
                : 'Please provide a reason why this stage is waiting.'
              }
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reason">Reason</Label>
              <Textarea
                id="reason"
                placeholder={pendingStatus === 'blocked' 
                  ? 'e.g., Waiting for client documents...'
                  : 'e.g., Waiting for ASQA response...'
                }
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleReasonSubmit} 
              disabled={!reason.trim() || isSubmitting}
            >
              {isSubmitting ? 'Saving...' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
