import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

interface ClientQuickNavProps {
  currentTenantId: number;
}

export function ClientQuickNav({ currentTenantId }: ClientQuickNavProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [tenants, setTenants] = useState<{ id: number; name: string }[]>([]);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from("tenants")
        .select("id, name")
        .eq("status", "active")
        .order("name");
      if (data) {
        setTenants(data.map((t) => ({ id: t.id, name: t.name })));
      }
    };
    fetch();
  }, []);

  const filtered = useMemo(
    () => tenants.filter((t) => t.id !== currentTenantId),
    [tenants, currentTenantId]
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-xs font-normal"
        >
          <Search className="h-3.5 w-3.5 opacity-60" />
          Jump to client…
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[260px] p-0" align="start">
        <Command
          shouldFilter
          filter={(value, search) =>
            value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
          }
        >
          <CommandInput placeholder="Search clients…" className="h-8 text-xs" />
          <CommandList>
            <CommandEmpty className="text-xs py-3 text-center">
              No client found.
            </CommandEmpty>
            <CommandGroup>
              {filtered.map((t) => (
                <CommandItem
                  key={t.id}
                  value={t.name}
                  onSelect={() => {
                    setOpen(false);
                    navigate(`/tenant/${t.id}`);
                  }}
                  className="text-xs"
                >
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
