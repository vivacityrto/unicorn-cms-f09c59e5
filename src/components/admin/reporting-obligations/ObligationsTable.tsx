import { MoreHorizontal, Pencil, Send, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/hooks/use-toast";
import {
  type ReportingObligationRow,
  useToggleObligationActive,
} from "@/hooks/admin/use-reporting-obligations";

interface Props {
  rows: ReportingObligationRow[];
  isLoading: boolean;
  onEdit: (o: ReportingObligationRow) => void;
  onDelete: (o: ReportingObligationRow) => void;
  onBroadcast: (o: ReportingObligationRow) => void;
}

export function ObligationsTable({ rows, isLoading, onEdit, onDelete, onBroadcast }: Props) {
  const toggle = useToggleObligationActive();

  const handleToggle = async (o: ReportingObligationRow, next: boolean) => {
    try {
      await toggle.mutateAsync({ id: o.id, is_active: next });
    } catch (err) {
      toast({
        title: "Update failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return <div className="rounded-md border p-8 text-sm text-muted-foreground">Loading obligations…</div>;
  }

  if (!rows.length) {
    return (
      <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">
        No reporting obligations yet. Use "New Obligation" to create one.
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[140px]">Code</TableHead>
            <TableHead>Title</TableHead>
            <TableHead className="w-[120px]">Audience</TableHead>
            <TableHead className="w-[140px]">Recurrence</TableHead>
            <TableHead className="w-[80px] text-center">Sort</TableHead>
            <TableHead className="w-[100px] text-center">Active</TableHead>
            <TableHead className="w-[60px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((o) => (
            <TableRow key={o.id}>
              <TableCell className="font-mono text-xs">{o.code}</TableCell>
              <TableCell className="font-medium">{o.title}</TableCell>
              <TableCell>
                <Badge variant="secondary">{o.audience_label ?? "—"}</Badge>
              </TableCell>
              <TableCell>
                <Badge variant="outline">{o.recurrence_label ?? "—"}</Badge>
              </TableCell>
              <TableCell className="text-center text-sm text-muted-foreground">{o.sort_order ?? 100}</TableCell>
              <TableCell className="text-center">
                <Switch
                  checked={o.is_active}
                  onCheckedChange={(v) => handleToggle(o, v)}
                  aria-label={`Toggle ${o.title}`}
                />
              </TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" aria-label="Open actions">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onEdit(o)}>
                      <Pencil className="h-4 w-4" /> Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onBroadcast(o)}>
                      <Send className="h-4 w-4" /> Preview & broadcast
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => onDelete(o)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
