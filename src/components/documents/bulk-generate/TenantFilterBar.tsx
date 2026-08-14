import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface CscFilterOption {
  user_uuid: string;
  first_name: string | null;
  last_name: string | null;
  archived: boolean;
}

interface Props {
  search: string;
  onSearchChange: (v: string) => void;
  cscFilter: string;
  onCscFilterChange: (v: string) => void;
  cscOptions: CscFilterOption[];
  searchPlaceholder?: string;
}

/**
 * The same search + CSC filter Bulk Generate's targeted mode uses
 * (TargetedMode.tsx), extracted so Deliver to Clients can use the exact
 * same tenant-narrowing filters rather than inventing its own.
 */
export function TenantFilterBar({
  search,
  onSearchChange,
  cscFilter,
  onCscFilterChange,
  cscOptions,
  searchPlaceholder = "Search clients…",
}: Props) {
  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search className="h-3.5 w-3.5 absolute left-2 top-2.5 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="pl-7 h-8 text-xs"
        />
      </div>
      <Select value={cscFilter} onValueChange={onCscFilterChange}>
        <SelectTrigger className="h-8 text-xs">
          <SelectValue placeholder="Filter by CSC" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All CSCs</SelectItem>
          <SelectItem value="unassigned">Unassigned</SelectItem>
          {cscOptions.map((c) => (
            <SelectItem key={c.user_uuid} value={c.user_uuid}>
              {`${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || c.user_uuid}
              {c.archived ? " (archived)" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
