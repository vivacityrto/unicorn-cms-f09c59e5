import { useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface Client {
  id: string;
  name: string;
}

interface MultiClientSelectorProps {
  clients: Client[];
  selectedClientIds: string[];
  onChange: (clientIds: string[]) => void;
  disabled?: boolean;
}

export const MultiClientSelector = ({
  clients,
  selectedClientIds,
  onChange,
  disabled = false,
}: MultiClientSelectorProps) => {
  const [open, setOpen] = useState(false);

  const toggleClient = (clientId: string) => {
    const newSelection = selectedClientIds.includes(clientId)
      ? selectedClientIds.filter(id => id !== clientId)
      : [...selectedClientIds, clientId];
    onChange(newSelection);
  };

  const selectedClients = clients.filter(c => selectedClientIds.includes(c.id));

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between"
            disabled={disabled}
          >
            {selectedClients.length === 0 ? (
              'Select clients...'
            ) : (
              <div className="flex gap-1 flex-wrap">
                {selectedClients.slice(0, 2).map(client => (
                  <Badge key={client.id} variant="secondary">
                    {client.name}
                  </Badge>
                ))}
                {selectedClients.length > 2 && (
                  <Badge variant="secondary">
                    +{selectedClients.length - 2} more
                  </Badge>
                )}
              </div>
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full p-0">
          <Command>
            <CommandInput placeholder="Search clients..." />
            <CommandEmpty>No clients found.</CommandEmpty>
            <CommandGroup>
              {clients.map((client) => (
                <CommandItem
                  key={client.id}
                  onSelect={() => toggleClient(client.id)}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      selectedClientIds.includes(client.id)
                        ? 'opacity-100'
                        : 'opacity-0'
                    )}
                  />
                  {client.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
};
