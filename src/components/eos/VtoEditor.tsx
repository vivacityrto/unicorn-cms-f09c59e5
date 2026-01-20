import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { Save, X, Plus, Compass, Heart, Users, Rocket, Calendar, Sparkles, Shield } from 'lucide-react';
import type { EosVtoVersion } from '@/types/eos';

interface VtoEditorProps {
  vto?: EosVtoVersion | null;
  onCancel: () => void;
}

export function VtoEditor({ vto, onCancel }: VtoEditorProps) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  // Grand Vision (10-Year Target)
  const [tenYearTarget, setTenYearTarget] = useState(vto?.ten_year_target || '');
  
  // Core Values
  const [coreValues, setCoreValues] = useState<string[]>(
    Array.isArray(vto?.core_values) ? vto.core_values : ['', '', '']
  );
  
  // Target Market
  const [targetMarket, setTargetMarket] = useState(vto?.target_market || '');
  
  // 3-Year Mission Checkpoint
  const [threeYearRevenue, setThreeYearRevenue] = useState(vto?.three_year_revenue_target || 0);
  const [threeYearProfit, setThreeYearProfit] = useState(vto?.three_year_profit_target || 0);
  const [threeYearMeasurables, setThreeYearMeasurables] = useState(
    typeof vto?.three_year_measurables === 'string' ? vto.three_year_measurables : ''
  );
  
  // 12 Month Mission Objectives
  const [oneYearRevenue, setOneYearRevenue] = useState(vto?.one_year_revenue_target || 0);
  const [oneYearProfit, setOneYearProfit] = useState(vto?.one_year_profit_target || 0);
  const [oneYearGoals, setOneYearGoals] = useState(
    typeof vto?.one_year_goals === 'string' ? vto.one_year_goals : ''
  );
  
  // What Makes Us Different (3 Uniques)
  const [uniques, setUniques] = useState<string[]>(
    Array.isArray(vto?.proven_process) ? vto.proven_process : ['', '', '']
  );

  const publishVto = useMutation({
    mutationFn: async () => {
      const upsertData: Record<string, unknown> = {
        tenant_id: profile?.tenant_id!,
        ten_year_target: tenYearTarget,
        core_values: coreValues.filter(v => v.trim()),
        target_market: targetMarket,
        three_year_revenue_target: threeYearRevenue,
        three_year_profit_target: threeYearProfit,
        three_year_measurables: threeYearMeasurables,
        one_year_revenue_target: oneYearRevenue,
        one_year_profit_target: oneYearProfit,
        one_year_goals: oneYearGoals,
        proven_process: uniques.filter(u => u.trim()),
        updated_by: profile?.user_uuid,
      };
      
      // Include id for updates to existing VTO, otherwise create new
      if (vto?.id) {
        upsertData.id = vto.id;
      } else {
        upsertData.created_by = profile?.user_uuid;
      }
      
      const { data, error } = await supabase
        .from('eos_vto')
        .upsert(upsertData)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eos-vto-active'] });
      queryClient.invalidateQueries({ queryKey: ['eos-vto-versions'] });
      toast({ title: 'Mission Control published successfully' });
      onCancel();
    },
    onError: (error: Error) => {
      toast({ title: 'Error publishing Mission Control', description: error.message, variant: 'destructive' });
    },
  });

  const handleAddCoreValue = () => {
    setCoreValues([...coreValues, '']);
  };

  const handleRemoveCoreValue = (index: number) => {
    setCoreValues(coreValues.filter((_, i) => i !== index));
  };

  const handleAddUnique = () => {
    if (uniques.length < 3) {
      setUniques([...uniques, '']);
    }
  };

  const handleRemoveUnique = (index: number) => {
    setUniques(uniques.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-6">
      {/* Grand Vision (10-Year Target) */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Compass className="h-5 w-5 text-primary" />
            <CardTitle>Grand Vision</CardTitle>
          </div>
          <CardDescription>
            Where Vivacity is heading long-term and why the business exists.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            placeholder="Describe the future state of Vivacity and ComplyHub. Focus on impact, scale, and role in the RTO, CRICOS, and GTO ecosystem. Write as a clear, confident statement, not marketing copy."
            value={tenYearTarget}
            onChange={(e) => setTenYearTarget(e.target.value)}
            rows={4}
          />
        </CardContent>
      </Card>

      {/* Core Values */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Heart className="h-5 w-5 text-primary" />
            <CardTitle>Core Values</CardTitle>
          </div>
          <CardDescription>
            The behaviours and standards that guide every decision and action. Values must be practical and observable. Each value should guide how work is done, not just what is believed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {coreValues.map((value, index) => (
            <div key={index} className="flex gap-2">
              <Input
                placeholder={`Core Value ${index + 1}`}
                value={value}
                onChange={(e) => {
                  const updated = [...coreValues];
                  updated[index] = e.target.value;
                  setCoreValues(updated);
                }}
              />
              {coreValues.length > 1 && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleRemoveCoreValue(index)}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={handleAddCoreValue}>
            <Plus className="h-4 w-4 mr-2" />
            Add Core Value
          </Button>
        </CardContent>
      </Card>

      {/* Target Market */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <CardTitle>Target Market</CardTitle>
          </div>
          <CardDescription>
            The organisations Vivacity is built to serve. Define provider types, size, and compliance needs. Be specific and operational.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            placeholder="Define provider types, size, and compliance needs. Exclude non-ideal customers. Be specific and operational."
            value={targetMarket}
            onChange={(e) => setTargetMarket(e.target.value)}
            rows={3}
          />
        </CardContent>
      </Card>

      {/* 3-Year Mission Checkpoint */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Rocket className="h-5 w-5 text-primary" />
            <CardTitle>3-Year Mission Checkpoint</CardTitle>
          </div>
          <CardDescription>
            Where the business must be in three years to stay on mission. Revenue and profit targets must be realistic and accountable.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Revenue Target ($)</Label>
              <Input
                type="number"
                placeholder="Enter revenue target..."
                value={threeYearRevenue || ''}
                onChange={(e) => setThreeYearRevenue(Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label>Profit Target ($)</Label>
              <Input
                type="number"
                placeholder="Enter profit target..."
                value={threeYearProfit || ''}
                onChange={(e) => setThreeYearProfit(Number(e.target.value))}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Measurables</Label>
            <Textarea
              placeholder="Measurables should be concrete outcomes, not tasks. Tie growth to systems, delivery, and capacity."
              value={threeYearMeasurables}
              onChange={(e) => setThreeYearMeasurables(e.target.value)}
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      {/* 12 Month Mission Objectives */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            <CardTitle>12 Month Mission Objectives</CardTitle>
          </div>
          <CardDescription>
            The outcomes that must be achieved in the next 12 months. This section sets the operating boundary for the year. All Rocks and priorities must align here.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Revenue Target ($)</Label>
              <Input
                type="number"
                placeholder="Enter revenue target..."
                value={oneYearRevenue || ''}
                onChange={(e) => setOneYearRevenue(Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label>Profit Target ($)</Label>
              <Input
                type="number"
                placeholder="Enter profit target..."
                value={oneYearProfit || ''}
                onChange={(e) => setOneYearProfit(Number(e.target.value))}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Measurables</Label>
            <Textarea
              placeholder="Focus on execution, delivery, and stability. Define concrete outcomes that can be tracked."
              value={oneYearGoals}
              onChange={(e) => setOneYearGoals(e.target.value)}
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      {/* What Makes Us Different (3 Uniques) */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <CardTitle>What Makes Us Different</CardTitle>
          </div>
          <CardDescription>
            The three reasons Vivacity is chosen over alternatives. Each unique must be provable in delivery. Tie directly to Unicorn 2.0, ComplyHub, and lived audit experience.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {uniques.map((unique, index) => (
            <div key={index} className="flex gap-2">
              <Input
                placeholder={`Unique ${index + 1} - Avoid generic consulting claims`}
                value={unique}
                onChange={(e) => {
                  const updated = [...uniques];
                  updated[index] = e.target.value;
                  setUniques(updated);
                }}
              />
              {uniques.length > 1 && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleRemoveUnique(index)}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
          {uniques.length < 3 && (
            <Button variant="outline" size="sm" onClick={handleAddUnique}>
              <Plus className="h-4 w-4 mr-2" />
              Add Unique
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={() => publishVto.mutate()} disabled={publishVto.isPending}>
          <Save className="h-4 w-4 mr-2" />
          {publishVto.isPending ? 'Publishing...' : 'Publish Mission Control'}
        </Button>
      </div>
    </div>
  );
}
