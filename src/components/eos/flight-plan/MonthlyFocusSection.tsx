import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar, Plus, X, Save } from 'lucide-react';
import { MONTH_NAMES } from '@/types/flightPlan';
import type { FlightPlan, MonthFocus } from '@/types/flightPlan';

interface MonthlyFocusSectionProps {
  flightPlan: FlightPlan | null;
  quarter: number;
  canEdit: boolean;
  onSave: (updates: Partial<FlightPlan>) => void;
  isSaving: boolean;
}

const defaultFocus: MonthFocus = { items: [''], indicators: [''], notes: '' };

export function MonthlyFocusSection({ 
  flightPlan, 
  quarter, 
  canEdit, 
  onSave, 
  isSaving 
}: MonthlyFocusSectionProps) {
  const [month1, setMonth1] = useState<MonthFocus>(flightPlan?.month_1_focus || defaultFocus);
  const [month2, setMonth2] = useState<MonthFocus>(flightPlan?.month_2_focus || defaultFocus);
  const [month3, setMonth3] = useState<MonthFocus>(flightPlan?.month_3_focus || defaultFocus);

  useEffect(() => {
    setMonth1(flightPlan?.month_1_focus || defaultFocus);
    setMonth2(flightPlan?.month_2_focus || defaultFocus);
    setMonth3(flightPlan?.month_3_focus || defaultFocus);
  }, [flightPlan]);

  const handleSave = () => {
    onSave({
      month_1_focus: month1,
      month_2_focus: month2,
      month_3_focus: month3,
    });
  };

  const monthNames = MONTH_NAMES[quarter] || ['Month 1', 'Month 2', 'Month 3'];

  const updateMonthItems = (
    monthSetter: React.Dispatch<React.SetStateAction<MonthFocus>>,
    items: string[]
  ) => {
    monthSetter((prev) => ({ ...prev, items }));
  };

  const renderMonthCard = (
    monthName: string,
    monthData: MonthFocus,
    setMonthData: React.Dispatch<React.SetStateAction<MonthFocus>>
  ) => (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-primary" />
          <CardTitle className="text-base">MONTH: {monthName}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {monthData.items.map((item, index) => (
          <div key={index} className="flex items-center gap-2">
            <Checkbox disabled />
            <Input
              placeholder="Focus item..."
              value={item}
              onChange={(e) => {
                const updated = [...monthData.items];
                updated[index] = e.target.value;
                updateMonthItems(setMonthData, updated);
              }}
              disabled={!canEdit}
              className="flex-1"
            />
            {canEdit && monthData.items.length > 1 && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  const updated = monthData.items.filter((_, i) => i !== index);
                  updateMonthItems(setMonthData, updated);
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        ))}
        {canEdit && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={() => updateMonthItems(setMonthData, [...monthData.items, ''])}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Focus Item
          </Button>
        )}
      </CardContent>
    </Card>
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-primary" />
          <CardTitle>Monthly Focus</CardTitle>
        </div>
        {canEdit && (
          <Button onClick={handleSave} disabled={isSaving} size="sm">
            <Save className="h-4 w-4 mr-2" />
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <div className="grid md:grid-cols-3 gap-4">
          {renderMonthCard(monthNames[0], month1, setMonth1)}
          {renderMonthCard(monthNames[1], month2, setMonth2)}
          {renderMonthCard(monthNames[2], month3, setMonth3)}
        </div>
      </CardContent>
    </Card>
  );
}
