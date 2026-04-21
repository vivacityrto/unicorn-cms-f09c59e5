import { useEffect, useState } from "react";
import {
  AppModal,
  AppModalContent,
  AppModalHeader,
  AppModalTitle,
  AppModalDescription,
  AppModalBody,
  AppModalFooter,
} from "@/components/ui/modals";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useBackfillPreview, useBackfillRule } from "@/hooks/academy/useAcademyPackageRules";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ruleId: number;
  packageId: number;
  courseId: number;
  packageName: string;
  courseTitle: string;
}

export default function BackfillConfirmModal({
  open,
  onOpenChange,
  ruleId,
  packageId,
  courseId,
  packageName,
  courseTitle,
}: Props) {
  const preview = useBackfillPreview();
  const backfill = useBackfillRule();
  const [stats, setStats] = useState<{ tenants: number; users: number; new_enrollments: number } | null>(null);

  useEffect(() => {
    if (open) {
      setStats(null);
      preview.mutate(
        { packageId, courseId },
        { onSuccess: (s) => setStats(s) }
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, packageId, courseId]);

  const handleConfirm = async () => {
    await backfill.mutateAsync(ruleId);
    onOpenChange(false);
  };

  return (
    <AppModal open={open} onOpenChange={onOpenChange}>
      <AppModalContent size="lg">
        <AppModalHeader>
          <AppModalTitle>Backfill enrollments from this rule?</AppModalTitle>
          <AppModalDescription>
            This will enrol every user in tenants that currently have an active instance of{" "}
            <strong>{packageName}</strong> into <strong>{courseTitle}</strong>.
          </AppModalDescription>
        </AppModalHeader>
        <AppModalBody>
          {!stats ? (
            <div className="space-y-2">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border p-4 text-center">
                <p className="text-2xl font-bold text-foreground">{stats.tenants}</p>
                <p className="text-xs text-muted-foreground mt-1">Tenants affected</p>
              </div>
              <div className="rounded-lg border p-4 text-center">
                <p className="text-2xl font-bold text-foreground">{stats.users}</p>
                <p className="text-xs text-muted-foreground mt-1">Users affected</p>
              </div>
              <div className="rounded-lg border p-4 text-center">
                <p className="text-2xl font-bold text-primary">{stats.new_enrollments}</p>
                <p className="text-xs text-muted-foreground mt-1">New enrollments expected</p>
              </div>
            </div>
          )}
          <p className="text-xs text-muted-foreground mt-4">
            Existing enrollments will not be duplicated.
          </p>
        </AppModalBody>
        <AppModalFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={backfill.isPending}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!stats || backfill.isPending}>
            {backfill.isPending ? "Running…" : "Run backfill"}
          </Button>
        </AppModalFooter>
      </AppModalContent>
    </AppModal>
  );
}
