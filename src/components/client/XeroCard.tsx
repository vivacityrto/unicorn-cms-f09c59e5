import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, Save, Receipt, RefreshCw, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface XeroCardProps {
  tenantId: number;
}

interface XeroInvoice {
  invoiceId: string;
  invoiceNumber: string | null;
  type: string;
  status: string;
  total: number;
  amountDue: number;
  amountPaid: number;
  date: string | null;
  dueDate: string | null;
  reference: string | null;
}

const INVOICE_STATUS_CONFIG: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
  PAID: { color: 'bg-green-500/10 text-green-600 border-green-500', icon: <CheckCircle2 className="h-3 w-3" />, label: 'Paid' },
  AUTHORISED: { color: 'bg-amber-500/10 text-amber-600 border-amber-500', icon: <Clock className="h-3 w-3" />, label: 'Awaiting Payment' },
  SUBMITTED: { color: 'bg-amber-500/10 text-amber-600 border-amber-500', icon: <Clock className="h-3 w-3" />, label: 'Submitted' },
  DRAFT: { color: 'bg-gray-500/10 text-gray-600 border-gray-500', icon: <Clock className="h-3 w-3" />, label: 'Draft' },
  VOIDED: { color: 'bg-gray-500/10 text-gray-600 border-gray-500', icon: <AlertCircle className="h-3 w-3" />, label: 'Voided' },
};

export function XeroCard({ tenantId }: XeroCardProps) {
  const { user } = useAuth();
  const [contactUrl, setContactUrl] = useState('');
  const [invoiceUrl, setInvoiceUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [invoices, setInvoices] = useState<XeroInvoice[] | null>(null);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);
  const [checkingInvoices, setCheckingInvoices] = useState(false);

  const handleCheckInvoices = async () => {
    setCheckingInvoices(true);
    setInvoiceError(null);
    try {
      const { data, error } = await supabase.functions.invoke('xero-invoice-status', {
        body: { tenant_id: tenantId },
      });
      if (error) throw error;
      if (data?.error) {
        setInvoiceError(data.error);
        setInvoices(null);
        return;
      }
      setInvoices(data?.invoices ?? []);
    } catch (err) {
      console.error('Failed to check Xero invoice status:', err);
      setInvoiceError(err instanceof Error ? err.message : 'Failed to check invoice status');
      setInvoices(null);
    } finally {
      setCheckingInvoices(false);
    }
  };

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
        details: {
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
            {hasContactUrl ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(contactUrl, '_blank', 'noopener,noreferrer')}
              >
                <ExternalLink className="h-4 w-4 mr-1" />
                Contact
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open('https://go.xero.com/app/!6hi6G/contacts', '_blank', 'noopener,noreferrer')}
              >
                <ExternalLink className="h-4 w-4 mr-1" />
                Contacts
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
            <div className="flex gap-2">
              <Input
                id="xero-contact-url"
                placeholder="https://go.xero.com/Contacts/..."
                value={contactUrl}
                onChange={(e) => setContactUrl(e.target.value)}
                className="flex-1"
              />
              {hasContactUrl && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => window.open(contactUrl, '_blank', 'noopener,noreferrer')}
                  title="Open in Xero"
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="xero-invoice-url">Repeating Invoice URL</Label>
            <div className="flex gap-2">
              <Input
                id="xero-invoice-url"
                placeholder="https://go.xero.com/RepeatTransactions/..."
                value={invoiceUrl}
                onChange={(e) => setInvoiceUrl(e.target.value)}
                className="flex-1"
              />
              {hasInvoiceUrl && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => window.open(invoiceUrl, '_blank', 'noopener,noreferrer')}
                  title="Open in Xero"
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={handleSave} isLoading={saving} size="sm">
            <Save className="h-4 w-4 mr-1" />
            Save
          </Button>
        </div>

        {hasContactUrl && (
          <div className="border-t pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <Label>Invoice Status</Label>
              <Button onClick={handleCheckInvoices} isLoading={checkingInvoices} variant="outline" size="sm">
                <RefreshCw className="h-4 w-4 mr-1" />
                Check Xero
              </Button>
            </div>

            {invoiceError && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
                {invoiceError}
              </div>
            )}

            {invoices && invoices.length === 0 && !invoiceError && (
              <p className="text-sm text-muted-foreground">No invoices found for this client's Xero contact.</p>
            )}

            {invoices && invoices.length > 0 && (
              <div className="space-y-2">
                {invoices.map((inv) => {
                  const statusConfig = INVOICE_STATUS_CONFIG[inv.status] ?? {
                    color: 'bg-gray-500/10 text-gray-600 border-gray-500',
                    icon: <Clock className="h-3 w-3" />,
                    label: inv.status,
                  };
                  return (
                    <div key={inv.invoiceId} className="flex items-center justify-between p-2 rounded-lg border text-sm">
                      <div>
                        <div className="font-medium">{inv.invoiceNumber || inv.reference || 'Invoice'}</div>
                        <div className="text-muted-foreground text-xs">
                          {inv.date && format(new Date(inv.date), 'dd MMM yyyy')}
                          {inv.dueDate && ` · Due ${format(new Date(inv.dueDate), 'dd MMM yyyy')}`}
                          {' · '}${inv.total?.toFixed(2)}
                          {inv.amountDue > 0 && ` (${inv.amountDue.toFixed(2)} due)`}
                        </div>
                      </div>
                      <Badge variant="outline" className={`${statusConfig.color} px-2 py-0.5`}>
                        {statusConfig.icon}
                        <span className="ml-1">{statusConfig.label}</span>
                      </Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
