import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Building2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface LinkEventToClientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (clientId: number) => void;
}

export function LinkEventToClientDialog({
  open,
  onOpenChange,
  onConfirm,
}: LinkEventToClientDialogProps) {
  const [search, setSearch] = useState('');
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);

  // Fetch clients/tenants
  const { data: clients = [], isLoading } = useQuery({
    queryKey: ['clients-for-link', search],
    queryFn: async () => {
      let query = supabase
        .from('tenants')
        .select('id, name, rto_id')
        .order('name');
      
      if (search) {
        query = query.or(`name.ilike.%${search}%,rto_id.ilike.%${search}%`);
      }
      
      const { data, error } = await query.limit(50);
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  const handleConfirm = () => {
    if (selectedClientId) {
      onConfirm(selectedClientId);
      setSelectedClientId(null);
      setSearch('');
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    setSelectedClientId(null);
    setSearch('');
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Link event to client
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search clients..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Client list */}
          <ScrollArea className="h-[300px] border rounded-md">
            {isLoading ? (
              <div className="p-4 text-center text-muted-foreground">
                Loading clients...
              </div>
            ) : clients.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground">
                No clients found
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {clients.map((client) => (
                  <button
                    key={client.id}
                    onClick={() => setSelectedClientId(client.id)}
                    className={cn(
                      'w-full flex items-center gap-3 p-3 rounded-md text-left transition-colors',
                      selectedClientId === client.id
                        ? 'bg-primary text-primary-foreground'
                        : 'hover:bg-muted'
                    )}
                  >
                    <Building2 className="h-4 w-4 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{client.name}</div>
                      {client.rto_id && (
                        <div className="text-xs opacity-70">{client.rto_id}</div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!selectedClientId}>
            Link to client
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
