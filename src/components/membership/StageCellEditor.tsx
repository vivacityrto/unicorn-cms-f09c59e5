import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Circle, CircleDot, CircleCheck, CirclePause, CircleX, SkipForward } from 'lucide-react';
import { cn } from '@/lib/utils';

// Stage state values matching the database
type StageState = 'not_started' | 'in_progress' | 'blocked' | 'waiting' | 'complete' | 'skipped';

interface StageCellEditorProps {
  tenantId: number;
  packageId: number;
  stageId: number;
  stageStateId: number | null; // null if no state record exists yet
  currentState: StageState;
  stageName: string;
  isRequired?: boolean;
  onUpdate?: () => void;
}

const STATE_OPTIONS: { value: StageState; label: string; icon: React.ReactNode; dotColor: string }[] = [
  { value: 'not_started', label: 'Not Started', icon: <Circle className="h-3 w-3" />, dotColor: 'bg-muted-foreground/30' },
  { value: 'in_progress', label: 'Active', icon: <CircleDot className="h-3 w-3" />, dotColor: 'bg-blue-500' },
  { value: 'blocked', label: 'Blocked', icon: <CirclePause className="h-3 w-3" />, dotColor: 'bg-red-500' },
  { value: 'waiting', label: 'Waiting', icon: <CircleX className="h-3 w-3" />, dotColor: 'bg-amber-500' },
  { value: 'complete', label: 'Complete', icon: <CircleCheck className="h-3 w-3" />, dotColor: 'bg-green-500' },
  { value: 'skipped', label: 'Skipped', icon: <SkipForward className="h-3 w-3" />, dotColor: 'bg-gray-400' },
];

export function StageCellEditor({
  tenantId,
  packageId,
  stageId,
  stageStateId,
  currentState,
  stageName,
  isRequired = true,
  onUpdate,
}: StageCellEditorProps) {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [selectedState, setSelectedState] = useState<StageState>(currentState);
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const currentOption = STATE_OPTIONS.find(opt => opt.value === currentState) || STATE_OPTIONS[0];
  const needsReason = selectedState === 'blocked' || selectedState === 'waiting';

  const handleSave = async () => {
    // Validate
    if (selectedState === 'skipped' && isRequired) {
      toast({
        title: 'Cannot skip required stage',
        description: 'This stage is required and cannot be skipped.',
        variant: 'destructive',
      });
      return;
    }

    if (needsReason && !reason.trim()) {
      toast({
        title: 'Reason required',
        description: `Please provide a reason for ${selectedState === 'blocked' ? 'blocking' : 'waiting'}.`,
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      if (stageStateId) {
        // Update existing state via RPC
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase as any).rpc('transition_stage_state', {
          p_stage_state_id: stageStateId,
          p_new_status: selectedState,
          p_reason: needsReason ? reason : null,
          p_user_id: profile?.user_uuid,
        });

        if (error) throw error;
        if (data && !data.success) {
          throw new Error(data.error || 'Transition failed');
        }
      } else {
        // Create new state record (upsert)
        const { error } = await supabase
          .from('client_package_stage_state')
          .upsert({
            tenant_id: tenantId,
            package_id: packageId,
            stage_id: stageId,
            status: selectedState,
            is_required: isRequired,
            sort_order: 1,
            started_at: selectedState === 'in_progress' ? new Date().toISOString() : null,
            completed_at: selectedState === 'complete' ? new Date().toISOString() : null,
            blocked_at: selectedState === 'blocked' ? new Date().toISOString() : null,
            blocked_reason: selectedState === 'blocked' ? reason : null,
            waiting_at: selectedState === 'waiting' ? new Date().toISOString() : null,
            waiting_reason: selectedState === 'waiting' ? reason : null,
            updated_by: profile?.user_uuid,
          }, {
            onConflict: 'tenant_id,package_id,stage_id',
          });

        if (error) throw error;

        // Log to audit (cast to any since table is newly created)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from('stage_audit_log').insert({
          tenant_id: tenantId,
          actor_user_id: profile?.user_uuid,
          action: 'stage_state_updated',
          entity_type: 'client_package_stage_state',
          entity_id: null,
          details: {
            package_id: packageId,
            stage_id: stageId,
            old_state: currentState,
            new_state: selectedState,
            reason: needsReason ? reason : null,
          },
        });
      }

      toast({
        title: 'Stage updated',
        description: `${stageName} marked as ${STATE_OPTIONS.find(o => o.value === selectedState)?.label}.`,
      });

      setOpen(false);
      setReason('');
      onUpdate?.();
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

  const handleCancel = () => {
    setSelectedState(currentState);
    setReason('');
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="h-3 w-3 rounded-full cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-primary/50 transition-all"
          style={{ backgroundColor: 'currentColor' }}
        >
          <span className={cn('block h-3 w-3 rounded-full', currentOption.dotColor)} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="start">
        <div className="space-y-3">
          <div className="text-sm font-medium">{stageName}</div>
          
          {/* State options */}
          <div className="grid grid-cols-2 gap-1.5">
            {STATE_OPTIONS.map((option) => {
              // Hide skipped for required stages
              if (option.value === 'skipped' && isRequired) return null;
              
              return (
                <button
                  key={option.value}
                  onClick={() => setSelectedState(option.value)}
                  className={cn(
                    'flex items-center gap-1.5 px-2 py-1.5 text-xs rounded border transition-colors',
                    selectedState === option.value
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background hover:bg-muted border-border'
                  )}
                >
                  {option.icon}
                  {option.label}
                </button>
              );
            })}
          </div>

          {/* Reason field for blocked/waiting */}
          {needsReason && (
            <div className="space-y-1.5">
              <Label htmlFor="reason" className="text-xs">
                Reason {selectedState === 'blocked' ? 'for blocking' : 'for waiting'}
              </Label>
              <Textarea
                id="reason"
                placeholder={selectedState === 'blocked' 
                  ? 'e.g., Waiting for client documents...'
                  : 'e.g., Waiting for ASQA response...'
                }
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                className="text-xs"
              />
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={handleCancel} className="h-7 text-xs">
              Cancel
            </Button>
            <Button 
              size="sm" 
              onClick={handleSave} 
              disabled={isSubmitting || (needsReason && !reason.trim())}
              className="h-7 text-xs"
            >
              {isSubmitting ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Compact status indicator (read-only)
export function StageStatusDot({ state }: { state: StageState }) {
  const option = STATE_OPTIONS.find(opt => opt.value === state) || STATE_OPTIONS[0];
  return (
    <span 
      className={cn('inline-block h-2.5 w-2.5 rounded-full', option.dotColor)} 
      title={option.label}
    />
  );
}
