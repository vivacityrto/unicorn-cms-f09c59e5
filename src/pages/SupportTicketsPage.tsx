import { useState } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { SupportTicketsList } from '@/components/support-tickets/SupportTicketsList';
import { NewTicketModal } from '@/components/support-tickets/NewTicketModal';
import { useSubmitSupportTicket } from '@/components/support-tickets/useSubmitSupportTicket';

export default function SupportTicketsPage() {
  const [newOpen, setNewOpen] = useState(false);
  const { hasTenant } = useSubmitSupportTicket();

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Support Tickets</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Report bugs, request features, or ask a question.
            </p>
          </div>
          <Button
            onClick={() => setNewOpen(true)}
            disabled={!hasTenant}
            title={!hasTenant ? 'Select a tenant to raise a ticket' : undefined}
            className="gap-1.5"
          >
            <Plus className="h-4 w-4" />
            New Ticket
          </Button>
        </div>

        <div className="rounded-lg border bg-card min-h-[60vh] flex flex-col p-3">
          <SupportTicketsList />
        </div>
      </div>
      <NewTicketModal open={newOpen} onOpenChange={setNewOpen} />
    </DashboardLayout>
  );
}
