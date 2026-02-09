import { useEffect } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { useClientPreview } from "@/contexts/ClientPreviewContext";
import { ImpersonationBanner } from "@/components/client/ImpersonationBanner";
import { ClientFooter } from "@/components/client/ClientFooter";
import { HelpCenterProvider, HelpCenterDrawer, useHelpCenter } from "@/components/help-center";
import { ClientHomePage } from "@/components/client/ClientHomePage";
import { Loader2, FileText, Calendar, Bell, LayoutDashboard, BarChart3, HelpCircle, Library } from "lucide-react";
import { Button } from "@/components/ui/button";

const clientNavItems = [
  { icon: LayoutDashboard, label: "Home", path: "/client-preview" },
  { icon: FileText, label: "Documents", path: "/manage-documents" },
  { icon: Library, label: "Resource Hub", path: "/resource-hub" },
  { icon: Calendar, label: "Calendar", path: "/client/calendar" },
  { icon: Bell, label: "Notifications", path: "/client/notifications" },
  { icon: BarChart3, label: "Reports", path: "/reports" },
];

function ClientPreviewContent() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isPreviewMode, previewTenant, loading } = useClientPreview();
  const { openHelpCenter } = useHelpCenter();

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
    <div className="min-h-screen bg-background flex flex-col">
      <ImpersonationBanner />

      <div className="pt-12 flex-1 flex flex-col">
        {/* Client portal nav */}
        <nav className="border-b border-border bg-card">
          <div className="max-w-7xl mx-auto px-6 flex items-center gap-1 overflow-x-auto">
            {clientNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    isActive
                      ? "border-brand-fuchsia text-brand-fuchsia"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                  }`}
                >
                  <Icon className={`h-4 w-4 ${isActive ? "text-brand-fuchsia" : "text-secondary"}`} />
                  {item.label}
                </Link>
              );
            })}
            {/* Help button in nav */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => openHelpCenter("chatbot")}
              className="ml-auto flex-shrink-0 gap-1.5"
            >
              <HelpCircle className="h-4 w-4" />
              Help
            </Button>
          </div>
        </nav>

        <div className="p-6 max-w-7xl mx-auto flex-1 w-full">
          {/* Header */}
          <div className="space-y-2 mb-6">
            <h1 className="text-2xl font-bold text-secondary">Welcome to {previewTenant.name}</h1>
            <p className="text-muted-foreground">
              This is a preview of the client portal experience.
            </p>
          </div>

          <ClientHomePage />
        </div>

        <ClientFooter />
      </div>

      <HelpCenterDrawer />
    </div>
  );
}

const ClientPreview = () => {
  return (
    <HelpCenterProvider>
      <ClientPreviewContent />
    </HelpCenterProvider>
  );
};

export default ClientPreview;
