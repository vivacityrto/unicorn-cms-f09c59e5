import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useVivacityTeamUsers } from '@/hooks/useVivacityTeamUsers';
import type { EosScorecardMetric, MetricDirection } from '@/types/eos';

interface MetricEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  metric?: EosScorecardMetric | null;
}

export function MetricEditorDialog({ open, onOpenChange, metric }: MetricEditorDialogProps) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const { users } = useTenantUsers();
  const isEditing = !!metric;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [targetValue, setTargetValue] = useState<number>(0);
  const [unit, setUnit] = useState('');
  const [frequency, setFrequency] = useState('Weekly');
  const [category, setCategory] = useState('general');
  const [direction, setDirection] = useState<MetricDirection>('higher_is_better');
  const [ownerId, setOwnerId] = useState<string>('');

  useEffect(() => {
    if (metric) {
      setName(metric.name || '');
      setDescription(metric.description || '');
      setTargetValue(metric.target_value || 0);
      setUnit(metric.unit || '');
      setFrequency(metric.frequency || 'Weekly');
      setCategory(metric.category || 'general');
      setDirection(metric.direction || 'higher_is_better');
      setOwnerId(metric.owner_id || '');
    } else {
      resetForm();
    }
  }, [metric, open]);

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

      const payload: Record<string, any> = {
        scorecard_id: scorecardId,
        tenant_id: profile?.tenant_id!,
        metric_name: name,
        name: name,
        description: description || null,
        goal_value: targetValue,
        target_value: targetValue,
        unit: unit || '%',
        frequency,
        category,
        direction,
        owner_id: ownerId || null,
        is_active: true,
        is_archived: false,
        display_order: 0,
      };

      const { data, error } = await supabase
        .from('eos_scorecard_metrics')
        .insert(payload as any)
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

  const updateMetricMutation = useMutation({
    mutationFn: async () => {
      if (!metric) throw new Error('No metric to update');
      const { data, error } = await supabase
        .from('eos_scorecard_metrics')
        .update({
          name,
          metric_name: name,
          description: description || null,
          target_value: targetValue,
          goal_value: targetValue,
          unit: unit || '%',
          frequency,
          category,
          direction,
          owner_id: ownerId || null,
        } as any)
        .eq('id', metric.id)
        .select()
        .single();
      if (error) throw error;

      // Audit log
      if (profile?.tenant_id && profile?.user_uuid) {
        await supabase.from('client_audit_log').insert({
          tenant_id: profile.tenant_id,
          actor_user_id: profile.user_uuid,
          action: 'scorecard_metric.updated',
          entity_type: 'eos_scorecard_metric',
          entity_id: metric.id,
          details: { name },
        });
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eos-scorecard-metrics'] });
      toast({ title: 'Metric updated successfully' });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({ title: 'Error updating metric', description: error.message, variant: 'destructive' });
    },
  });

  const resetForm = () => {
    setName('');
    setDescription('');
    setTargetValue(0);
    setUnit('');
    setFrequency('Weekly');
    setCategory('general');
    setDirection('higher_is_better');
    setOwnerId('');
  };

  const handleSubmit = () => {
    if (isEditing) {
      updateMetricMutation.mutate();
    } else {
      createMetric.mutate();
    }
  };

  const isPending = createMetric.isPending || updateMetricMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Metric' : 'Add New Metric'}</DialogTitle>
          <DialogDescription>
            {isEditing ? 'Update this scorecard metric' : 'Create a new scorecard metric to track'}
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
              <Label htmlFor="category">Category</Label>
              <Input
                id="category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g., Sales, Operations"
              />
            </div>
            <div>
              <Label htmlFor="owner">Owner</Label>
              <Select value={ownerId} onValueChange={setOwnerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select owner" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {users?.map((u) => (
                    <SelectItem key={u.user_uuid} value={u.user_uuid}>
                      {u.first_name || u.last_name
                        ? `${u.first_name || ''} ${u.last_name || ''}`.trim()
                        : u.email || 'Unknown'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
                placeholder="e.g., $, %, units"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="direction">Direction</Label>
              <Select value={direction} onValueChange={(v) => setDirection(v as MetricDirection)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="higher_is_better">Higher is Better</SelectItem>
                  <SelectItem value="lower_is_better">Lower is Better</SelectItem>
                  <SelectItem value="equals_target">Equals Target</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="frequency">Frequency</Label>
              <Select value={frequency} onValueChange={setFrequency}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Weekly">Weekly</SelectItem>
                  <SelectItem value="Monthly">Monthly</SelectItem>
                  <SelectItem value="Quarterly">Quarterly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={!name || isPending}>
              {isPending ? (isEditing ? 'Saving...' : 'Creating...') : (isEditing ? 'Save Changes' : 'Create Metric')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
