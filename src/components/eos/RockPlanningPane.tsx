import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import { useEosRocks } from '@/hooks/useEos';

interface RockPlanningPaneProps {
  meetingType: 'Quarterly' | 'Annual';
  currentQuarter: number;
  currentYear: number;
}

interface NewRock {
  title: string;
  description: string;
  owner_id: string;
  level: 'company' | 'team' | 'individual';
}

export const RockPlanningPane = ({ 
  meetingType, 
  currentQuarter,
  currentYear 
}: RockPlanningPaneProps) => {
  const { createRock } = useEosRocks();
  const [newRocks, setNewRocks] = useState<NewRock[]>([
    { title: '', description: '', owner_id: '', level: 'company' }
  ]);

  const addRock = () => {
    setNewRocks([...newRocks, { title: '', description: '', owner_id: '', level: 'company' }]);
  };

  const removeRock = (index: number) => {
    setNewRocks(newRocks.filter((_, i) => i !== index));
  };

  const updateRock = (index: number, field: keyof NewRock, value: string) => {
    const updated = [...newRocks];
    updated[index] = { ...updated[index], [field]: value };
    setNewRocks(updated);
  };

  const handleSaveRocks = () => {
    const targetQuarter = meetingType === 'Quarterly' 
      ? (currentQuarter % 4) + 1 
      : 1;
    const targetYear = meetingType === 'Quarterly' 
      ? (currentQuarter === 4 ? currentYear + 1 : currentYear)
      : currentYear + 1;

    newRocks.forEach((rock) => {
      if (rock.title) {
        createRock.mutate({
          title: rock.title,
          description: rock.description,
          owner_id: rock.owner_id || undefined,
          quarter_year: targetYear,
          quarter_number: targetQuarter,
          due_date: new Date(targetYear, (targetQuarter - 1) * 3 + 3, 0).toISOString(),
          status: 'on_track',
        });
      }
    });
  };

  const period = meetingType === 'Quarterly' ? 'Next Quarter' : 'Next Year';

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-2">Set {period} Rocks</h3>
        <p className="text-sm text-muted-foreground">
          Define 3-7 company rocks for {period.toLowerCase()}. Rocks are your most important priorities.
        </p>
      </div>

      <div className="space-y-4">
        {newRocks.map((rock, index) => (
          <Card key={index}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Rock #{index + 1}</CardTitle>
                {newRocks.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeRock(index)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Title *</Label>
                <Input
                  placeholder="Clear, measurable rock title"
                  value={rock.title}
                  onChange={(e) => updateRock(index, 'title', e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  placeholder="Additional context or success criteria..."
                  value={rock.description}
                  onChange={(e) => updateRock(index, 'description', e.target.value)}
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Level</Label>
                  <Select
                    value={rock.level}
                    onValueChange={(value) => updateRock(index, 'level', value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="company">Company</SelectItem>
                      <SelectItem value="team">Team</SelectItem>
                      <SelectItem value="individual">Individual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Owner</Label>
                  <Input
                    placeholder="Owner name"
                    value={rock.owner_id}
                    onChange={(e) => updateRock(index, 'owner_id', e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex justify-between">
        <Button variant="outline" onClick={addRock}>
          <Plus className="h-4 w-4 mr-2" />
          Add Another Rock
        </Button>
        <Button 
          onClick={handleSaveRocks}
          disabled={createRock.isPending || newRocks.every(r => !r.title)}
        >
          Save All Rocks
        </Button>
      </div>
    </div>
  );
};
