import { Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { NewTicketModal } from '@/components/support-tickets/NewTicketModal';

export default function NewSupportTicketPage() {
  const navigate = useNavigate();
  return (
    <Fragment>
      <div className="max-w-5xl mx-auto p-6">
        <h1 className="text-2xl font-bold text-foreground">New Support Ticket</h1>
      </div>
      <NewTicketModal
        open={true}
        onOpenChange={(open) => {
          if (!open) navigate('/support-tickets');
        }}
      />
    </Fragment>
  );
}
