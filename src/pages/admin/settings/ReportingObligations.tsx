import { useState } from "react";
import { Plus, BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ObligationsTable } from "@/components/admin/reporting-obligations/ObligationsTable";
import { ObligationFormDialog } from "@/components/admin/reporting-obligations/ObligationFormDialog";
import { ObligationDeleteDialog } from "@/components/admin/reporting-obligations/ObligationDeleteDialog";
import { BroadcastPreviewDialog } from "@/components/admin/reporting-obligations/BroadcastPreviewDialog";
import {
  type ReportingObligationRow,
  useReportingObligations,
} from "@/hooks/admin/use-reporting-obligations";

export default function ReportingObligations() {
  const { data, isLoading } = useReportingObligations();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ReportingObligationRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ReportingObligationRow | null>(null);
  const [broadcastTarget, setBroadcastTarget] = useState<ReportingObligationRow | null>(null);

  const handleNew = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const handleEdit = (o: ReportingObligationRow) => {
    setEditing(o);
    setFormOpen(true);
  };

  return (
    <>
      <div className="container mx-auto py-8 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <BellRing className="h-5 w-5 text-primary" />
              Reporting Obligations
            </h1>
            <p className="text-sm text-muted-foreground max-w-2xl">
              Manage the regulatory reporting obligations surfaced to RTO and CRICOS clients. Each obligation drives the
              client portal reminder list and the nightly notification sweep, and can also be broadcast on demand.
            </p>
          </div>
          <Button onClick={handleNew}>
            <Plus className="h-4 w-4" />
            New Obligation
          </Button>
        </div>

        <ObligationsTable
          rows={data ?? []}
          isLoading={isLoading}
          onEdit={handleEdit}
          onDelete={(o) => setDeleteTarget(o)}
          onBroadcast={(o) => setBroadcastTarget(o)}
        />
      </div>

      <ObligationFormDialog open={formOpen} onOpenChange={setFormOpen} obligation={editing} />
      <ObligationDeleteDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        obligation={deleteTarget}
      />
      <BroadcastPreviewDialog
        open={!!broadcastTarget}
        onOpenChange={(o) => !o && setBroadcastTarget(null)}
        obligation={broadcastTarget}
      />
    </>
  );
}
