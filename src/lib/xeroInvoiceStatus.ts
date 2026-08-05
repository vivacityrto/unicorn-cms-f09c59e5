/**
 * Shared "is this Xero invoice due date in the past" check, used
 * everywhere the paid/due_date cache columns are rendered (client detail
 * header pill, XeroCard, Manage Tenants) so overdue vs due-in-future
 * styling stays consistent instead of drifting per-component.
 */
export function isXeroInvoiceOverdue(dueDate: string | null | undefined): boolean {
  if (!dueDate) return false;
  return new Date(dueDate) < new Date();
}
