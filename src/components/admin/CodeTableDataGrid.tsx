import { useState, useMemo } from "react";
import { Search, Plus, Pencil, Copy, Trash2, ArrowUpDown, Database, Shield } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from "@/components/ui/table";
import type { CodeTable, CodeTableRow, CodeTableColumn } from "@/services/codeTablesService";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

interface CodeTableDataGridProps {
  table: CodeTable | null;
  data: CodeTableRow[];
  loading: boolean;
  onAdd: () => void;
  onEdit: (row: CodeTableRow) => void;
  onDuplicate: (row: CodeTableRow) => void;
  onDelete: (row: CodeTableRow) => void;
}

const HIDDEN_COLUMNS = ["created_by", "updated_by"];
const TIMESTAMP_TYPES = ["timestamp with time zone", "timestamp without time zone", "date"];

function isTimestamp(dataType: string) {
  return TIMESTAMP_TYPES.some((t) => dataType.includes(t));
}

function isBoolean(dataType: string) {
  return dataType === "boolean";
}

function formatCellValue(value: any, dataType: string) {
  if (value === null || value === undefined) return <span className="text-muted-foreground">—</span>;
  if (isBoolean(dataType)) {
    return (
      <Badge variant={value ? "default" : "secondary"} className="text-xs">
        {value ? "Active" : "Inactive"}
      </Badge>
    );
  }
  if (isTimestamp(dataType) && value) {
    try {
      return format(new Date(value), "dd MMM yyyy");
    } catch {
      return String(value);
    }
  }
  if (typeof value === "object") {
    return <code className="text-xs font-mono bg-muted px-1 rounded">{JSON.stringify(value)}</code>;
  }
  return String(value);
}

function getPrimaryKey(columns: CodeTableColumn[]): string {
  const idCol = columns.find((c) => c.column_name === "id");
  if (idCol) return "id";
  const codeCol = columns.find((c) => c.column_name === "code");
  if (codeCol) return "code";
  return columns[0]?.column_name ?? "id";
}

export function CodeTableDataGrid({
  table, data, loading, onAdd, onEdit, onDuplicate, onDelete,
}: CodeTableDataGridProps) {
  const [search, setSearch] = useState("");
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const visibleColumns = useMemo(() => {
    if (!table?.columns) return [];
    return table.columns.filter((c) => !HIDDEN_COLUMNS.includes(c.column_name));
  }, [table]);

  const filtered = useMemo(() => {
    if (!search) return data;
    const q = search.toLowerCase();
    return data.filter((row) =>
      Object.values(row).some((v) => String(v ?? "").toLowerCase().includes(q))
    );
  }, [data, search]);

  const sorted = useMemo(() => {
    if (!sortCol) return filtered;
    return [...filtered].sort((a, b) => {
      const aVal = a[sortCol] ?? "";
      const bVal = b[sortCol] ?? "";
      const cmp = String(aVal).localeCompare(String(bVal), undefined, { numeric: true });
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortCol, sortDir]);

  function handleSort(col: string) {
    if (sortCol === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  }

  if (!table) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-3">
          <Database className="h-12 w-12 text-muted-foreground mx-auto" />
          <h3 className="text-lg font-medium">Select a Code Table</h3>
          <p className="text-sm text-muted-foreground">
            Choose a table from the sidebar to view and manage its data.
          </p>
        </div>
      </div>
    );
  }

  const pk = getPrimaryKey(table.columns);

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Header */}
      <div className="p-4 border-b flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">{table.table_name}</h2>
          {table.has_rls && table.policy_count > 0 && (
            <Badge variant="outline" className="gap-1 text-primary border-primary/30">
              <Shield className="h-3 w-3" /> RLS
            </Badge>
          )}
          <span className="text-sm text-muted-foreground">
            {sorted.length} rows · {visibleColumns.length} columns
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search rows..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 w-56"
            />
          </div>
          <Button size="sm" onClick={onAdd}>
            <Plus className="h-4 w-4 mr-1" /> Add Row
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground">Loading data...</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                {visibleColumns.map((col) => (
                  <TableHead key={col.column_name}>
                    <button
                      className="flex items-center gap-1 hover:text-foreground"
                      onClick={() => handleSort(col.column_name)}
                    >
                      {col.column_name}
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </TableHead>
                ))}
                <TableHead className="w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={visibleColumns.length + 1} className="text-center py-8 text-muted-foreground">
                    No data found
                  </TableCell>
                </TableRow>
              ) : (
                sorted.map((row, idx) => (
                  <TableRow key={row[pk] ?? idx}>
                    {visibleColumns.map((col) => (
                      <TableCell key={col.column_name}>
                        {formatCellValue(row[col.column_name], col.data_type)}
                      </TableCell>
                    ))}
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onEdit(row)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onDuplicate(row)}>
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => onDelete(row)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
