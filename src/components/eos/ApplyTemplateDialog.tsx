import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, FileText, Clock } from 'lucide-react';
import { useEosAgendaTemplates } from '@/hooks/useEosAgendaTemplates';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import type { MeetingType, EosAgendaTemplate } from '@/types/eos';

interface ApplyTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meetingId: string;
  meetingType: MeetingType;
  meetingTitle: string;
  hasExistingSegments: boolean;
}

export const ApplyTemplateDialog = ({
  open,
  onOpenChange,
  meetingId,
  meetingType,
  meetingTitle,
  hasExistingSegments,
}: ApplyTemplateDialogProps) => {
  const { templates, getTemplatesForType, getDefaultTemplate } = useEosAgendaTemplates();
  const queryClient = useQueryClient();
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [isApplying, setIsApplying] = useState(false);

  const availableTemplates = getTemplatesForType(meetingType);

  // Auto-select default template when dialog opens
  useEffect(() => {
    if (open && templates) {
      const defaultTemplate = getDefaultTemplate(meetingType);
      if (defaultTemplate) {
        setSelectedTemplateId(defaultTemplate.id);
      } else if (availableTemplates.length > 0) {
        setSelectedTemplateId(availableTemplates[0].id);
      }
    }
  }, [open, meetingType, templates]);

  const selectedTemplate = templates?.find(t => t.id === selectedTemplateId);

  const calculateTotalDuration = (template: EosAgendaTemplate) => {
    if (!template.segments || !Array.isArray(template.segments)) return 0;
    return template.segments.reduce((sum: number, seg: any) => sum + (seg.duration_minutes || seg.duration || 0), 0);
  };
  
  const getSegmentName = (seg: any) => seg.segment_name || seg.name || 'Unnamed';
  const getSegmentDuration = (seg: any) => seg.duration_minutes || seg.duration || 0;

  const handleApply = async () => {
    if (!selectedTemplateId) {
      toast({ title: 'Please select a template', variant: 'destructive' });
      return;
    }

    setIsApplying(true);
    try {
      // Call the RPC to apply template to existing meeting
      const { error } = await supabase.rpc('apply_template_to_meeting', {
        p_meeting_id: meetingId,
        p_template_id: selectedTemplateId,
      });

      if (error) throw error;

      toast({ title: 'Template applied successfully' });
      queryClient.invalidateQueries({ queryKey: ['eos-meeting-segments', meetingId] });
      queryClient.invalidateQueries({ queryKey: ['eos-meetings'] });
      onOpenChange(false);
    } catch (error: any) {
      toast({ 
        title: 'Error applying template', 
        description: error.message, 
        variant: 'destructive' 
      });
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Apply Agenda Template</DialogTitle>
          <DialogDescription>
            Select an agenda template to apply to "{meetingTitle}"
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
        {hasExistingSegments && (
            <div className="flex items-start gap-3 p-3 bg-warning/10 border border-warning/30 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-warning-foreground">
                  This meeting has existing agenda segments
                </p>
                <p className="text-muted-foreground mt-1">
                  Applying a new template will replace the current agenda. Any notes or progress on existing segments will be lost.
                </p>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>Select Template</Label>
            <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a template..." />
              </SelectTrigger>
              <SelectContent>
                {availableTemplates.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    <div className="flex items-center gap-2">
                      <span>{template.template_name}</span>
                      {template.is_system && (
                        <Badge variant="secondary" className="text-xs">System</Badge>
                      )}
                      {template.is_default && (
                        <Badge variant="outline" className="text-xs">Default</Badge>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedTemplate && (
            <div className="p-4 bg-muted/50 rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-medium">{selectedTemplate.template_name}</span>
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Clock className="w-4 h-4" />
                  {calculateTotalDuration(selectedTemplate)} minutes
                </div>
              </div>
              
              {selectedTemplate.description && (
                <p className="text-sm text-muted-foreground">{selectedTemplate.description}</p>
              )}
              
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Agenda Segments</Label>
                <div className="flex flex-wrap gap-1">
                  {Array.isArray(selectedTemplate.segments) && selectedTemplate.segments.map((seg: any, idx: number) => (
                    <Badge key={idx} variant="outline" className="text-xs">
                      <FileText className="w-3 h-3 mr-1" />
                      {getSegmentName(seg)} ({getSegmentDuration(seg)}m)
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          )}

          {availableTemplates.length === 0 && (
            <div className="text-center py-4 text-muted-foreground">
              <p>No templates available for {meetingType} meetings.</p>
              <p className="text-sm mt-1">Create a template in the Template Library first.</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleApply} 
            disabled={!selectedTemplateId || isApplying || availableTemplates.length === 0}
          >
            {isApplying ? 'Applying...' : 'Apply Template'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
