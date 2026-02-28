import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ExternalLink, Save, Receipt } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface XeroCardProps {
  tenantId: number;
}

export function XeroCard({ tenantId }: XeroCardProps) {
  const { user } = useAuth();
  const [contactUrl, setContactUrl] = useState('');
  const [invoiceUrl, setInvoiceUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      const { data } = await supabase
        .from('tenants')
        .select('xero_contact_url, xero_repeating_invoice_url')
        .eq('id', tenantId)
        .single();

      if (data) {
        setContactUrl((data as any).xero_contact_url || '');
        setInvoiceUrl((data as any).xero_repeating_invoice_url || '');
      }
      setLoaded(true);
    };

    fetchData();
  }, [tenantId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const contactValue = contactUrl.trim() || null;
      const invoiceValue = invoiceUrl.trim() || null;

      const { error } = await supabase
        .from('tenants')
        .update({
          xero_contact_url: contactValue,
          xero_repeating_invoice_url: invoiceValue,
        } as any)
        .eq('id', tenantId);

      if (error) throw error;

      await supabase.from('client_audit_log').insert([{
        tenant_id: tenantId,
        actor_user_id: user?.id,
        action: 'xero_settings_updated',
        entity_type: 'tenant',
        entity_id: String(tenantId),
        changes: {
          xero_contact_url: contactValue,
          xero_repeating_invoice_url: invoiceValue,
        },
      }]);

      toast.success('Xero settings saved');
    } catch (err) {
      console.error('Failed to save Xero settings:', err);
      toast.error('Failed to save Xero settings');
    } finally {
      setSaving(false);
    }
  };

  const hasContactUrl = contactUrl.trim().length > 0;
  const hasInvoiceUrl = invoiceUrl.trim().length > 0;

  if (!loaded) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              Xero
            </CardTitle>
            <CardDescription className="mt-1">
              Link to this client's Xero contact and repeating invoice records
            </CardDescription>
          </div>
          <div className="flex gap-2">
            {hasContactUrl && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(contactUrl, '_blank', 'noopener,noreferrer')}
              >
                <ExternalLink className="h-4 w-4 mr-1" />
                Contact
              </Button>
            )}
            {hasInvoiceUrl && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(invoiceUrl, '_blank', 'noopener,noreferrer')}
              >
                <ExternalLink className="h-4 w-4 mr-1" />
                Invoice
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="xero-contact-url">Xero Contact URL</Label>
            <Input
              id="xero-contact-url"
              placeholder="https://go.xero.com/Contacts/..."
              value={contactUrl}
              onChange={(e) => setContactUrl(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="xero-invoice-url">Repeating Invoice URL</Label>
            <Input
              id="xero-invoice-url"
              placeholder="https://go.xero.com/RepeatTransactions/..."
              value={invoiceUrl}
              onChange={(e) => setInvoiceUrl(e.target.value)}
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
