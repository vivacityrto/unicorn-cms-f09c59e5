import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Plus, X, GripVertical } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useEosAgendaTemplates } from '@/hooks/useEosAgendaTemplates';
import type { EosAgendaSegment } from '@/types/eos';

interface AgendaTemplateEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DEFAULT_L10_SEGMENTS: EosAgendaSegment[] = [
  { name: 'Segue', duration_minutes: 5 },
  { name: 'Scorecard', duration_minutes: 5 },
  { name: 'Rock Review', duration_minutes: 5 },
  { name: 'Customer/Employee Headlines', duration_minutes: 5 },
  { name: 'To-Do List', duration_minutes: 5 },
  { name: 'IDS (Identify, Discuss, Solve)', duration_minutes: 60 },
  { name: 'Conclude', duration_minutes: 5 },
];

export const AgendaTemplateEditor = ({ open, onOpenChange }: AgendaTemplateEditorProps) => {
  const { profile } = useAuth();
  const { createTemplate } = useEosAgendaTemplates();
  const [templateName, setTemplateName] = useState('Standard Level 10');
  const [segments, setSegments] = useState<EosAgendaSegment[]>(DEFAULT_L10_SEGMENTS);

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

  const handleSave = async () => {
    if (!profile?.tenant_id) return;

    await createTemplate.mutateAsync({
      tenant_id: profile.tenant_id,
      meeting_type: 'L10' as any,
      template_name: templateName,
      segments: segments,
      is_default: false,
      created_by: profile.user_uuid,
    });

    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Agenda Template</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Template Name</Label>
            <Input
              id="name"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="e.g., Standard Level 10"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Segments</Label>
              <Button variant="outline" size="sm" onClick={addSegment}>
                <Plus className="h-4 w-4 mr-1" />
                Add Segment
              </Button>
            </div>

            <div className="space-y-2">
              {segments.map((segment, index) => (
                <Card key={index} className="p-3">
                  <div className="flex items-center gap-2">
                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                    <Input
                      value={segment.name}
                      onChange={(e) => updateSegment(index, 'name', e.target.value)}
                      placeholder="Segment name"
                      className="flex-1"
                    />
                    <Input
                      type="number"
                      value={segment.duration_minutes}
                      onChange={(e) => updateSegment(index, 'duration_minutes', parseInt(e.target.value))}
                      className="w-24"
                      min="1"
                    />
                    <span className="text-sm text-muted-foreground">min</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeSegment(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>

            <div className="text-sm text-muted-foreground">
              Total duration: {segments.reduce((sum, s) => sum + s.duration_minutes, 0)} minutes
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={createTemplate.isPending}>
              {createTemplate.isPending ? 'Saving...' : 'Save Template'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
