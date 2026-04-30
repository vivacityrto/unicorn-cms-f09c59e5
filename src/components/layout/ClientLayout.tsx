import { useState, createContext, useContext } from "react";
import { ClientTenantProvider, useClientTenant } from "@/contexts/ClientTenantContext";
import { HelpCenterProvider, HelpCenterDrawer } from "@/components/help-center";
import { ClientSidebar } from "@/components/client/ClientSidebar";
import { ClientTopbar } from "@/components/client/ClientTopbar";
import { ClientFooter } from "@/components/client/ClientFooter";
import { ClientChatbotLauncher } from "@/components/client/ClientChatbotLauncher";
import { ClientRouteGuard } from "@/components/client/ClientRouteGuard";
import { ImpersonationBanner } from "@/components/client/ImpersonationBanner";
import { DocumentRequestModal } from "@/components/client/DocumentRequestModal";
import { CompliancePulseBanner } from "@/components/client/CompliancePulseBanner";
import { ClientAskVivPanel } from "@/components/ask-viv/ClientAskVivPanel";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import vivIcon from "@/assets/viv-icon.png";
import { useClientRequestActions } from "@/hooks/useClientRequestActions";
import type { DocumentRequestPrefill } from "@/components/client/DocumentRequestModal";
import { cn } from "@/lib/utils";

// Context so children (e.g. ClientHomePage) can open the request modal
type OpenDocRequestFn = (prefill?: Partial<DocumentRequestPrefill>) => void;
const ClientRequestContext = createContext<OpenDocRequestFn>(() => {});
export const useOpenDocumentRequest = () => useContext(ClientRequestContext);

function ClientLayoutInner({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isAskVivOpen, setIsAskVivOpen] = useState(false);
  const { isPreview } = useClientTenant();
  const { requestModalOpen, setRequestModalOpen, prefill, openDocumentRequest } = useClientRequestActions();

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      {/* Impersonation Banner (in flow, not fixed) */}
      {isPreview && (
        <>
          <ImpersonationBanner />
          <div className="h-12" /> {/* Spacer for fixed banner */}
        </>
      )}

      {/* Sidebar */}
      <ClientSidebar
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        onOpenDocumentRequest={() => openDocumentRequest()}
      />

      {/* Main Content */}
      <div
        className={cn(
          "flex flex-col min-h-screen w-full min-w-0 transition-all duration-300 overflow-x-hidden",
          sidebarOpen ? "md:pl-60" : "md:pl-16",
          "pl-0"
        )}
      >
        {/* Top Bar */}
        <ClientTopbar isPreview={isPreview} />

        <ClientRequestContext.Provider value={openDocumentRequest}>
          {/* Compliance Pulse Banner */}
          <div className="px-4 md:px-6 pt-3">
            <CompliancePulseBanner />
          </div>

          {/* Page Content */}
          <main className="flex-1 w-full min-w-0 p-4 md:p-6 overflow-y-auto">
            {children}
          </main>

          {/* Footer */}
          <ClientFooter />

          {/* Floating Chatbot */}
          <ClientChatbotLauncher />
        </ClientRequestContext.Provider>
      </div>

      {/* Help Center Drawer */}
      <HelpCenterDrawer />

      {/* Document Request Modal (shared) */}
      <DocumentRequestModal
        open={requestModalOpen}
        onOpenChange={setRequestModalOpen}
        prefill={prefill}
      />

      {/*
        Ask Viv (client surface)
        - Standalone trigger + panel; does NOT use the staff useAskViv() context.
        - Calls compliance-assistant-client only.
        - Visual matches the staff AskVivButton (round, vivIcon, status dot).
      */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="default"
            size="icon"
            onClick={() => setIsAskVivOpen(true)}
            aria-label="Open Ask Viv"
            className="fixed bottom-6 right-24 z-40 h-12 w-12 rounded-full shadow-lg p-1 bg-primary hover:bg-primary/90"
          >
            <img src={vivIcon} alt="Ask Viv" className="h-9 w-9 object-contain" />
            <span className="absolute top-0.5 right-0.5 h-2 w-2 rounded-full bg-[hsl(var(--success,142_76%_36%))] border border-background" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">
          <p>Ask Viv</p>
        </TooltipContent>
      </Tooltip>

      <ClientAskVivPanel
        isOpen={isAskVivOpen}
        onClose={() => setIsAskVivOpen(false)}
      />
    </div>
  );
}

export function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClientTenantProvider>
      <HelpCenterProvider>
        <ClientRouteGuard>
          <ClientLayoutInner>{children}</ClientLayoutInner>
        </ClientRouteGuard>
      </HelpCenterProvider>
    </ClientTenantProvider>
  );
}
