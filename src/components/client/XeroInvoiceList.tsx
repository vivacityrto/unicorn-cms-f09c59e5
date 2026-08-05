import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ListChecks, ChevronDown, ChevronUp } from 'lucide-react';
import { format } from 'date-fns';
import type { RedactedInvoice } from '@/hooks/useXeroInvoiceList';

// Xero's DateString/DueDateString come back as plain "YYYY-MM-DD" - format()
// on a bare date string works fine here, unlike the /Date(...)/ epoch format
// the API uses elsewhere (already unwrapped server-side for the epoch fields).
function formatDate(d: string | null): string {
  if (!d) return '—';
  try {
    return format(new Date(d), 'dd MMM yyyy');
  } catch {
    return d;
  }
}

const STATUS_VARIANT: Record<string, string> = {
  PAID: 'bg-green-500/10 text-green-600 border-green-500',
  AUTHORISED: 'bg-blue-500/10 text-blue-600 border-blue-500',
  SUBMITTED: 'bg-amber-500/10 text-amber-600 border-amber-500',
  DRAFT: 'bg-muted text-muted-foreground border-border',
  VOIDED: 'bg-red-500/10 text-red-600 border-red-500',
};

interface XeroInvoiceListToggleProps {
  open: boolean;
  onClick: () => void;
}

export function XeroInvoiceListToggle({ open, onClick }: XeroInvoiceListToggleProps) {
  return (
    <Button variant="outline" size="sm" onClick={onClick}>
      <ListChecks className="h-4 w-4 mr-1" />
      View Invoices
      {open ? <ChevronUp className="h-4 w-4 ml-1" /> : <ChevronDown className="h-4 w-4 ml-1" />}
    </Button>
  );
}

interface XeroInvoiceListContentProps {
  loading: boolean;
  error: string | null;
  invoices: RedactedInvoice[] | null;
}

// Card-list layout, not a table - a 9-column table needs real horizontal
// room (shadcn's Table enforces min-w-[800px] + nowrap headers) that a
// card sitting inside a tab panel doesn't have. Everything below wraps at
// its own width instead of forcing a horizontal scrollbar.
export function XeroInvoiceListContent({ loading, error, invoices }: XeroInvoiceListContentProps) {
  if (loading) return <p className="text-sm text-muted-foreground">Loading invoices…</p>;

  if (error) {
    return (
      <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
        {error}
      </div>
    );
  }

  if (!invoices || invoices.length === 0) {
    return <p className="text-sm text-muted-foreground">No invoices found for this client's Xero contact.</p>;
  }

  return (
    <div className="space-y-2">
      {invoices.map((inv) => {
        const lineItemSummary = inv.lineItems
          .map((li) => li.itemName ?? li.itemCode)
          .filter(Boolean)
          .join(', ');

        return (
          <div key={inv.invoiceId} className="rounded-lg border p-3 space-y-1.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                <span className="font-medium text-sm">{inv.invoiceNumber ?? '—'}</span>
                {inv.type && <Badge variant="outline" className="text-xs">{inv.type}</Badge>}
                <Badge variant="outline" className={`text-xs ${STATUS_VARIANT[inv.status ?? ''] ?? ''}`}>
                  {inv.status ?? '—'}
                </Badge>
              </div>
              <span className="text-xs text-muted-foreground shrink-0">
                {inv.sentToContact ? 'Sent to client' : 'Not sent'}
              </span>
            </div>

            {inv.reference && (
              <p className="text-xs text-muted-foreground break-words">Ref: {inv.reference}</p>
            )}

            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>Date: {formatDate(inv.date)}</span>
              <span>Due: {formatDate(inv.dueDate)}</span>
              <span>Paid: {formatDate(inv.fullyPaidOn)}</span>
            </div>

            {lineItemSummary && (
              <p className="text-xs text-muted-foreground break-words">{lineItemSummary}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
