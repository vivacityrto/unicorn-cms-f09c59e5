import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Target, Plus, X, Save } from 'lucide-react';
import type { FlightPlan } from '@/types/flightPlan';

interface QuarterlyGoalSectionProps {
  flightPlan: FlightPlan | null;
  canEdit: boolean;
  onSave: (updates: Partial<FlightPlan>) => void;
  isSaving: boolean;
}

export function QuarterlyGoalSection({ flightPlan, canEdit, onSave, isSaving }: QuarterlyGoalSectionProps) {
  const [objective, setObjective] = useState(flightPlan?.quarterly_objective || '');
  const [successIndicators, setSuccessIndicators] = useState<string[]>(
    flightPlan?.success_indicators || ['']
  );
  const [winCondition, setWinCondition] = useState(flightPlan?.win_condition || '');
  const [stopDoing, setStopDoing] = useState<string[]>(
    flightPlan?.stop_doing || ['']
  );

  useEffect(() => {
    setObjective(flightPlan?.quarterly_objective || '');
    setSuccessIndicators(flightPlan?.success_indicators?.length ? flightPlan.success_indicators : ['']);
    setWinCondition(flightPlan?.win_condition || '');
    setStopDoing(flightPlan?.stop_doing?.length ? flightPlan.stop_doing : ['']);
  }, [flightPlan]);

  const handleSave = () => {
    onSave({
      quarterly_objective: objective,
      success_indicators: successIndicators.filter(s => s.trim()),
      win_condition: winCondition,
      stop_doing: stopDoing.filter(s => s.trim()),
    });
  };

  const addSuccessIndicator = () => setSuccessIndicators([...successIndicators, '']);
  const removeSuccessIndicator = (index: number) => {
    setSuccessIndicators(successIndicators.filter((_, i) => i !== index));
  };

  const addStopDoing = () => setStopDoing([...stopDoing, '']);
  const removeStopDoing = (index: number) => {
    setStopDoing(stopDoing.filter((_, i) => i !== index));
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <Target className="h-5 w-5 text-primary" />
          <CardTitle>Quarterly Goal</CardTitle>
        </div>
        {canEdit && (
          <Button onClick={handleSave} disabled={isSaving} size="sm">
            <Save className="h-4 w-4 mr-2" />
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Objective Statement */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Objective Statement</label>
          <Textarea
            placeholder="Define what winning the quarter looks like..."
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
            disabled={!canEdit}
            rows={3}
          />
        </div>

        {/* Success Indicators */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Success Indicators</label>
          {successIndicators.map((indicator, index) => (
            <div key={index} className="flex gap-2">
              <span className="text-muted-foreground mt-2">•</span>
              <Input
                placeholder="Measurable outcome..."
                value={indicator}
                onChange={(e) => {
                  const updated = [...successIndicators];
                  updated[index] = e.target.value;
                  setSuccessIndicators(updated);
                }}
                disabled={!canEdit}
              />
              {canEdit && successIndicators.length > 1 && (
                <Button variant="ghost" size="icon" onClick={() => removeSuccessIndicator(index)}>
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
          {canEdit && (
            <Button variant="outline" size="sm" onClick={addSuccessIndicator}>
              <Plus className="h-4 w-4 mr-2" />
              Add Indicator
            </Button>
          )}
        </div>

        {/* Win Condition */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Win Condition</label>
          <p className="text-xs text-muted-foreground">If we only achieve one thing this quarter...</p>
          <Input
            placeholder="Single clear sentence defining success..."
            value={winCondition}
            onChange={(e) => setWinCondition(e.target.value)}
            disabled={!canEdit}
          />
        </div>

        {/* Stop Doing */}
        <div className="space-y-2">
          <label className="text-sm font-medium">What We Stop Doing</label>
          {stopDoing.map((item, index) => (
            <div key={index} className="flex gap-2">
              <span className="text-muted-foreground mt-2">•</span>
              <Input
                placeholder="Activity to stop..."
                value={item}
                onChange={(e) => {
                  const updated = [...stopDoing];
                  updated[index] = e.target.value;
                  setStopDoing(updated);
                }}
                disabled={!canEdit}
              />
              {canEdit && stopDoing.length > 1 && (
                <Button variant="ghost" size="icon" onClick={() => removeStopDoing(index)}>
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
          {canEdit && (
            <Button variant="outline" size="sm" onClick={addStopDoing}>
              <Plus className="h-4 w-4 mr-2" />
              Add Item
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
