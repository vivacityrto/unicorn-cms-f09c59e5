import { useClientPreview } from "@/contexts/ClientPreviewContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Eye, X, Building2, Shield } from "lucide-react";
import { useNavigate } from "react-router-dom";

/**
 * Banner shown when a Vivacity Team member is viewing as a client
 */
export function ImpersonationBanner() {
  const { isPreviewMode, previewTenant, endPreview, loading } = useClientPreview();
  const navigate = useNavigate();

  if (!isPreviewMode || !previewTenant) {
    return null;
  }

  const handleExit = async () => {
    await endPreview();
    navigate(`/tenant/${previewTenant.id}`);
  };

  const tenantTypeLabel = previewTenant.tenant_type.startsWith("academy_")
    ? "Academy"
    : "Compliance System";

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] bg-muted text-foreground px-4 py-2 shadow-md">
      <div className="max-w-screen-2xl mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Eye className="h-5 w-5 text-brand-fuchsia" />
            <span className="font-semibold text-secondary">Impersonating Client View</span>
          </div>
          <Badge variant="secondary" className="bg-card text-secondary border-border">
            <Building2 className="h-3 w-3 mr-1" />
            {previewTenant.name}
          </Badge>
          <Badge variant="outline" className="border-border text-foreground">
            {tenantTypeLabel}
          </Badge>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground">
            <Shield className="h-4 w-4" />
            <span>Read-only preview mode</span>
          </div>
          <Button
            size="sm"
            onClick={handleExit}
            disabled={loading}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            <X className="h-4 w-4 mr-1" />
            Exit Preview
          </Button>
        </div>
      </div>
    </div>
  );
}
