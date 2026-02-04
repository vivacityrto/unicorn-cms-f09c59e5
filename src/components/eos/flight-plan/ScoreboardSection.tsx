import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { BarChart3, Plus, X, Save } from 'lucide-react';
import type { FlightPlan } from '@/types/flightPlan';

interface ScoreboardSectionProps {
  flightPlan: FlightPlan | null;
  canEdit: boolean;
  onSave: (updates: Partial<FlightPlan>) => void;
  isSaving: boolean;
}

export function ScoreboardSection({ flightPlan, canEdit, onSave, isSaving }: ScoreboardSectionProps) {
  const [revenueTarget, setRevenueTarget] = useState<string>(
    flightPlan?.revenue_target?.toString() || ''
  );
  const [profitTarget, setProfitTarget] = useState<string>(
    flightPlan?.profit_target?.toString() || ''
  );
  const [measurables, setMeasurables] = useState<string[]>(
    flightPlan?.measurables || ['']
  );

  useEffect(() => {
    setRevenueTarget(flightPlan?.revenue_target?.toString() || '');
    setProfitTarget(flightPlan?.profit_target?.toString() || '');
    setMeasurables(flightPlan?.measurables?.length ? flightPlan.measurables : ['']);
  }, [flightPlan]);

  const handleSave = () => {
    onSave({
      revenue_target: revenueTarget ? parseFloat(revenueTarget) : null,
      profit_target: profitTarget ? parseFloat(profitTarget) : null,
      measurables: measurables.filter(m => m.trim()),
    });
  };

  const addMeasurable = () => setMeasurables([...measurables, '']);
  const removeMeasurable = (index: number) => {
    setMeasurables(measurables.filter((_, i) => i !== index));
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          <CardTitle>Scoreboard</CardTitle>
        </div>
        {canEdit && (
          <Button onClick={handleSave} disabled={isSaving} size="sm">
            <Save className="h-4 w-4 mr-2" />
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid md:grid-cols-2 gap-4">
          {/* Revenue Target */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Revenue</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
              <Input
                type="text"
                placeholder="180k"
                value={revenueTarget}
                onChange={(e) => setRevenueTarget(e.target.value)}
                disabled={!canEdit}
                className="pl-7"
              />
            </div>
          </div>

          {/* Profit Target */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Profit (%)</label>
            <Input
              type="text"
              placeholder="Break-even or target amount"
              value={profitTarget}
              onChange={(e) => setProfitTarget(e.target.value)}
              disabled={!canEdit}
            />
          </div>
        </div>

        {/* Measurables */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Measurables</label>
          {measurables.map((measurable, index) => (
            <div key={index} className="flex gap-2">
              <span className="text-muted-foreground mt-2">•</span>
              <Input
                placeholder="On-time delivery: 90%"
                value={measurable}
                onChange={(e) => {
                  const updated = [...measurables];
                  updated[index] = e.target.value;
                  setMeasurables(updated);
                }}
                disabled={!canEdit}
              />
              {canEdit && measurables.length > 1 && (
                <Button variant="ghost" size="icon" onClick={() => removeMeasurable(index)}>
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
          {canEdit && (
            <Button variant="outline" size="sm" onClick={addMeasurable}>
              <Plus className="h-4 w-4 mr-2" />
              Add Measurable
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
