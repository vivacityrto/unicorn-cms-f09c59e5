import { useState } from "react";
import { Search, Shield, ShieldAlert, ShieldOff, Database } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { CodeTable } from "@/services/codeTablesService";
import { cn } from "@/lib/utils";

interface CodeTableSidebarProps {
  tables: CodeTable[];
  selectedTable: string | null;
  onSelect: (tableName: string) => void;
  loading: boolean;
}

function RlsIcon({ hasRls, policyCount }: { hasRls: boolean; policyCount: number }) {
  if (!hasRls) return <ShieldOff className="h-4 w-4 text-destructive" />;
  if (policyCount === 0) return <ShieldAlert className="h-4 w-4 text-warning" />;
  return <Shield className="h-4 w-4 text-primary" />;
}

function formatTableName(name: string) {
  return name
    .replace(/^dd_/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function CodeTableSidebar({ tables, selectedTable, onSelect, loading }: CodeTableSidebarProps) {
  const [search, setSearch] = useState("");

  const filtered = tables.filter((t) =>
    t.table_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="w-80 border-r bg-card flex flex-col h-full">
      <div className="p-4 border-b space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Code Tables
        </h2>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search tables..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {loading ? (
            <div className="p-4 text-center text-sm text-muted-foreground">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">No tables found</div>
          ) : (
            filtered.map((table) => (
              <button
                key={table.table_name}
                onClick={() => onSelect(table.table_name)}
                className={cn(
                  "w-full text-left rounded-lg p-3 transition-all",
                  "hover:bg-muted/50",
                  selectedTable === table.table_name
                    ? "ring-2 ring-primary bg-primary/10"
                    : "bg-transparent"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Database className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-sm font-medium truncate">
                      {formatTableName(table.table_name)}
                    </span>
                  </div>
                  <RlsIcon hasRls={table.has_rls} policyCount={table.policy_count} />
                </div>
                <div className="flex items-center gap-2 mt-1 ml-6">
                  <Badge variant="secondary" className="text-xs">
                    {table.row_count} rows
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {table.columns?.length ?? 0} cols
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
