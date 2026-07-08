import * as React from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";

export type MultiSelectOption = {
  value: string;
  label: string;
  description?: string;
  right?: React.ReactNode;
};

interface Props {
  options: MultiSelectOption[];
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  emptyText?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  maxSelectedDisplay?: number;
  className?: string;
}

export function MultiSelect({
  options,
  values,
  onChange,
  placeholder = "Select…",
  emptyText = "No results.",
  searchPlaceholder = "Search…",
  disabled,
  maxSelectedDisplay = 3,
  className,
}: Props) {
  const [open, setOpen] = React.useState(false);
  const selectedSet = React.useMemo(() => new Set(values), [values]);

  const toggle = (v: string) => {
    if (selectedSet.has(v)) {
      onChange(values.filter((x) => x !== v));
    } else {
      onChange([...values, v]);
    }
  };

  const clearAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange([]);
  };

  const selectedOptions = options.filter((o) => selectedSet.has(o.value));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full justify-between font-normal min-h-10 h-auto py-2",
            values.length === 0 && "text-muted-foreground",
            className,
          )}
        >
          <div className="flex flex-wrap gap-1 items-center max-w-full">
            {values.length === 0 ? (
              placeholder
            ) : selectedOptions.length <= maxSelectedDisplay ? (
              selectedOptions.map((o) => (
                <Badge
                  key={o.value}
                  variant="secondary"
                  className="text-xs font-normal"
                >
                  {o.label}
                </Badge>
              ))
            ) : (
              <>
                <Badge variant="secondary" className="text-xs font-normal">
                  {values.length} selected
                </Badge>
              </>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {values.length > 0 && (
              <span
                role="button"
                onClick={clearAll}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Clear selection"
              >
                <X className="h-3.5 w-3.5" />
              </span>
            )}
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((o) => {
                const active = selectedSet.has(o.value);
                return (
                  <CommandItem
                    key={o.value}
                    value={`${o.label} ${o.description ?? ""}`}
                    onSelect={() => toggle(o.value)}
                    className="flex items-center gap-2"
                  >
                    <Check
                      className={cn(
                        "h-4 w-4",
                        active ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="truncate">{o.label}</div>
                      {o.description && (
                        <div className="text-xs text-muted-foreground truncate">
                          {o.description}
                        </div>
                      )}
                    </div>
                    {o.right}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
