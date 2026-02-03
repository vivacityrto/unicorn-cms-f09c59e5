import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Plus, X, Armchair, AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import { useEosRocks } from '@/hooks/useEos';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface RockPlanningPaneProps {
  meetingType: 'Quarterly' | 'Annual';
  currentQuarter: number;
  currentYear: number;
}

interface NewRock {
  title: string;
  description: string;
  seat_id: string;
  level: 'company' | 'team' | 'individual';
}

interface SeatWithOwner {
  id: string;
  seat_name: string;
  function_name: string;
  primary_owner_id: string | null;
  primary_owner_name: string | null;
}

export const RockPlanningPane = ({ 
  meetingType, 
  currentQuarter,
  currentYear 
}: RockPlanningPaneProps) => {
  const { createRock } = useEosRocks();
  const { profile } = useAuth();
  const [newRocks, setNewRocks] = useState<NewRock[]>([
    { title: '', description: '', seat_id: '', level: 'company' }
  ]);

  const addRock = () => {
    setNewRocks([...newRocks, { title: '', description: '', seat_id: '', level: 'company' }]);
  };

  const removeRock = (index: number) => {
    setNewRocks(newRocks.filter((_, i) => i !== index));
  };

  const updateRock = (index: number, field: keyof NewRock, value: string) => {
    const updated = [...newRocks];
    updated[index] = { ...updated[index], [field]: value };
    setNewRocks(updated);
  };

  // Fetch seats with their primary owners
  const { data: seats } = useQuery({
    queryKey: ['seats-for-rock-planning', profile?.tenant_id],
    queryFn: async () => {
      const { data: seatsData, error: seatsError } = await supabase
        .from('accountability_seats')
        .select(`
          id,
          seat_name,
          accountability_functions!inner(name)
        `)
        .eq('tenant_id', profile?.tenant_id!);
      
      if (seatsError) throw seatsError;

      const { data: assignments } = await supabase
        .from('accountability_seat_assignments')
        .select('seat_id, user_id')
        .eq('tenant_id', profile?.tenant_id!)
        .eq('assignment_type', 'Primary')
        .or('end_date.is.null,end_date.gt.' + new Date().toISOString());

      const userIds = [...new Set(assignments?.map(a => a.user_id) || [])];
      const { data: users } = await supabase
        .from('users')
        .select('user_uuid, first_name, last_name')
        .in('user_uuid', userIds);

      const userMap = new Map(users?.map(u => [u.user_uuid, `${u.first_name || ''} ${u.last_name || ''}`.trim()]) || []);
      const assignmentMap = new Map(assignments?.map(a => [a.seat_id, a.user_id]) || []);

      return seatsData?.map((seat): SeatWithOwner => ({
        id: seat.id,
        seat_name: seat.seat_name,
        function_name: (seat.accountability_functions as any)?.name || '',
        primary_owner_id: assignmentMap.get(seat.id) || null,
        primary_owner_name: assignmentMap.get(seat.id) ? userMap.get(assignmentMap.get(seat.id)!) || 'Unknown' : null,
      })) || [];
    },
    enabled: !!profile?.tenant_id,
  });

  const handleSaveRocks = () => {
    const targetQuarter = meetingType === 'Quarterly' 
      ? (currentQuarter % 4) + 1 
      : 1;
    const targetYear = meetingType === 'Quarterly' 
      ? (currentQuarter === 4 ? currentYear + 1 : currentYear)
      : currentYear + 1;

    newRocks.forEach((rock) => {
      if (rock.title && rock.seat_id) {
        createRock.mutate({
          title: rock.title,
          description: rock.description,
          seat_id: rock.seat_id,
          quarter_year: targetYear,
          quarter_number: targetQuarter,
          due_date: new Date(targetYear, (targetQuarter - 1) * 3 + 3, 0).toISOString(),
          status: 'on_track',
        });
      }
    });
  };

  const period = meetingType === 'Quarterly' ? 'Next Quarter' : 'Next Year';
  const canSave = newRocks.some(r => r.title && r.seat_id);

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
                  <Label className="flex items-center gap-2">
                    <Armchair className="h-4 w-4" />
                    Seat *
                  </Label>
                  <Select
                    value={rock.seat_id || "none"}
                    onValueChange={(value) => updateRock(index, 'seat_id', value === "none" ? "" : value)}
                  >
                    <SelectTrigger className={!rock.seat_id ? 'border-amber-300' : ''}>
                      <SelectValue placeholder="Select seat..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none" disabled>Select a seat...</SelectItem>
                      {seats?.map((seat) => (
                        <SelectItem key={seat.id} value={seat.id}>
                          <div className="flex items-center gap-2">
                            <span>{seat.seat_name}</span>
                            {seat.primary_owner_name && (
                              <span className="text-muted-foreground text-xs">
                                — {seat.primary_owner_name}
                              </span>
                            )}
                            {!seat.primary_owner_id && (
                              <Badge variant="destructive" className="text-[10px]">No Owner</Badge>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!rock.seat_id && (
                    <p className="text-xs text-amber-600">Seat required for Rock accountability</p>
                  )}
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
          disabled={createRock.isPending || !canSave}
        >
          Save All Rocks
        </Button>
      </div>
    </div>
  );
};
