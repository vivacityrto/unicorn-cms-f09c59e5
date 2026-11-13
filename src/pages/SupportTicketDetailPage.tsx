import { useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { TicketDetail } from '@/components/support-tickets/TicketDetail';
import { useSupportTicket } from '@/components/support-tickets/useSupportTickets';

/** /support-tickets/:id: the same ticket view as the side panel, as a full page. */
export default function SupportTicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile, isSuperAdmin, loading } = useAuth();
  const allowed = profile?.is_vivacity_internal === true || isSuperAdmin();
  const { data: ticket, isLoading } = useSupportTicket(allowed ? id : undefined);

  useEffect(() => {
    if (loading || allowed) return;
    toast.error('Tickets are for the Vivacity team only.');
    navigate('/dashboard', { replace: true });
  }, [loading, allowed, navigate]);

  if (!allowed) return <div className="p-6 text-sm text-muted-foreground">Redirecting</div>;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-4 sm:p-6">
      <Link
        to="/support-tickets"
        className="inline-flex min-h-11 items-center gap-1.5 rounded text-sm font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring sm:min-h-0"
      >
        <ArrowLeft aria-hidden className="h-4 w-4" />
        Back to tickets
      </Link>
      <div className="rounded-xl border border-border bg-card p-4 sm:p-6">
        {isLoading ? (
          <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> Loading ticket
          </div>
        ) : ticket ? (
          <TicketDetail ticket={ticket} />
        ) : (
          <p className="text-sm text-muted-foreground">This ticket could not be found, or you do not have access to it.</p>
        )}
      </div>
    </div>
  );
}
