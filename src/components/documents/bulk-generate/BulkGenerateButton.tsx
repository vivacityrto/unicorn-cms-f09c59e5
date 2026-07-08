import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileStack, ListChecks } from "lucide-react";
import { Link } from "react-router-dom";
import { useUserAccess } from "@/hooks/useUserAccess";
import { BulkGenerateDialog } from "./BulkGenerateDialog";

/**
 * Header entry point for the bulk-document-generation feature.
 *
 * Gated on useUserAccess().isVivacityStaff — mirrors the
 * is_vivacity_internal_safe gate that create/preview/cancel/resume RPCs
 * enforce server-side. Non-staff never see the button or the list link.
 */
export function BulkGenerateButton() {
  const { isVivacityStaff, isLoading } = useUserAccess();
  const [open, setOpen] = useState(false);

  if (isLoading || !isVivacityStaff) return null;

  return (
    <>
      <Button
        asChild
        variant="outline"
        className="gap-2"
        title="View bulk generation jobs"
      >
        <Link to="/manage-documents/bulk-jobs">
          <ListChecks className="h-4 w-4" />
          Bulk jobs
        </Link>
      </Button>
      <Button
        onClick={() => setOpen(true)}
        variant="outline"
        className="gap-2 border-[hsl(188_74%_51%)] text-[hsl(188_74%_51%)] hover:bg-[hsl(188_74%_51%)]/10"
      >
        <FileStack className="h-4 w-4" />
        Bulk generate
      </Button>
      <BulkGenerateDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
