import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, X, GripVertical, AlertCircle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useEosAgendaTemplates } from '@/hooks/useEosAgendaTemplates';
import { VIVACITY_TENANT_ID } from '@/hooks/useVivacityTeamUsers';
import type { EosAgendaSegment, EosAgendaTemplate, MeetingType } from '@/types/eos';

interface AgendaTemplateEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template?: EosAgendaTemplate | null;
}

const DEFAULT_SEGMENTS: Record<MeetingType, EosAgendaSegment[]> = {
  L10: [
    { name: 'Segue', duration_minutes: 5 },
    { name: 'Scorecard', duration_minutes: 5 },
    { name: 'Rock Review', duration_minutes: 5 },
    { name: 'Headlines', duration_minutes: 5 },
    { name: 'To-Do List', duration_minutes: 5 },
    { name: 'IDS', duration_minutes: 60 },
    { name: 'Conclude', duration_minutes: 5 },
  ],
  Quarterly: [
    { name: 'Segue', duration_minutes: 15 },
    { name: 'Review Previous Flight Plan', duration_minutes: 60 },
    { name: 'Review Mission Control', duration_minutes: 45 },
    { name: 'Establish Next Quarter Rocks', duration_minutes: 90 },
    { name: 'Tackle Key Issues', duration_minutes: 120 },
    { name: 'Next Steps', duration_minutes: 45 },
    { name: 'Conclude', duration_minutes: 30 },
  ],
  Annual: [
    { name: 'Day 1: Segue', duration_minutes: 30 },
    { name: 'Day 1: Review Previous Mission Control', duration_minutes: 60 },
    { name: 'Day 1: Team Health', duration_minutes: 90 },
    { name: 'Day 1: SWOT/Issues List', duration_minutes: 120 },
    { name: 'Day 1: Review Mission Control', duration_minutes: 60 },
    { name: 'Day 2: Establish Next Quarter Rocks', duration_minutes: 120 },
    { name: 'Day 2: Tackle Key Issues', duration_minutes: 120 },
    { name: 'Day 2: Conclude', duration_minutes: 30 },
  ],
  Same_Page: [
    { name: 'Check-In', duration_minutes: 10, description: 'Personal and professional updates between Visionary and Integrator.' },
    { name: 'Review V/TO', duration_minutes: 20, description: 'Confirm alignment on vision, values, targets, and 3-Year Picture.' },
    { name: 'Clarify Roles and Ownership', duration_minutes: 20, description: 'Review Visionary vs Integrator responsibilities. Address any friction or overlap.' },
    { name: 'Discuss Key Issues', duration_minutes: 40, description: 'Open discussion on strategic concerns, people issues, and priorities. Use IDS method.' },
    { name: 'Align on Priorities', duration_minutes: 20, description: 'Agree on top priorities for the upcoming period. Confirm shared understanding.' },
    { name: 'Decisions and Next Steps', duration_minutes: 10, description: 'Capture all decisions made. Assign specific action items with owners and due dates.' },
  ],
  Focus_Day: [
    { name: 'Focus Topic', duration_minutes: 180 },
    { name: 'Action Planning', duration_minutes: 60 },
  ],
  Custom: [
    { name: 'Agenda Item 1', duration_minutes: 30 },
  ],
};

