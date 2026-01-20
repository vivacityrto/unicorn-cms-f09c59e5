import { Card, CardContent } from '@/components/ui/card';
import { Calendar, CalendarDays, CalendarRange } from 'lucide-react';
import type { MeetingType } from '@/types/eos';

interface MeetingTypeSelectorProps {
  selectedType: MeetingType;
  onSelect: (type: MeetingType) => void;
}

export const MeetingTypeSelector = ({ selectedType, onSelect }: MeetingTypeSelectorProps) => {
  const types = [
    {
      value: 'L10' as MeetingType,
      label: 'Level 10',
      description: 'Weekly tactical meeting (90 minutes)',
      icon: Calendar,
      duration: 90,
    },
    {
      value: 'Same_Page' as MeetingType,
      label: 'Same Page',
      description: 'Visionary & Integrator alignment (120 minutes)',
      icon: CalendarDays,
      duration: 120,
    },
    {
      value: 'Quarterly' as MeetingType,
      label: 'Quarterly',
      description: 'Full-day strategic planning',
      icon: CalendarDays,
      duration: 405,
    },
    {
      value: 'Annual' as MeetingType,
      label: 'Annual',
      description: 'Two-day strategic planning',
      icon: CalendarRange,
      duration: 810,
    },
  ];

  return (
    <div className="grid md:grid-cols-3 gap-4">
      {types.map((type) => {
        const Icon = type.icon;
        const isSelected = selectedType === type.value;
        
        return (
          <Card
            key={type.value}
            className={`cursor-pointer transition-all ${
              isSelected 
                ? 'border-primary bg-primary/5' 
                : 'hover:border-primary/50'
            }`}
            onClick={() => onSelect(type.value)}
          >
            <CardContent className="pt-6">
              <div className="flex flex-col items-center text-center space-y-3">
                <div className={`p-3 rounded-lg ${
                  isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted'
                }`}>
                  <Icon className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-semibold">{type.label}</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {type.description}
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">
                    {type.duration} minutes
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};
