import { Button } from "@/components/ui/button";
import { FileStack, ListChecks } from "lucide-react";
import { Link } from "react-router-dom";
import { useUserAccess } from "@/hooks/useUserAccess";

/**
 * Header entry point for the bulk-document-generation feature.
 *
 * Gated on useUserAccess().isVivacityStaff — mirrors the
 * is_vivacity_internal_safe gate that create/preview/cancel/resume RPCs
 * enforce server-side. Non-staff never see the buttons.
 *
 * "Bulk generate" now routes to the dedicated /manage-documents/bulk-generate/new
 * page, which offers both the simple all-clients flow and the targeted
 * mission-control mode.
 */
export function BulkGenerateButton() {
  const { isVivacityStaff, isLoading } = useUserAccess();

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
        asChild
        variant="outline"
        className="gap-2 border-[hsl(188_74%_51%)] text-[hsl(188_74%_51%)] hover:bg-[hsl(188_74%_51%)]/10"
      >
        <Link to="/manage-documents/bulk-generate/new">
          <FileStack className="h-4 w-4" />
          Bulk generate
        </Link>
      </Button>
    </>
  );
}
