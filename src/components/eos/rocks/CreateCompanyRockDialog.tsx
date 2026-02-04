import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Target, Plus, X, Armchair, Building2 } from 'lucide-react';
import { useEosRocksHierarchy } from '@/hooks/useEosRocksHierarchy';
import { useVivacityTeamUsers, VIVACITY_TENANT_ID } from '@/hooks/useVivacityTeamUsers';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getCurrentQuarter } from '@/utils/rockRollup';
import { DB_ROCK_STATUS } from '@/utils/rockStatusUtils';

interface CreateCompanyRockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function CreateCompanyRockDialog({ open, onOpenChange, onSuccess }: CreateCompanyRockDialogProps) {
  const { createRock, activeVto } = useEosRocksHierarchy();
  const currentQuarter = getCurrentQuarter();
  
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [issue, setIssue] = useState('');
  const [outcome, setOutcome] = useState('');
  const [seatId, setSeatId] = useState('');
  const [quarterYear, setQuarterYear] = useState(currentQuarter.year);
  const [quarterNumber, setQuarterNumber] = useState(currentQuarter.quarter);
  const [dueDate, setDueDate] = useState('');
  const [milestones, setMilestones] = useState<{ id: string; text: string; completed: boolean }[]>([]);

  // Helper function to calculate quarter end date
  const getQuarterEndDate = (year: number, quarter: number): string => {
    const quarterEndDates: Record<number, { month: number; day: number }> = {
      1: { month: 3, day: 31 },   // March 31
      2: { month: 6, day: 30 },   // June 30
      3: { month: 9, day: 30 },   // September 30
      4: { month: 12, day: 31 }, // December 31
    };
    const { month, day } = quarterEndDates[quarter];
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  };

  // Auto-update due date when quarter or year changes
  const handleQuarterChange = (newQuarter: number) => {
    setQuarterNumber(newQuarter);
    setDueDate(getQuarterEndDate(quarterYear, newQuarter));
  };

  const handleYearChange = (newYear: number) => {
    setQuarterYear(newYear);
    setDueDate(getQuarterEndDate(newYear, quarterNumber));
  };

  // Fetch seats
  const { data: seats } = useQuery({
    queryKey: ['seats-for-rocks', VIVACITY_TENANT_ID],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('accountability_seats')
        .select(`
          id,
          seat_name,
          accountability_functions!inner(name)
        `)
        .eq('tenant_id', VIVACITY_TENANT_ID);
      
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setIssue('');
    setOutcome('');
    setSeatId('');
    setQuarterYear(currentQuarter.year);
    setQuarterNumber(currentQuarter.quarter);
    setDueDate('');
    setMilestones([]);
  };

  const handleSubmit = async () => {
    if (!title.trim() || !dueDate || !seatId) return;

    await createRock.mutateAsync({
      title: title.trim(),
      description: description.trim() || undefined,
      issue: issue.trim() || undefined,
      outcome: outcome.trim() || undefined,
      milestones: milestones.filter(m => m.text.trim()).length > 0 
        ? milestones.filter(m => m.text.trim()) 
        : undefined,
      rock_level: 'company',
      seat_id: seatId,
      vto_id: activeVto?.id,
      quarter_year: quarterYear,
      quarter_number: quarterNumber,
      due_date: dueDate,
      status: DB_ROCK_STATUS.ON_TRACK,
    });

    resetForm();
    onOpenChange(false);
    onSuccess?.();
  };

  const addMilestone = () => {
    setMilestones([...milestones, { id: crypto.randomUUID(), text: '', completed: false }]);
  };

  const updateMilestone = (id: string, text: string) => {
    setMilestones(milestones.map(m => m.id === id ? { ...m, text } : m));
  };

  const removeMilestone = (id: string) => {
    setMilestones(milestones.filter(m => m.id !== id));
  };

  const canSubmit = title.trim() && dueDate && seatId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-purple-600" />
            Create Company Rock
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* VTO Mission link */}
          {activeVto?.ten_year_target && (
            <div className="p-3 rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800">
              <div className="flex items-center gap-2 text-sm text-purple-700 dark:text-purple-300 mb-1">
                <Target className="h-4 w-4" />
                10-Year Target (Mission)
              </div>
              <p className="text-sm font-medium">{activeVto.ten_year_target}</p>
            </div>
          )}

          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              placeholder="Company-wide 90-day goal"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="What does success look like?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          {/* Issue */}
          <div className="space-y-2">
            <Label htmlFor="issue">Issue This Rock Addresses</Label>
            <Textarea
              id="issue"
              placeholder="What problem or opportunity does this rock address?"
              value={issue}
              onChange={(e) => setIssue(e.target.value)}
              rows={2}
            />
          </div>

          {/* Outcome */}
          <div className="space-y-2">
            <Label htmlFor="outcome">Expected Outcome</Label>
            <Textarea
              id="outcome"
              placeholder="What will be different when this rock is complete?"
              value={outcome}
              onChange={(e) => setOutcome(e.target.value)}
              rows={2}
            />
          </div>

          {/* Milestones */}
          <div className="space-y-2">
            <Label>Milestones</Label>
            <div className="space-y-2">
              {milestones.map((milestone, index) => (
                <div key={milestone.id} className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground w-6">{index + 1}.</span>
                  <Input
                    placeholder={`Milestone ${index + 1}`}
                    value={milestone.text}
                    onChange={(e) => updateMilestone(milestone.id, e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeMilestone(milestone.id)}
                    className="h-8 w-8"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={addMilestone} className="w-full">
                <Plus className="h-4 w-4 mr-2" />
                Add Milestone
              </Button>
            </div>
          </div>

          {/* Seat */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Armchair className="h-4 w-4" />
              Owner Seat *
            </Label>
            <Select value={seatId || 'none'} onValueChange={(v) => setSeatId(v === 'none' ? '' : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select accountability seat..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none" disabled>Select a seat...</SelectItem>
                {seats?.map((seat) => (
                  <SelectItem key={seat.id} value={seat.id}>
                    <div className="flex items-center gap-2">
                      <span>{seat.seat_name}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {(seat.accountability_functions as any)?.name}
                      </Badge>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Quarter and Due Date */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Year</Label>
              <Select value={String(quarterYear)} onValueChange={(v) => handleYearChange(Number(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[currentQuarter.year - 1, currentQuarter.year, currentQuarter.year + 1].map((y) => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Quarter</Label>
              <Select value={String(quarterNumber)} onValueChange={(v) => handleQuarterChange(Number(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4].map((q) => (
                    <SelectItem key={q} value={String(q)}>Q{q}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Due Date *</Label>
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || createRock.isPending}>
            {createRock.isPending ? 'Creating...' : 'Create Company Rock'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
