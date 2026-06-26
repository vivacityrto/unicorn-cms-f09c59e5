import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { ClientTicketRow } from './useClientSupportTickets';
import { CLIENT_STATUS_LABEL, CLIENT_STATUS_CLASS } from './statusDisplay';

interface Props { ticket: ClientTicketRow; }

function urgencyLabel(u: string | null): string {
  if (!u) return '—';
  return u.charAt(0).toUpperCase() + u.slice(1);
}

export function ClientTicketCard({ ticket }: Props) {
  const navigate = useNavigate();
  const statusCode = ticket.status?.code ?? 'new';
  const statusLabel = CLIENT_STATUS_LABEL[statusCode] ?? ticket.status?.label ?? 'Submitted';
  const statusClass = CLIENT_STATUS_CLASS[statusCode] ?? 'bg-gray-100 text-gray-600';

  return (
    <button
      type="button"
      onClick={() => navigate(`/client/support-tickets/${ticket.id}`)}
      className="w-full text-left bg-white border border-gray-200 rounded-xl px-5 py-4 hover:border-[#7130A0]/40 hover:shadow-sm transition cursor-pointer"
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <span className="bg-gray-100 text-gray-600 text-xs font-medium px-2 py-0.5 rounded-full">
          {ticket.item_type?.label ?? 'Other'}
        </span>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusClass}`}>
          {statusLabel}
        </span>
      </div>
      <h3 className="text-sm font-semibold text-gray-900 mb-1">{ticket.title}</h3>
      <div className="text-xs text-gray-500">
        Submitted {format(new Date(ticket.created_at), 'dd MMM yyyy')}
        <span className="mx-1.5">·</span>
        Urgency: {urgencyLabel(ticket.urgency)}
      </div>
      {ticket.resolved_at && (
        <div className="text-xs text-green-700 mt-1">
          Resolved: {format(new Date(ticket.resolved_at), 'dd MMM yyyy')}
        </div>
      )}
    </button>
  );
}
