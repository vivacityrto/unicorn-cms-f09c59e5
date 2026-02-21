import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface TenantComboboxProps {
  tenants: { id: number; name: string }[];
  value: number | null;
  onSelect: (tenantId: number) => void;
  disabled?: boolean;
}

export function TenantCombobox({ tenants, value, onSelect, disabled }: TenantComboboxProps) {
  const [open, setOpen] = useState(false);

  const selectedName = useMemo(() => {
    if (!value) return null;
    return tenants.find(t => t.id === value)?.name ?? `#${value}`;
  }, [value, tenants]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="h-8 w-full justify-between text-xs font-normal"
        >
          <span className="truncate">{selectedName ?? "Assign tenant…"}</span>
          <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search tenants…" className="h-8 text-xs" />
          <CommandList>
            <CommandEmpty className="text-xs py-3 text-center">No tenant found.</CommandEmpty>
            <CommandGroup>
              {tenants.map(t => (
                <CommandItem
                  key={t.id}
                  value={t.name}
                  onSelect={() => {
                    onSelect(t.id);
                    setOpen(false);
                  }}
                  className="text-xs"
                >
                  <Check className={cn("mr-2 h-3 w-3", value === t.id ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{t.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
