import { useState } from "react";
import { format, parseISO } from "date-fns";
import { Pencil, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { PdpAudience, PdpCycle } from "@/features/pdp/types";
import { EditCycleDrawer } from "./EditCycleDrawer";
import { CloseCycleDialog } from "./CloseCycleDialog";

interface Props {
  cycle: PdpCycle;
  audience: PdpAudience | null;
}

const STATUS_META: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  planning:     { label: "Planning",     variant: "outline" },
  active:       { label: "Active",       variant: "default" },
  under_review: { label: "Under review", variant: "secondary" },
  completed:    { label: "Completed",    variant: "secondary" },
};

const fmt = (d?: string | null) => (d ? format(parseISO(d), "dd/MM/yyyy") : "—");

export function CycleHeaderBand({ cycle, audience }: Props) {
  const [editOpen, setEditOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const status = (cycle.status ?? "planning").toLowerCase();
  const meta = STATUS_META[status] ?? STATUS_META.planning;
  const canClose = status === "active" || status === "under_review";

  return (
    <>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl md:text-3xl font-bold text-[var(--viv-purple)]">
            {(audience?.label ?? cycle.audience_code)} — {cycle.cycle_year}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {fmt(cycle.cycle_start_date)} → {fmt(cycle.cycle_end_date)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={meta.variant}>{meta.label}</Badge>
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="mr-2 h-4 w-4" />
            Edit cycle
          </Button>
          {canClose && (
            <Button variant="destructive" size="sm" onClick={() => setCloseOpen(true)}>
              <XCircle className="mr-2 h-4 w-4" />
              Close cycle
            </Button>
          )}
        </div>
      </div>

      <EditCycleDrawer cycle={cycle} open={editOpen} onOpenChange={setEditOpen} />
      <CloseCycleDialog cycleId={cycle.id} open={closeOpen} onOpenChange={setCloseOpen} />
    </>
  );
}
