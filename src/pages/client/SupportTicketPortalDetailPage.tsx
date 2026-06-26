import { useParams, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useClientSupportTicket } from '@/components/client-portal/support-tickets/useClientSupportTickets';
import { CLIENT_STATUS_LABEL, CLIENT_STATUS_CLASS } from '@/components/client-portal/support-tickets/statusDisplay';
import { useSuggestAttachments, getAttachmentSignedUrl } from '@/hooks/useSuggestAttachments';
import { toast } from '@/hooks/use-toast';

function urgencyLabel(u: string | null): string {
  if (!u) return '—';
  return u.charAt(0).toUpperCase() + u.slice(1);
}

export default function SupportTicketPortalDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: ticket, isLoading } = useClientSupportTicket(id);
  const { data: attachments } = useSuggestAttachments(id);

  if (isLoading) {
    return (
      <div className="px-4 sm:px-6 py-16 flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="px-4 sm:px-6 py-10 max-w-5xl mx-auto">
        <Button variant="ghost" size="sm" onClick={() => navigate('/client/support-tickets')}>
          <ArrowLeft className="h-4 w-4 mr-1.5" /> Back
        </Button>
        <p className="text-sm text-gray-500 mt-6">Ticket not found.</p>
      </div>
    );
  }

  const statusCode = ticket.status?.code ?? 'new';
  const statusLabel = CLIENT_STATUS_LABEL[statusCode] ?? ticket.status?.label ?? 'Submitted';
  const statusClass = CLIENT_STATUS_CLASS[statusCode] ?? 'bg-gray-100 text-gray-600';
  const isError = ticket.item_type?.code === 'error';

  const handleOpenAttachment = async (path: string) => {
    try {
      const url = await getAttachmentSignedUrl(path);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e: any) {
      toast({ title: 'Failed to open attachment', description: e?.message, variant: 'destructive' });
    }
  };

  return (
    <div className="px-4 sm:px-6 py-6 max-w-5xl mx-auto">
      <Button variant="ghost" size="sm" onClick={() => navigate('/client/support-tickets')} className="mb-4 -ml-2">
        <ArrowLeft className="h-4 w-4 mr-1.5" /> Back to Support Tickets
      </Button>

      <div className="flex items-start justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{ticket.title}</h1>
        <span className={`text-xs font-medium px-2.5 py-1 rounded-full shrink-0 ${statusClass}`}>
          {statusLabel}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          {isError ? (
            <>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">What you were trying to do</CardTitle></CardHeader>
                <CardContent className="text-sm text-gray-700 whitespace-pre-wrap">{ticket.trying_to_do || '—'}</CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">What happened</CardTitle></CardHeader>
                <CardContent className="text-sm text-gray-700 whitespace-pre-wrap">{ticket.what_happened || '—'}</CardContent>
              </Card>
              {ticket.error_message && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Error message</CardTitle></CardHeader>
                  <CardContent className="text-sm text-gray-700 whitespace-pre-wrap font-mono">{ticket.error_message}</CardContent>
                </Card>
              )}
            </>
          ) : (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Description</CardTitle></CardHeader>
              <CardContent className="text-sm text-gray-700 whitespace-pre-wrap">{ticket.description || '—'}</CardContent>
            </Card>
          )}

          {ticket.improvement_context && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Current experience</CardTitle></CardHeader>
              <CardContent className="text-sm text-gray-700 whitespace-pre-wrap">{ticket.improvement_context}</CardContent>
            </Card>
          )}
          {ticket.feature_context && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Additional context</CardTitle></CardHeader>
              <CardContent className="text-sm text-gray-700 whitespace-pre-wrap">{ticket.feature_context}</CardContent>
            </Card>
          )}

          {ticket.resolution_notes && (
            <Card className="border-green-200 bg-green-50/50">
              <CardHeader className="pb-2"><CardTitle className="text-sm text-green-800">Resolution</CardTitle></CardHeader>
              <CardContent className="text-sm text-green-900 whitespace-pre-wrap">{ticket.resolution_notes}</CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Details</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-2">
              <div className="flex justify-between gap-3">
                <span className="text-gray-500">Type</span>
                <span className="text-gray-900 font-medium text-right">{ticket.item_type?.label ?? '—'}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-gray-500">Urgency</span>
                <span className="text-gray-900 font-medium text-right">{urgencyLabel(ticket.urgency)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-gray-500">Submitted</span>
                <span className="text-gray-900 font-medium text-right">{format(new Date(ticket.created_at), 'dd MMM yyyy')}</span>
              </div>
              {ticket.updated_at && (
                <div className="flex justify-between gap-3">
                  <span className="text-gray-500">Last Updated</span>
                  <span className="text-gray-900 font-medium text-right">{format(new Date(ticket.updated_at), 'dd MMM yyyy')}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {attachments && attachments.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Attachments</CardTitle></CardHeader>
              <CardContent className="text-sm space-y-1.5">
                {attachments.map((a: any) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => handleOpenAttachment(a.storage_path)}
                    className="block text-left text-[#7130A0] hover:underline text-xs truncate w-full"
                  >
                    {a.file_name || a.storage_path}
                  </button>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
