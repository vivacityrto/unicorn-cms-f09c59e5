import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useClientPreview } from "@/contexts/ClientPreviewContext";
import { ClientLayout } from "@/components/layout/ClientLayout";
import { ClientHomePage } from "@/components/client/ClientHomePage";
import { Loader2 } from "lucide-react";

const ClientPreview = () => {
  const navigate = useNavigate();
  const { isPreviewMode, previewTenant, loading } = useClientPreview();

  useEffect(() => {
    if (!loading && !isPreviewMode) {
      navigate("/dashboard");
    }
  }, [isPreviewMode, loading, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isPreviewMode || !previewTenant) {
    return null;
  }

  return (
    <ClientLayout>
      <div className="space-y-2 mb-6">
        <h1 className="text-2xl font-bold text-secondary">Welcome to {previewTenant.name}</h1>
        <p className="text-muted-foreground">
          This is a preview of the client portal experience.
        </p>
      </div>
      <ClientHomePage />
    </ClientLayout>
  );
};

export default ClientPreview;
