import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import type { TicketProduct, TicketType, TicketUrgency } from './ticketLogic';

export interface CreateTicketInput {
  subject?: string;
  body: string;
  pagePath?: string;
  diagnostics?: Json;
  product?: TicketProduct;
  tenantId?: number | null;
  type?: TicketType;
  urgency?: TicketUrgency;
  externalRef?: string;
}

export interface CreatedTicket {
  id: string;
  ticketNumber: number;
}

/**
 * The only way a ticket is created. One database call makes the ticket, keeps
 * the reporter's wording verbatim as message 1 and stores diagnostics for staff.
 * Throws the database's own message when it refuses.
 */
export async function createTicket(input: CreateTicketInput): Promise<CreatedTicket> {
  const args: Record<string, unknown> = {
    p_subject: input.subject ?? '',
    p_body: input.body,
  };
  if (input.pagePath) args.p_page_path = input.pagePath;
  if (input.diagnostics) args.p_diagnostics = input.diagnostics;
  if (input.product) args.p_product = input.product;
  if (input.tenantId != null) args.p_tenant_id = input.tenantId;
  if (input.type) args.p_type = input.type;
  if (input.urgency) args.p_urgency = input.urgency;
  if (input.externalRef) args.p_external_ref = input.externalRef;

  const { data, error } = await supabase.rpc('create_support_ticket', args as never);
  if (error) throw new Error(error.message);
  const row = (data as { id: string; ticket_number: number }[] | null)?.[0];
  if (!row) throw new Error('The ticket could not be created. Please try again.');
  return { id: row.id, ticketNumber: row.ticket_number };
}

/**
 * Ask the AI to draft title, type and urgency for a client-raised ticket.
 * Fire and forget: the ticket already exists with default fields, so any
 * failure here is deliberately swallowed and staff simply sort it by hand.
 */
export function requestAiDraft(ticketId: string): void {
  void supabase.functions
    .invoke('support-ticket-ai-draft', { body: { ticket_id: ticketId } })
    .then(() => undefined, () => undefined);
}
