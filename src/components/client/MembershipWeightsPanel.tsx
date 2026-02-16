import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Settings2, Save } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useMembershipWeights, useTenantMemberships } from '@/hooks/useTenantMemberships';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';

interface MembershipWeightsPanelProps {
  tenantId: number;
}

export function MembershipWeightsPanel({ tenantId }: MembershipWeightsPanelProps) {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const membership = useTenantMemberships(tenantId);
  const { data: weights, isLoading } = useMembershipWeights(tenantId);

  const [isWeighted, setIsWeighted] = useState(false);
  const [rtoWeight, setRtoWeight] = useState(50);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Only show for dual-membership tenants, admin/staff only
  const isAdminOrStaff =
    profile?.global_role === 'SuperAdmin' ||
    profile?.unicorn_role === 'Super Admin' ||
    profile?.unicorn_role === 'Team Leader' ||
    profile?.unicorn_role === 'Team Member' ||
    profile?.unicorn_role === 'Admin';

  useEffect(() => {
    if (weights) {
      setIsWeighted(weights.mode === 'weighted');
      setRtoWeight(Math.round(Number(weights.rto_weight) * 100));
    } else {
      setIsWeighted(false);
      setRtoWeight(50);
    }
    setDirty(false);
  }, [weights]);

  if (!membership.hasDualMembership || !isAdminOrStaff) return null;

  const cricosWeight = 100 - rtoWeight;

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const mode = isWeighted ? 'weighted' : 'equal_split';
      const rto = isWeighted ? rtoWeight / 100 : 0.5;
      const cricos = isWeighted ? cricosWeight / 100 : 0.5;

      if (weights) {
        const { error } = await supabase
          .from('membership_allocation_groups')
          .update({
            mode,
            rto_weight: rto,
            cricos_weight: cricos,
            updated_by: user.id,
            updated_at: new Date().toISOString(),
          })
          .eq('tenant_id', tenantId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('membership_allocation_groups')
          .insert({
            tenant_id: tenantId,
            mode,
            rto_weight: rto,
            cricos_weight: cricos,
            updated_by: user.id,
          });
        if (error) throw error;
      }

      queryClient.invalidateQueries({ queryKey: ['membership-weights', tenantId] });
      toast({ title: 'Allocation weights saved' });
      setDirty(false);
    } catch (err: any) {
      toast({ title: 'Save failed', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-sm">Membership Allocation</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <Label htmlFor="weighted-toggle" className="text-sm">
            Use custom weights
          </Label>
          <Switch
            id="weighted-toggle"
            checked={isWeighted}
            onCheckedChange={(v) => {
              setIsWeighted(v);
              if (!v) setRtoWeight(50);
              setDirty(true);
            }}
          />
        </div>

        {isWeighted ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span>RTO</span>
              <Badge variant="outline" className="font-mono text-xs">
                {rtoWeight}%
              </Badge>
            </div>
            <Slider
              value={[rtoWeight]}
              onValueChange={([v]) => {
                setRtoWeight(v);
                setDirty(true);
              }}
              min={5}
              max={95}
              step={5}
            />
            <div className="flex items-center justify-between text-sm">
              <span>CRICOS</span>
              <Badge variant="outline" className="font-mono text-xs">
                {cricosWeight}%
              </Badge>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Time logged as "Both" will be split 50/50 between RTO and CRICOS memberships.
          </p>
        )}

        {dirty && (
          <Button size="sm" onClick={handleSave} disabled={saving} className="w-full gap-1.5">
            <Save className="h-3.5 w-3.5" />
            {saving ? 'Saving...' : 'Save Weights'}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
