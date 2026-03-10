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
  myFit: QCFit | null;
  otherFit: QCFit | null;
  respondentRole: 'manager' | 'reviewee';
  isMeetingMode: boolean;
  disabled?: boolean;
}

export const GWCPanel = ({ qcId, section, myFit, otherFit, respondentRole, isMeetingMode, disabled }: GWCPanelProps) => {
  const { setFit } = useQuarterlyConversations();
  const [getsIt, setGetsIt] = useState(myFit?.gets_it ?? false);
  const [wantsIt, setWantsIt] = useState(myFit?.wants_it ?? false);
  const [capacity, setCapacity] = useState(myFit?.capacity ?? false);
  const [notes, setNotes] = useState(myFit?.notes || '');

  useEffect(() => {
    if (myFit) {
      setGetsIt(myFit.gets_it ?? false);
      setWantsIt(myFit.wants_it ?? false);
      setCapacity(myFit.capacity ?? false);
      setNotes(myFit.notes || '');
    }
  }, [myFit]);

  const handleSave = async () => {
    await setFit.mutateAsync({
      qc_id: qcId,
      gets_it: getsIt,
      wants_it: wantsIt,
      capacity: capacity,
      notes: notes || undefined,
      respondent_role: respondentRole,
    });
  };

  const allTrue = getsIt && wantsIt && capacity;

  const gwcItems = [
    { key: 'gets_it', label: 'Gets It', desc: 'Understands the role, responsibilities, and what success looks like', value: getsIt, setter: setGetsIt },
    { key: 'wants_it', label: 'Wants It', desc: 'Passionate about the work, motivated, and engaged', value: wantsIt, setter: setWantsIt },
    { key: 'capacity', label: 'Capacity', desc: 'Has the time, capability, and resources to succeed', value: capacity, setter: setCapacity },
  ];

  const otherLabel = respondentRole === 'manager' ? "Reviewee" : "Manager";
  const myLabel = respondentRole === 'manager' ? "Manager (You)" : "Reviewee (You)";

  if (isMeetingMode && otherFit) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">GWC Assessment — Side-by-Side</CardTitle>
          <CardDescription>Compare both assessments and discuss differences</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-3 gap-4 text-sm font-medium text-muted-foreground border-b pb-2">
            <div></div>
            <div className="text-center uppercase tracking-wide text-xs">
              {respondentRole === 'reviewee' ? myLabel : otherLabel}
            </div>
            <div className="text-center uppercase tracking-wide text-xs">
              {respondentRole === 'manager' ? myLabel : otherLabel}
            </div>
          </div>

          {gwcItems.map((item) => {
            const otherVal = otherFit[item.key as keyof QCFit] as boolean | null;
            return (
              <div key={item.key} className="grid grid-cols-3 gap-4 items-center p-4 border rounded-lg">
                <div>
                  <p className="font-medium">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </div>
                <div className="flex justify-center">
                  {respondentRole === 'reviewee' ? (
                    <Switch checked={item.value} onCheckedChange={item.setter} disabled={disabled} />
                  ) : (
                    <span className={`text-sm font-medium ${otherVal ? 'text-green-600' : 'text-red-500'}`}>
                      {otherVal ? '✓ Yes' : '✗ No'}
                    </span>
                  )}
                </div>
                <div className="flex justify-center">
                  {respondentRole === 'manager' ? (
                    <Switch checked={item.value} onCheckedChange={item.setter} disabled={disabled} />
                  ) : (
                    <span className={`text-sm font-medium ${otherVal ? 'text-green-600' : 'text-red-500'}`}>
                      {otherVal ? '✓ Yes' : '✗ No'}
                    </span>
                  )}
                </div>
              </div>
            );
          })}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                {respondentRole === 'reviewee' ? 'Your Notes' : "Reviewee's Notes"}
              </Label>
              {respondentRole === 'reviewee' ? (
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} disabled={disabled} rows={3} />
              ) : (
                <p className="text-sm p-3 border rounded-lg bg-muted/30 min-h-[80px] whitespace-pre-wrap">
                  {otherFit.notes || <span className="text-muted-foreground italic">No notes</span>}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                {respondentRole === 'manager' ? 'Your Notes' : "Manager's Notes"}
              </Label>
              {respondentRole === 'manager' ? (
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} disabled={disabled} rows={3} />
              ) : (
                <p className="text-sm p-3 border rounded-lg bg-muted/30 min-h-[80px] whitespace-pre-wrap">
                  {otherFit.notes || <span className="text-muted-foreground italic">No notes</span>}
                </p>
              )}
            </div>
          </div>

          {!disabled && (
            <Button onClick={handleSave} disabled={setFit.isPending}>
              {setFit.isPending ? 'Saving...' : 'Save GWC Assessment'}
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  // Pre-meeting: single form
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          GWC Assessment
          {allTrue && <CheckCircle2 className="h-5 w-5 text-green-600" />}
          {!allTrue && myFit && <XCircle className="h-5 w-5 text-yellow-600" />}
        </CardTitle>
        <CardDescription>
          Assess whether the team member Gets it, Wants it, and has Capacity for their role
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-6">
          {gwcItems.map((item) => (
            <div key={item.key} className="flex items-center justify-between p-4 border rounded-lg">
              <div className="space-y-1">
                <Label className="text-base font-medium">{item.label}</Label>
                <p className="text-sm text-muted-foreground">{item.desc}</p>
              </div>
              <Switch checked={item.value} onCheckedChange={item.setter} disabled={disabled} />
            </div>
          ))}
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
