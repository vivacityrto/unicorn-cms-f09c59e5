import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';

interface MetricEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MetricEditorDialog({ open, onOpenChange }: MetricEditorDialogProps) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [targetValue, setTargetValue] = useState<number>(0);
  const [unit, setUnit] = useState('');
  const [frequency, setFrequency] = useState('Weekly');

  const createMetric = useMutation({
    mutationFn: async () => {
      // First, get or create a default scorecard for this tenant
      let scorecardId: string;
      
      const { data: existingScorecard } = await supabase
        .from('eos_scorecard')
        .select('id')
        .eq('tenant_id', profile?.tenant_id!)
        .eq('is_active', true)
        .maybeSingle();
      
      if (existingScorecard) {
        scorecardId = existingScorecard.id;
      } else {
        // Create a default scorecard
        const { data: newScorecard, error: scorecardError } = await supabase
          .from('eos_scorecard')
          .insert({
            tenant_id: profile?.tenant_id!,
            name: 'Default Scorecard',
            is_active: true,
          })
          .select('id')
          .single();
        
        if (scorecardError) throw scorecardError;
        scorecardId = newScorecard.id;
      }

      const { data, error } = await supabase
        .from('eos_scorecard_metrics')
        .insert({
          scorecard_id: scorecardId,
          tenant_id: profile?.tenant_id!,
          metric_name: name,
          name: name,
          description: description || null,
          goal_value: targetValue,
          target_value: targetValue,
          unit: unit || '%',
          frequency: frequency,
          is_active: true,
          display_order: 0,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eos-scorecard-metrics'] });
      toast({ title: 'Metric created successfully' });
      onOpenChange(false);
      resetForm();
    },
    onError: (error: Error) => {
      toast({ title: 'Error creating metric', description: error.message, variant: 'destructive' });
    },
  });

  const resetForm = () => {
    setName('');
    setDescription('');
    setTargetValue(0);
    setUnit('');
    setFrequency('Weekly');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add New Metric</DialogTitle>
          <DialogDescription>
            Create a new scorecard metric to track
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="name">Metric Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Weekly Revenue"
            />
          </div>
          <div>
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this metric measure?"
              rows={2}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="target">Target Value</Label>
              <Input
                id="target"
                type="number"
                value={targetValue}
                onChange={(e) => setTargetValue(Number(e.target.value))}
              />
            </div>
            <div>
              <Label htmlFor="unit">Unit</Label>
              <Input
                id="unit"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="e.g., $, units"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="frequency">Frequency</Label>
            <Input
              id="frequency"
              value={frequency}
              onChange={(e) => setFrequency(e.target.value)}
              placeholder="Weekly"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={() => createMetric.mutate()} disabled={!name || createMetric.isPending}>
              {createMetric.isPending ? 'Creating...' : 'Create Metric'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