export const AgendaTemplateEditor = ({ open, onOpenChange, template }: AgendaTemplateEditorProps) => {
  const { profile } = useAuth();
  const { createTemplate, updateTemplate } = useEosAgendaTemplates();
  
  const [templateName, setTemplateName] = useState('');
  const [description, setDescription] = useState('');
  const [meetingType, setMeetingType] = useState<MeetingType>('L10');
  const [segments, setSegments] = useState<EosAgendaSegment[]>([]);

  const isEditing = !!template;

  useEffect(() => {
    if (template) {
      setTemplateName(template.template_name);
      setDescription(template.description || '');
      setMeetingType(template.meeting_type);
      setSegments(template.segments || []);
    } else {
      setTemplateName('');
      setDescription('');
      setMeetingType('L10');
      setSegments(DEFAULT_SEGMENTS.L10);
    }
  }, [template, open]);

  const handleMeetingTypeChange = (type: MeetingType) => {
    setMeetingType(type);
    if (!isEditing) {
      setSegments(DEFAULT_SEGMENTS[type] || DEFAULT_SEGMENTS.Custom);
    }
  };

  const addSegment = () => {
    setSegments([...segments, { name: '', duration_minutes: 5 }]);
  };

  const removeSegment = (index: number) => {
    setSegments(segments.filter((_, i) => i !== index));
  };

  const updateSegment = (index: number, field: keyof EosAgendaSegment, value: any) => {
    const updated = [...segments];
    updated[index] = { ...updated[index], [field]: value };
    setSegments(updated);
  };

  const totalDuration = segments.reduce((sum, s) => sum + (s.duration_minutes || 0), 0);
  const hasEmptySegments = segments.some(s => !s.name.trim());
  const hasZeroDuration = totalDuration === 0;

  const handleSave = async () => {
    if (!profile || !templateName.trim()) return;

    const templateData = {
      meeting_type: meetingType,
      template_name: templateName.trim(),
      description: description.trim() || undefined,
      segments: segments,
    };

    if (isEditing && template) {
      await updateTemplate.mutateAsync({
        id: template.id,
        ...templateData,
      });
    } else {
      await createTemplate.mutateAsync({
        ...templateData,
        tenant_id: VIVACITY_TENANT_ID,
        is_default: false,
        created_by: profile.user_uuid,
      });
    }

    onOpenChange(false);
  };

  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${minutes} minutes`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours} hours`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit' : 'Create'} Agenda Template</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Template Name *</Label>
              <Input
                id="name"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="e.g., Extended Level 10"
              />
            </div>
            <div className="space-y-2">
              <Label>Meeting Type *</Label>
              <Select value={meetingType} onValueChange={handleMeetingTypeChange} disabled={isEditing}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="L10">Level 10 Meeting</SelectItem>
                  <SelectItem value="Same_Page">Same Page Meeting</SelectItem>
                  <SelectItem value="Quarterly">Quarterly Meeting</SelectItem>
                  <SelectItem value="Annual">Annual Strategic Planning</SelectItem>
                  <SelectItem value="Focus_Day">Focus Day</SelectItem>
                  <SelectItem value="Custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of when to use this template..."
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Agenda Segments</Label>
              <Button variant="outline" size="sm" onClick={addSegment}>
                <Plus className="h-4 w-4 mr-1" />
                Add Segment
              </Button>
            </div>

            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
              {segments.map((segment, index) => (
                <Card key={index} className="p-3">
                  <div className="flex items-center gap-2">
                    <GripVertical className="h-4 w-4 text-muted-foreground flex-shrink-0 cursor-move" />
                    <Input
                      value={segment.name}
                      onChange={(e) => updateSegment(index, 'name', e.target.value)}
                      placeholder="Segment name"
                      className="flex-1"
                    />
                    <Input
                      type="number"
                      value={segment.duration_minutes}
                      onChange={(e) => updateSegment(index, 'duration_minutes', parseInt(e.target.value) || 0)}
                      className="w-20"
                      min="1"
                    />
                    <span className="text-sm text-muted-foreground flex-shrink-0">min</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeSegment(index)}
                      className="flex-shrink-0"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>

            <div className="flex items-center justify-between pt-2">
              <div className="text-sm font-medium">
                Total duration: <span className={totalDuration > 480 ? 'text-amber-600' : ''}>{formatDuration(totalDuration)}</span>
              </div>
              {totalDuration > 480 && (
                <div className="flex items-center gap-1 text-xs text-amber-600">
                  <AlertCircle className="w-3 h-3" />
                  Exceeds 8 hours
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={
              !templateName.trim() || 
              hasEmptySegments || 
              hasZeroDuration ||
              createTemplate.isPending || 
              updateTemplate.isPending
            }
          >
            {createTemplate.isPending || updateTemplate.isPending ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Template'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
