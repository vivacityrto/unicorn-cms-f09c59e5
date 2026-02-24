import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ExternalLink, Save, Shield } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

const MEMBERSHIP_TIERS = ['Founder', 'Starter', 'Growth', 'Scale', 'Enterprise'] as const;
const UNASSIGNED = '__unassigned__';

interface ComplyHubCardProps {
  tenantId: number;
}

export function ComplyHubCard({ tenantId }: ComplyHubCardProps) {
  const { user } = useAuth();
  const [complyhubUrl, setComplyhubUrl] = useState('');
  const [membershipTier, setMembershipTier] = useState<string>(UNASSIGNED);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Load existing values
  useEffect(() => {
    const fetchData = async () => {
      const { data } = await supabase
        .from('tenants')
        .select('complyhub_url, complyhub_membership_tier')
        .eq('id', tenantId)
        .single();

      if (data) {
        setComplyhubUrl(data.complyhub_url || '');
        setMembershipTier(data.complyhub_membership_tier || UNASSIGNED);
      }
      setLoaded(true);
    };

    fetchData();
  }, [tenantId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const tierValue = membershipTier === UNASSIGNED ? null : membershipTier;
      const urlValue = complyhubUrl.trim() || null;

      const { error } = await supabase
        .from('tenants')
        .update({
          complyhub_url: urlValue,
          complyhub_membership_tier: tierValue,
        })
        .eq('id', tenantId);

      if (error) throw error;

      // Audit log
      await supabase.from('client_audit_log').insert([{
        tenant_id: tenantId,
        actor_user_id: user?.id,
        action: 'complyhub_settings_updated',
        entity_type: 'tenant',
        entity_id: String(tenantId),
        changes: {
          complyhub_url: urlValue,
          complyhub_membership_tier: tierValue,
        },
      }]);

      toast.success('ComplyHub settings saved');
    } catch (err) {
      console.error('Failed to save ComplyHub settings:', err);
      toast.error('Failed to save ComplyHub settings');
    } finally {
      setSaving(false);
    }
  };

  const hasUrl = complyhubUrl.trim().length > 0;

  if (!loaded) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              ComplyHub
            </CardTitle>
            <CardDescription className="mt-1">
              Link to this client's ComplyHub record and track their membership tier
            </CardDescription>
          </div>
          {hasUrl && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(complyhubUrl, '_blank', 'noopener,noreferrer')}
            >
              <ExternalLink className="h-4 w-4 mr-1" />
              Open in ComplyHub
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="complyhub-url">ComplyHub URL</Label>
            <Input
              id="complyhub-url"
              placeholder="https://rto.complyhub.ai/..."
              value={complyhubUrl}
              onChange={(e) => setComplyhubUrl(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="complyhub-tier">Membership Tier</Label>
            <Select value={membershipTier} onValueChange={setMembershipTier}>
              <SelectTrigger id="complyhub-tier">
                <SelectValue placeholder="Select tier" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGNED}>Not set</SelectItem>
                {MEMBERSHIP_TIERS.map((tier) => (
                  <SelectItem key={tier} value={tier}>
                    {tier}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={handleSave} isLoading={saving} size="sm">
            <Save className="h-4 w-4 mr-1" />
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
