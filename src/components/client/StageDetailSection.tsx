import { useState } from 'react';
import { format } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Save, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

interface StageDetailSectionProps {
  stageInstanceId: number;
  tenantId: number;
  packageId: number;
  stageId: number;
  completionDate: string | null;
  comment: string | null;
  stageStatus: number;
  onUpdate: () => void;
}

// Legacy placeholder date to treat as null
const LEGACY_NULL_DATE = '1901-01-01';

export function StageDetailSection({
  stageInstanceId,
  tenantId,
  packageId,
  stageId,
  completionDate,
  comment,
  stageStatus,
  onUpdate
}: StageDetailSectionProps) {
  const { toast } = useToast();
  const { profile } = useAuth();
  
  // Normalize legacy null dates
  const normalizedDate = completionDate === LEGACY_NULL_DATE ? null : completionDate;
  
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(
    normalizedDate ? new Date(normalizedDate) : (stageStatus === 3 ? new Date() : undefined)
  );
  const [commentText, setCommentText] = useState(comment || '');
  const [saving, setSaving] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);

  const hasChanges = 
    (selectedDate ? format(selectedDate, 'yyyy-MM-dd') : null) !== normalizedDate ||
    commentText !== (comment || '');

  const handleSave = async () => {
    setSaving(true);
    try {
      const oldData = { completion_date: normalizedDate, comment };
      const newData = {
        completion_date: selectedDate ? format(selectedDate, 'yyyy-MM-dd') : null,
        comment: commentText || null
      };

      const { error } = await supabase
        .from('stage_instances')
        .update(newData)
        .eq('id', stageInstanceId);

      if (error) throw error;

      // Log to audit
      await supabase.from('client_audit_log').insert({
        tenant_id: tenantId,
        actor_user_id: profile?.user_uuid,
        action: 'stage_details_updated',
        entity_type: 'stage_instances',
        entity_id: stageInstanceId.toString(),
        before_data: oldData,
        after_data: newData,
        details: { package_id: packageId, stage_id: stageId }
      });

      toast({ title: 'Stage details saved' });
      onUpdate();
    } catch (error: any) {
      console.error('Error saving stage details:', error);
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  // Only show completion details when stage is marked Complete (status 3)
  if (stageStatus !== 3) return null;

  return (
    <div className="space-y-4 p-4 bg-muted/30 border-t">
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Completion Date */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Completion Date</label>
          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal",
                  !selectedDate && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {selectedDate ? format(selectedDate, 'PPP') : 'Select date...'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(date) => {
                  setSelectedDate(date);
                  setCalendarOpen(false);
                }}
                initialFocus
                className="p-3 pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* Comment */}
        <div className="space-y-2 sm:col-span-2">
          <label className="text-sm font-medium">Comment</label>
          <Textarea
            placeholder="Add notes about this stage..."
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            rows={3}
          />
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button 
          onClick={handleSave} 
          disabled={!hasChanges || saving}
          size="sm"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Save Details
        </Button>
      </div>
    </div>
  );
}
