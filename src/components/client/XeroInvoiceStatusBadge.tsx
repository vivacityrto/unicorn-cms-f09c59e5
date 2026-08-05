import { CheckCircle2, Clock } from 'lucide-react';
import { format } from 'date-fns';

interface XeroInvoiceStatusBadgeProps {
  paid: boolean | null;
  dueDate: string | null;
}

/**
 * Ambient header pill showing whether this client's most recent Xero
 * invoice is paid - mirrors the style of RiskLevelBadge/OrgTypeBadge.
 * Reads from the cached tenants.xero_invoice_* columns (already loaded
 * by the caller's existing tenant query) rather than making its own live
 * Xero API call - see xero-invoice-sync-all for why this has to be a
 * cache, not a live per-render lookup.
 *
 * Renders nothing when paid is null (never checked / no Xero Contact
 * linked) - a client header isn't the place to surface integration
 * error states.
 */
export function XeroInvoiceStatusBadge({ paid, dueDate }: XeroInvoiceStatusBadgeProps) {
  if (paid === null) return null;

  return (
    <span
      title={paid ? 'Most recent Xero invoice is paid' : 'Most recent Xero invoice is unpaid'}
      className={`inline-flex items-center shrink-0 whitespace-nowrap gap-1 rounded-full px-2 py-0.5 text-xs font-medium border ${
        paid
          ? 'bg-green-500/10 text-green-600 border-green-500'
          : 'bg-amber-500/10 text-amber-600 border-amber-500'
      }`}
    >
      {paid ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
      {paid ? 'Paid' : dueDate ? `Due ${format(new Date(dueDate), 'dd MMM yyyy')}` : 'Unpaid'}
    </span>
  );
}
