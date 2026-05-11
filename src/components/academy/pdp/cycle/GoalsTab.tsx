import { useMemo, useState } from "react";
import { Plus, Trash2, Pencil } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  useDeleteGoal,
  useEvidence,
  useGoals,
  useStandardsReference,
} from "@/features/pdp/hooks";
import { AddGoalSheet } from "@/components/academy/pdp/AddGoalSheet";

interface Props {
  cycleId: number;
}

const PRIORITY_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  high: "destructive",
  medium: "default",
  low: "secondary",
};

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  in_progress: "In progress",
  met: "Met",
  not_met: "Not met",
  deferred: "Deferred",
};

export function GoalsTab({ cycleId }: Props) {
  const { data: goals, isLoading } = useGoals(cycleId);
  const { data: evidence } = useEvidence(cycleId);
  const standardIds = (goals ?? []).map((g) => g.standard_id);
  const { data: standards } = useStandardsReference(standardIds);
  const del = useDeleteGoal(cycleId);
  const [addOpen, setAddOpen] = useState(false);
  const [confirmId, setConfirmId] = useState<number | null>(null);

  const stdMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of standards ?? []) {
      const fw = s.framework?.toUpperCase() ?? "";
      m.set(s.id, `${fw} ${s.code}`.trim());
    }
    return m;
  }, [standards]);

  const evCounts = useMemo(() => {
    const m = new Map<number, number>();
    for (const e of evidence ?? []) {
      if (e.goal_id) m.set(e.goal_id, (m.get(e.goal_id) ?? 0) + 1);
    }
    return m;
  }, [evidence]);

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Add goal
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : (goals ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">No goals yet for this cycle.</p>
      ) : (
        (goals ?? []).map((g) => {
          const target = g.target_evidence_count ?? 0;
          const count = evCounts.get(g.id) ?? 0;
          const pct = target > 0 ? Math.min(100, Math.round((count / target) * 100)) : 0;
          return (
            <Card key={g.id}>
              <CardContent className="p-4">
                <div className="flex flex-wrap items-start gap-3 justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      {g.priority && (
                        <Badge variant={PRIORITY_VARIANT[g.priority] ?? "secondary"}>
                          {g.priority}
                        </Badge>
                      )}
                      {g.standard_id && stdMap.get(g.standard_id) && (
                        <Badge variant="outline">{stdMap.get(g.standard_id)}</Badge>
                      )}
                      <Badge variant="secondary">
                        {STATUS_LABEL[g.status ?? "open"] ?? g.status}
                      </Badge>
                    </div>
                    <p className="text-sm font-semibold">{g.title}</p>
                    {g.description && (
                      <p className="text-xs text-muted-foreground mt-1">{g.description}</p>
                    )}
                    {target > 0 && (
                      <div className="mt-2 flex items-center gap-2">
                        <Progress value={pct} className="h-2 flex-1" />
                        <span className="text-xs text-muted-foreground">
                          {count} / {target} evidence
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" disabled title="Edit (coming soon)">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setConfirmId(g.id)}
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })
      )}

      <AddGoalSheet open={addOpen} onOpenChange={setAddOpen} cycleId={cycleId} />

      <AlertDialog open={confirmId !== null} onOpenChange={(o) => !o && setConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this goal?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. Evidence linked to this goal will remain but be unlinked.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (confirmId !== null) {
                  await del.mutateAsync(confirmId);
                  setConfirmId(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
