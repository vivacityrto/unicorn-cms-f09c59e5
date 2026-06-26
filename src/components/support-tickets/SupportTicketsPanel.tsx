import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Plus, ExternalLink } from 'lucide-react';
import { SupportTicketsList } from './SupportTicketsList';
import { NewTicketModal } from './NewTicketModal';
import { useSubmitSupportTicket } from './useSubmitSupportTicket';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SupportTicketsPanel({ open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const [newOpen, setNewOpen] = useState(false);
  const { hasTenant } = useSubmitSupportTicket();

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
          <SheetHeader className="px-4 py-3 border-b">
            <div className="flex items-center justify-between gap-2">
              <SheetTitle>Support Tickets</SheetTitle>
              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => setNewOpen(true)}
                  disabled={!hasTenant}
                  title={!hasTenant ? 'Select a tenant to raise a ticket' : undefined}
                >
                  <Plus className="h-3 w-3" />
                  New
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => {
                    navigate('/support-tickets');
                    onOpenChange(false);
                  }}
                >
                  <ExternalLink className="h-3 w-3" />
                  Full View
                </Button>
              </div>
            </div>
          </SheetHeader>
          <div className="flex-1 overflow-hidden p-3">
            <SupportTicketsList onSelect={() => onOpenChange(false)} />
          </div>
        </SheetContent>
      </Sheet>
      <NewTicketModal open={newOpen} onOpenChange={setNewOpen} />
    </>
  );
}
