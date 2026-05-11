import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronsUpDown, X, Check } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { StandardRef } from "@/features/pdp/api";

const FRAMEWORK_LABELS: Record<string, { group: string; chip: string }> = {
  RTO: { group: "Standards for RTOs 2025", chip: "SRTO" },
  CRICOS: { group: "CRICOS National Code", chip: "CRICOS" },
  GTO: { group: "GTO Standards", chip: "GTO" },
  Membership: { group: "Credential & Membership", chip: "Cred" },
};

const labelFor = (framework: string) =>
  FRAMEWORK_LABELS[framework] ?? { group: framework, chip: framework };

// Natural sort so "3.2(c)" sits before "3.10"
const naturalCompare = (a: string, b: string) =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

export function useActiveStandards(frameworks?: string[]) {
  const key = frameworks && frameworks.length ? [...frameworks].sort() : "all";
  return useQuery<StandardRef[]>({
    queryKey: ["pdp", "standards-active", key],
    queryFn: async () => {
      let q = supabase
        .from("standards_reference")
        .select("id, framework, code, title")
        .eq("is_active", true);
      if (frameworks && frameworks.length) q = q.in("framework", frameworks);
      const { data, error } = await q
        .order("framework", { ascending: true })
        .order("code", { ascending: true });
      if (error) throw error;
      return (data ?? []) as StandardRef[];
    },
  });
}

interface StandardsPickerProps {
  value: string | null;
  onChange: (id: string | null, ref?: StandardRef) => void;
  frameworks?: string[];
  placeholder?: string;
  disabled?: boolean;
  allowClear?: boolean;
  className?: string;
}

export function StandardsPicker({
  value,
  onChange,
  frameworks,
  placeholder = "Link a standard…",
  disabled,
  allowClear = true,
  className,
}: StandardsPickerProps) {
  const [open, setOpen] = useState(false);
  const { data: standards, isLoading, isError } = useActiveStandards(frameworks);

  if (isError) {
    // surface once
    queueMicrotask(() => toast.error("Failed to load standards"));
  }

  const grouped = useMemo(() => {
    const map = new Map<string, StandardRef[]>();
    for (const s of standards ?? []) {
      if (!map.has(s.framework)) map.set(s.framework, []);
      map.get(s.framework)!.push(s);
    }
    for (const arr of map.values()) arr.sort((a, b) => naturalCompare(a.code, b.code));
    return Array.from(map.entries()).sort(([a], [b]) =>
      labelFor(a).group.localeCompare(labelFor(b).group),
    );
  }, [standards]);

  const selected = useMemo(
    () => (standards ?? []).find((s) => s.id === value) ?? null,
    [standards, value],
  );

  const triggerLabel = selected ? (
    <span className="inline-flex items-center gap-2 min-w-0">
      <Badge variant="outline" className="shrink-0">
        {labelFor(selected.framework).chip}
      </Badge>
      <span className="truncate">
        {selected.code} — {selected.title}
      </span>
    </span>
  ) : (
    <span className="text-muted-foreground">{placeholder}</span>
  );

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className="flex-1 justify-between font-normal"
          >
            <span className="truncate">{triggerLabel}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[420px] p-0 pointer-events-auto" align="start">
          <Command
            filter={(itemValue, search) => {
              if (!search) return 1;
              return itemValue.toLowerCase().includes(search.toLowerCase()) ? 1 : 0;
            }}
          >
            <CommandInput placeholder="Search by code or keyword…" />
            <CommandList>
              {isLoading ? (
                <CommandItem disabled value="__loading__">
                  Loading standards…
                </CommandItem>
              ) : isError ? (
                <CommandItem disabled value="__error__">
                  Failed to load standards
                </CommandItem>
              ) : (
                <>
                  <CommandEmpty>No standards match</CommandEmpty>
                  {grouped.map(([framework, items]) => {
                    const meta = labelFor(framework);
                    return (
                      <CommandGroup key={framework} heading={meta.group}>
                        {items.map((s) => {
                          const itemValue = `${framework} ${s.code} ${s.title}`;
                          const isSelected = s.id === value;
                          return (
                            <CommandItem
                              key={s.id}
                              value={itemValue}
                              onSelect={() => {
                                onChange(s.id, s);
                                setOpen(false);
                              }}
                              className="gap-2"
                            >
                              <Badge variant="outline" className="shrink-0">
                                {meta.chip}
                              </Badge>
                              <span className="font-medium shrink-0">{s.code}</span>
                              <span className="text-muted-foreground">—</span>
                              <span className="truncate">{s.title}</span>
                              {isSelected && (
                                <Check className="ml-auto h-4 w-4 text-primary" />
                              )}
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    );
                  })}
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {allowClear && value && !disabled && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onChange(null, undefined)}
          aria-label="Clear standard"
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
