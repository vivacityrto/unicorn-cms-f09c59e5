import { useState, createContext, useContext, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { uniqueChannelName } from "@/lib/realtimeChannel";
import type { Tables } from "@/integrations/supabase/types";
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
import { ClientMessengerDock } from "@/components/client/ClientMessengerDock";
import { MessengerDockProvider } from "@/components/messenger";
import { ClientNotificationReview } from "@/components/client/ClientNotificationReview";
import { LiveNotificationBanner } from "@/components/client/LiveNotificationBanner";
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
      .channel(uniqueChannelName(`client-inbox-notifier-${activeTenantId}`))
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "tenant_messages",
          filter: `tenant_id=eq.${activeTenantId}`,
        },
        (payload: RealtimePostgresChangesPayload<Tables<"tenant_messages">>) => {
          const row = payload?.new;
          if (!row || !("sender_user_uuid" in row) || !("conversation_id" in row)) return;
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
    // The client portal follows the theme the user chose (light by default, dark from the
    // toggle in the top bar). It used to be pinned to light; portalled content (dialogs,
    // drawers, menus) now matches because the theme class sits on <html>, not on this div.
    <div className="min-h-screen bg-background text-foreground overflow-x-clip">
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
          "flex flex-col min-h-screen w-full min-w-0 transition-all duration-300 overflow-x-clip",
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
            <LiveNotificationBanner isPreview={isPreview} />
          </div>

          {/* Page Content */}
          <main className="flex-1 w-full min-w-0 p-4 pb-16 md:p-6 md:pb-16 overflow-y-auto">
            {children}
          </main>

          {/* Footer: pinned to the bottom of the window, beside the sidebar, like the staff portal. */}
          <div
            className={cn(
              "fixed bottom-0 left-0 right-0 z-20 shadow-[0_-4px_12px_-4px_rgba(0,0,0,0.25)] transition-all duration-300",
              sidebarOpen ? "md:left-60" : "md:left-16",
            )}
          >
            <ClientFooter />
          </div>
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
        The messenger bubble (client surface): Ask Viv, your consultant, notices from Vivacity and every other conversation,
        with an unread count on the launcher. Ask Viv inside it still calls ask-viv-assistant-client only, and only when a
        question is sent (see ClientAskVivChat.tsx). It does not use the staff useAskViv() context.
      */}
      <ClientMessengerDock previewTenantId={isPreview ? activeTenantId ?? undefined : undefined} />

      <ScrollToTopButton />

      <ClientNotificationReview isPreview={isPreview} />
    </div>
  );
}

export function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClientTenantProvider>
      <HelpCenterProvider>
        <ClientRouteGuard>
          <MessengerDockProvider>
            <ClientLayoutInner>{children}</ClientLayoutInner>
          </MessengerDockProvider>
        </ClientRouteGuard>
      </HelpCenterProvider>
    </ClientTenantProvider>
  );
}
