import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface RedactedInvoice {
  invoiceId: string;
  invoiceNumber: string | null;
  type: string | null;
  status: string | null;
  reference: string | null;
  contactName: string | null;
  date: string | null;
  dueDate: string | null;
  updatedAt: string | null;
  fullyPaidOn: string | null;
  sentToContact: boolean | null;
  hasAttachments: boolean | null;
  currencyCode: string | null;
  lineItems: Array<{ itemCode: string | null; itemName: string | null; quantity: number | null; accountCode: string | null }>;
  payments: Array<{ date: string | null; reference: string | null }>;
  creditNotesCount: number;
  prepaymentsCount: number;
  overpaymentsCount: number;
}

// Shared between the toggle button (header row) and the list content
// (rendered full-width below it) - lifted out of the list component so
// the two can live in different parts of XeroCard's layout while staying
// driven by one fetch/open state.
export function useXeroInvoiceList(tenantId: number) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invoices, setInvoices] = useState<RedactedInvoice[] | null>(null);

  const toggle = async () => {
    const nextOpen = !open;
    setOpen(nextOpen);
    if (!nextOpen || invoices !== null) return;

    setLoading(true);
    setError(null);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('xero-invoice-list', {
        body: { tenant_id: tenantId },
      });
      if (invokeError) throw invokeError;
      if (data?.error) {
        setError(data.error);
        return;
      }
      setInvoices(data?.invoices ?? []);
    } catch (err) {
      console.error('Failed to load Xero invoice list:', err);
      setError(err instanceof Error ? err.message : 'Failed to load invoices');
    } finally {
      setLoading(false);
    }
  };

  return { open, loading, error, invoices, toggle };
}
