import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { useQuarterlyConversations } from '@/hooks/useQuarterlyConversations';
import { CheckCircle2, XCircle } from 'lucide-react';
import type { QCSection, QCFit } from '@/types/qc';

interface GWCPanelProps {
  qcId: string;
  section: QCSection;
  fit: QCFit | null;
  disabled?: boolean;
}

export const GWCPanel = ({ qcId, section, fit, disabled }: GWCPanelProps) => {
  const { setFit } = useQuarterlyConversations();
  const [getsIt, setGetsIt] = useState(fit?.gets_it ?? false);
  const [wantsIt, setWantsIt] = useState(fit?.wants_it ?? false);
  const [capacity, setCapacity] = useState(fit?.capacity ?? false);
  const [notes, setNotes] = useState(fit?.notes || '');

  useEffect(() => {
    if (fit) {
      setGetsIt(fit.gets_it ?? false);
      setWantsIt(fit.wants_it ?? false);
      setCapacity(fit.capacity ?? false);
      setNotes(fit.notes || '');
    }
  }, [fit]);

  const handleSave = async () => {
    await setFit.mutateAsync({
      qc_id: qcId,
      gets_it: getsIt,
      wants_it: wantsIt,
      capacity: capacity,
      notes: notes || undefined,
    });
  };

  const allTrue = getsIt && wantsIt && capacity;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          GWC Assessment
          {allTrue && <CheckCircle2 className="h-5 w-5 text-green-600" />}
          {!allTrue && fit && <XCircle className="h-5 w-5 text-yellow-600" />}
        </CardTitle>
        <CardDescription>
          Assess whether the team member Gets it, Wants it, and has Capacity for their role
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-6">
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="space-y-1">
              <Label htmlFor="gets-it" className="text-base font-medium">
                Gets It
              </Label>
              <p className="text-sm text-muted-foreground">
                Understands the role, responsibilities, and what success looks like
              </p>
            </div>
            <Switch
              id="gets-it"
              checked={getsIt}
              onCheckedChange={setGetsIt}
              disabled={disabled}
            />
          </div>

          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="space-y-1">
              <Label htmlFor="wants-it" className="text-base font-medium">
                Wants It
              </Label>
              <p className="text-sm text-muted-foreground">
                Passionate about the work, motivated, and engaged
              </p>
            </div>
            <Switch
              id="wants-it"
              checked={wantsIt}
              onCheckedChange={setWantsIt}
              disabled={disabled}
            />
          </div>

          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="space-y-1">
              <Label htmlFor="capacity" className="text-base font-medium">
                Capacity
              </Label>
              <p className="text-sm text-muted-foreground">
                Has the time, capability, and resources to succeed
              </p>
            </div>
            <Switch
              id="capacity"
              checked={capacity}
              onCheckedChange={setCapacity}
              disabled={disabled}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="gwc-notes">Discussion Notes</Label>
          <Textarea
            id="gwc-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={disabled}
            placeholder="Add notes about the GWC discussion..."
            rows={4}
          />
        </div>

        {!disabled && (
          <Button onClick={handleSave} disabled={setFit.isPending}>
            {setFit.isPending ? 'Saving...' : 'Save GWC Assessment'}
          </Button>
        )}

        {allTrue && (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
            <p className="text-sm font-medium text-green-900 dark:text-green-100">
              ✓ Right person in the right seat
            </p>
            <p className="text-xs text-green-700 dark:text-green-300 mt-1">
              This team member demonstrates all three GWC criteria
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
