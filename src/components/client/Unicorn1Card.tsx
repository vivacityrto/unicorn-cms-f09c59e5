import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ExternalLink, Save, Link2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface Unicorn1CardProps {
  tenantId: number;
}

export function Unicorn1Card({ tenantId }: Unicorn1CardProps) {
  const { user } = useAuth();
  const [unicorn1Id, setUnicorn1Id] = useState('');
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      const { data } = await supabase
        .from('tenants')
        .select('unicorn1_id')
        .eq('id', tenantId)
        .single();

      setUnicorn1Id(data?.unicorn1_id != null ? String(data.unicorn1_id) : '');
      setLoaded(true);
    };

    fetchData();
  }, [tenantId]);

  const effectiveId = unicorn1Id.trim() || String(tenantId);

  const handleSave = async () => {
    const trimmed = unicorn1Id.trim();
    if (trimmed && !/^\d+$/.test(trimmed)) {
      toast.error('Unicorn 1 ID must be a whole number');
      return;
    }

    setSaving(true);
    try {
      const idValue = trimmed ? Number(trimmed) : null;

      const { error } = await supabase
        .from('tenants')
        .update({ unicorn1_id: idValue })
        .eq('id', tenantId);

      if (error) throw error;

      await supabase.from('client_audit_log').insert([{
        tenant_id: tenantId,
        actor_user_id: user?.id,
        action: 'unicorn1_id_updated',
        entity_type: 'tenant',
        entity_id: String(tenantId),
        details: { unicorn1_id: idValue },
      }]);

      toast.success('Unicorn 1 ID saved');
    } catch (err) {
      console.error('Failed to save Unicorn 1 ID:', err);
      toast.error('Failed to save Unicorn 1 ID');
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5" />
              Unicorn 1
            </CardTitle>
            <CardDescription className="mt-1">
              Override the Unicorn 1 client id used by the "Unicorn 1" redirect link.
              Leave blank to use this tenant's own id ({tenantId}).
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open(`https://unicorn-cms.com.au/clients/${effectiveId}`, '_blank', 'noopener,noreferrer')}
          >
            <ExternalLink className="h-4 w-4 mr-1" />
            Open in Unicorn 1
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="unicorn1-id">Unicorn 1 ID</Label>
            <Input
              id="unicorn1-id"
              inputMode="numeric"
              placeholder={String(tenantId)}
              value={unicorn1Id}
              onChange={(e) => setUnicorn1Id(e.target.value)}
            />
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
