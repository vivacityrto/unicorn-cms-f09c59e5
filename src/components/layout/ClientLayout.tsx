import { useState, createContext, useContext, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ClientTenantProvider, useClientTenant } from "@/contexts/ClientTenantContext";
import { HelpCenterProvider, HelpCenterDrawer } from "@/components/help-center";
import { ClientSidebar } from "@/components/client/ClientSidebar";
import { ClientTopbar } from "@/components/client/ClientTopbar";
import { ClientFooter } from "@/components/client/ClientFooter";

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
import { ScrollToTopButton } from "@/components/ui/ScrollToTopButton";
import { useClientRequestActions } from "@/hooks/useClientRequestActions";
import { usePageViewTracking } from "@/hooks/usePageViewTracking";
import type { DocumentRequestPrefill } from "@/components/client/DocumentRequestModal";
import { cn } from "@/lib/utils";

// Context so children (e.g. ClientHomePage) can open the request modal
type OpenDocRequestFn = (prefill?: Partial<DocumentRequestPrefill>) => void;
const ClientRequestContext = createContext<OpenDocRequestFn>(() => {});
export const useOpenDocumentRequest = () => useContext(ClientRequestContext);

function ClientLayoutInner({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isAskVivOpen, setIsAskVivOpen] = useState(false);
  const { isPreview, activeTenantId } = useClientTenant();
  const { requestModalOpen, setRequestModalOpen, prefill, openDocumentRequest } = useClientRequestActions();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const currentUserUuid = profile?.user_uuid ?? null;

  // Real client-portal users only — excluded during staff preview/impersonation
  // so QA click-throughs don't pollute the activity digest.
  usePageViewTracking(!isPreview);

  useEffect(() => {
    if (!activeTenantId) return;

    const channel = supabase
      .channel(`client-inbox-notifier-${activeTenantId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "tenant_messages",
          filter: `tenant_id=eq.${activeTenantId}`,
        },
        (payload: any) => {
          const row = payload?.new;
          if (!row) return;
          if (currentUserUuid && row.sender_user_uuid === currentUserUuid) return;

          queryClient.invalidateQueries({ queryKey: ["conversation-messages", row.conversation_id] });

          toast("New message received", {
            description: "You have a new message in your inbox.",
            action: {
              label: "View",
              onClick: () =>
                navigate(`/client/inbox?tab=messages&thread=${row.conversation_id}`),
            },
          });

          queryClient.invalidateQueries({ queryKey: ["client-conversations"] });
          queryClient.invalidateQueries({ queryKey: ["client-inbox"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeTenantId, currentUserUuid, navigate, queryClient]);

  return (
    // "light" pins the client portal to the light palette regardless of the
    // staff user's dark mode preference — see the .light block in index.css.
    // Dark mode for the client portal is a separate, not-yet-scoped feature.
    <div className="light min-h-screen bg-background overflow-x-hidden">
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

        {/* TODO: re-enable when document request workflow is complete */}
        <ClientRequestContext.Provider value={() => {}}>
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
            className="fixed bottom-6 right-6 z-50 h-12 w-12 rounded-full shadow-lg p-1 bg-primary hover:bg-primary/90"
          >
            <img src={vivIcon} alt="Ask Viv" className="h-9 w-9 object-contain" />
            <span className="absolute top-0.5 right-0.5 h-2 w-2 rounded-full bg-[hsl(var(--success,142_76%_36%))] border border-background" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">
          <p>Ask Viv</p>
        </TooltipContent>
      </Tooltip>

      <ScrollToTopButton />

      <ClientAskVivPanel
        isOpen={isAskVivOpen}
        onClose={() => setIsAskVivOpen(false)}
        previewTenantId={isPreview ? activeTenantId ?? undefined : undefined}
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
