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
import { Save, X, Plus } from 'lucide-react';
import type { EosVtoVersion } from '@/types/eos';

interface VtoEditorProps {
  vto?: EosVtoVersion | null;
  onCancel: () => void;
}

export function VtoEditor({ vto, onCancel }: VtoEditorProps) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const [coreValues, setCoreValues] = useState<string[]>(
    Array.isArray(vto?.core_values) ? vto.core_values : ['', '', '']
  );
  const [targetMarket, setTargetMarket] = useState(vto?.target_market || '');
  const [tenYearTarget, setTenYearTarget] = useState(vto?.ten_year_target || '');
  const [threeYearRevenue, setThreeYearRevenue] = useState(vto?.three_year_revenue_target || 0);
  const [oneYearRevenue, setOneYearRevenue] = useState(vto?.one_year_revenue_target || 0);

  const publishVto = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from('eos_vto')
        .upsert({
          tenant_id: profile?.tenant_id!,
          core_values: coreValues.filter(v => v.trim()),
          target_market: targetMarket,
          ten_year_target: tenYearTarget,
          three_year_revenue_target: threeYearRevenue,
          one_year_revenue_target: oneYearRevenue,
          created_by: profile?.user_uuid,
          updated_by: profile?.user_uuid,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eos-vto-active'] });
      queryClient.invalidateQueries({ queryKey: ['eos-vto-versions'] });
      toast({ title: 'V/TO published successfully' });
      onCancel();
    },
    onError: (error: Error) => {
      toast({ title: 'Error publishing V/TO', description: error.message, variant: 'destructive' });
    },
  });

  const handleAddCoreValue = () => {
    setCoreValues([...coreValues, '']);
  };

  const handleRemoveCoreValue = (index: number) => {
    setCoreValues(coreValues.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-6">
      {/* Core Values */}
      <Card>
        <CardHeader>
          <CardTitle>Core Values</CardTitle>
          <CardDescription>What are your company's fundamental beliefs?</CardDescription>
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
          <CardTitle>Target Market</CardTitle>
          <CardDescription>Who is your ideal customer?</CardDescription>
        </CardHeader>
        <CardContent>
          <Input
            placeholder="Describe your target market..."
            value={targetMarket}
            onChange={(e) => setTargetMarket(e.target.value)}
          />
        </CardContent>
      </Card>

      {/* 10-Year Target */}
      <Card>
        <CardHeader>
          <CardTitle>10-Year Target</CardTitle>
          <CardDescription>Where do you want to be in 10 years?</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            placeholder="Describe your long-term vision..."
            value={tenYearTarget}
            onChange={(e) => setTenYearTarget(e.target.value)}
            rows={3}
          />
        </CardContent>
      </Card>

      {/* 3-Year Revenue Target */}
      <Card>
        <CardHeader>
          <CardTitle>3-Year Revenue Target</CardTitle>
          <CardDescription>Your revenue goal in 3 years</CardDescription>
        </CardHeader>
        <CardContent>
          <Input
            type="number"
            placeholder="Enter revenue target..."
            value={threeYearRevenue}
            onChange={(e) => setThreeYearRevenue(Number(e.target.value))}
          />
        </CardContent>
      </Card>

      {/* 1-Year Revenue Target */}
      <Card>
        <CardHeader>
          <CardTitle>1-Year Revenue Target</CardTitle>
          <CardDescription>Your revenue goal for this year</CardDescription>
        </CardHeader>
        <CardContent>
          <Input
            type="number"
            placeholder="Enter revenue target..."
            value={oneYearRevenue}
            onChange={(e) => setOneYearRevenue(Number(e.target.value))}
          />
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={() => publishVto.mutate()} disabled={publishVto.isPending}>
          <Save className="h-4 w-4 mr-2" />
          {publishVto.isPending ? 'Publishing...' : 'Publish V/TO'}
        </Button>
      </div>
    </div>
  );
}
