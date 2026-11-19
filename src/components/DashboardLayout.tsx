import { useState, useMemo, useRef, useLayoutEffect, useCallback } from "react";
import { readStaffSidebarDefault, writeStaffSidebarDefault } from "@/components/client/sidebarPreference";
import { LayoutDashboard, FileText, BarChart3, Calendar, Menu, X, Users, Building2, Package2, Blocks, ScrollText, Flag, ChevronDown, ChevronUp, ChevronRight, Target, TrendingUp, ListTodo, Lightbulb, Sparkles, Library, CheckSquare, ClipboardList, ClipboardCheck, Search, Video, BookOpen, ShieldCheck, Shield, Briefcase, Inbox, Rocket, Bot, Cog, Mail, Puzzle, Bell, BellRing, MapPin, Database, FileCheck, Tags, Globe, GraduationCap, LifeBuoy, Award, Send, Download, Gauge, Activity, AlertTriangle, Radar, Compass, Network, UserPlus, UsersRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useRBAC } from "@/hooks/useRBAC";
import { useViewMode } from "@/contexts/ViewModeContext";
import { TopBar } from "@/components/layout/TopBar";
import { StaffSidebar } from "@/components/layout/StaffSidebar";
import { StaffGoToSearch } from "@/components/layout/StaffGoToSearch";
import { SIDEBAR_GRADIENT } from "@/components/layout/sidebarKit";
import { buildStaffSections, roleLabel } from "@/components/layout/staffMenu";
import { UtilityFooter } from "@/components/layout/UtilityFooter";
import { ClientFooter } from "@/components/client/ClientFooter";
import { TimeInboxBanner } from "@/components/dashboard/TimeInboxWidget";

import { AskVivPanel } from "@/components/ask-viv";
import { StaffMessengerDock } from "@/components/staff/StaffMessengerDock";
import { ScrollToTopButton } from "@/components/ui/ScrollToTopButton";
import { HelpCenterProvider } from "@/components/help-center";
import { useProfileSetupReminder } from "@/hooks/useProfileSetupReminder";
import { ProfileSetupReminderModal } from "@/components/profile/ProfileSetupReminderModal";
import { cn } from "@/lib/utils";
import { useTeamUnreadCount } from "@/hooks/useTeamUnreadCount";
import { useMyAssignedConversationsCount } from "@/hooks/useMyAssignedConversationsCount";
import { useSupportTicketsBadge } from "@/hooks/useSupportTicketsBadge";
import { isVivacityStaffRole } from "@/lib/roles/vivacityRoles";
import { StaffLiveNotificationBanner } from "@/components/notifications/StaffLiveNotificationBanner";
import { StaffNotificationReview } from "@/components/notifications/StaffNotificationReview";

// Client-facing menu items (for Admin/User roles and "View as Client" mode)
const baseMenuItems = [
  { icon: LayoutDashboard, label: "Home", path: "/client/home" },
  { icon: FileText, label: "Documents", path: "/client/documents" },
  { icon: Library, label: "Resource Hub", path: "/client/resource-hub" },
  { icon: Calendar, label: "Calendar", path: "/client/calendar" },
  { icon: Bell, label: "Notifications", path: "/client/notifications" },
  { icon: BarChart3, label: "Reports", path: "/client/reports" },
];

// Client menus - NO EOS access (EOS is Vivacity-only)
const userMenuItems = {
  main: [...baseMenuItems],
};

const adminMenuItems = {
  main: [...baseMenuItems],
  team: [{ icon: Users, label: "Manage Team", path: "/team-settings" }],
};

export const DashboardLayout = ({
  children
}: {
  children: React.ReactNode;
}) => {
  // How the menu starts is a setting (the pin in its header). Opening or closing it while you work lasts for this visit only.
  const [defaultOpen, setDefaultOpenState] = useState<boolean>(() => readStaffSidebarDefault());
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(defaultOpen);
  const setDefaultOpen = useCallback((open: boolean) => {
    setDefaultOpenState(open);
    writeStaffSidebarDefault(open);
  }, []);
  const [showScrollIndicator, setShowScrollIndicator] = useState(false);
  const [showScrollUpIndicator, setShowScrollUpIndicator] = useState(false);
  const [sectionsOpen, setSectionsOpen] = useState({
    work: false,
    clients: false,
    eos: false,
    resourceManagement: false,
    administration: false,
    academyBuilder: false,
    systemConfig: false,
    strategicIntelligence: false,
    // Legacy for client view
    main: false,
    team: false,
  });
  const location = useLocation();
  const { profile } = useAuth();
  const { canAccessAdmin, canAccessAdvanced, isSuperAdmin } = useRBAC();
  const { isViewingAsClient } = useViewMode();
  const navRef = useRef<HTMLElement>(null);
  
  
  // Profile setup reminder for Vivacity Team
  const {
    showModal: showProfileSetupModal,
    setShowModal: setShowProfileSetupModal,
    missingFields,
    handleSnooze,
    handleDismiss,
    logSettingsOpened,
    getBestTab,
  } = useProfileSetupReminder();
  const teamUnreadCount = useTeamUnreadCount();
  const myAssignedConvosCount = useMyAssignedConversationsCount();
  const supportTicketsCount = useSupportTicketsBadge();

  // Determine user role
  const userRole = profile?.unicorn_role || "User";
  const isVivacityTeam = isVivacityStaffRole(userRole);
  const isTeamLeader = userRole === "Team Leader";
  const isTeamMember = userRole === "Team Member";
  const isIntegrator = userRole === "Integrator";
  const isCSC = userRole === "CSC";

  // Scroll active menu item into view immediately on route changes
  useLayoutEffect(() => {
    if (navRef.current) {
      const activeItem = navRef.current.querySelector('[data-active="true"]');
      if (activeItem) {
        requestAnimationFrame(() => {
          activeItem.scrollIntoView({ block: 'center', behavior: 'instant' });
        });
      }
    }
  }, [location.pathname]);

  // Check if nav content is scrollable
  const checkScrollable = (e: React.UIEvent<HTMLElement>) => {
    const element = e.currentTarget;
    const hasScroll = element.scrollHeight > element.clientHeight;
    const isAtBottom = element.scrollHeight - element.scrollTop <= element.clientHeight + 10;
    const isAtTop = element.scrollTop <= 10;
    setShowScrollIndicator(hasScroll && !isAtBottom);
    setShowScrollUpIndicator(hasScroll && !isAtTop);
  };

  // Determine if we should show Vivacity Team menu or Client menu
  const showVivacityMenu = isVivacityTeam && !isViewingAsClient;

  // The staff menu: same groups and pages, same order, filtered by role (see staffMenu.ts).
  const staffSections = useMemo(
    () =>
      buildStaffSections({
        userRole,
        isSuperAdmin,
        isTeamLeader,
        isIntegrator,
        isCSC,
        isVivacityTeam,
        teamUnreadCount,
        myAssignedConvosCount,
        supportTicketsCount,
      }),
    [userRole, isSuperAdmin, isTeamLeader, isIntegrator, isCSC, isVivacityTeam, teamUnreadCount, myAssignedConvosCount, supportTicketsCount],
  );

  // Legacy menu items for client view
  const clientMenuItems = useMemo(() => {
    if (userRole === "Admin") return adminMenuItems;
    return userMenuItems;
  }, [userRole]);

  // Render menu link
  const renderMenuItem = (item: { icon: LucideIcon; label: string; path: string; badge?: number }) => {
    const Icon = item.icon;
    const isActive = location.pathname === item.path;

    if (showVivacityMenu) {
      // Vivacity team: keep gradient sidebar with white text
      return (
        <Link
          key={item.path}
          to={item.path}
          data-active={isActive}
          className={`flex items-center gap-2 px-4 mx-2 mb-1 transition-colors text-sm rounded-full min-h-[44px] ${
            isActive
              ? "bg-white/10 border border-white/20 text-white"
              : "text-white/80 hover:bg-white/10 hover:text-white"
          }`}
          style={{ paddingTop: "10px", paddingBottom: "10px" }}
        >
          <Icon className="w-4 h-4 flex-shrink-0" />
          {sidebarOpen && (
            <span className="font-medium leading-snug break-words hyphens-auto">
              {item.label}
            </span>
          )}
          {sidebarOpen && item.badge > 0 && (
            <span className="ml-auto text-[10px] font-bold bg-[#ED1878] text-white rounded-full px-1.5 py-0.5 min-w-[18px] text-center leading-none">
              {item.badge > 99 ? "99+" : item.badge}
            </span>
          )}
        </Link>
      );
    }

    // Client view: white sidebar with brand-colored text
    return (
      <Link
        key={item.path}
        to={item.path}
        data-active={isActive}
        className={`flex items-center gap-2 px-4 mx-2 mb-1 transition-colors text-sm rounded-full min-h-[44px] ${
          isActive
            ? "bg-muted/40 border border-border text-brand-fuchsia"
            : "text-foreground hover:bg-muted/30 hover:text-brand-fuchsia"
        }`}
        style={{ paddingTop: "10px", paddingBottom: "10px" }}
      >
        <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? "text-brand-fuchsia" : "text-secondary"}`} />
        {sidebarOpen && (
          <span className="font-medium leading-snug break-words hyphens-auto">
            {item.label}
          </span>
        )}
        {sidebarOpen && item.badge > 0 && (
          <span className="ml-auto text-[10px] font-bold bg-[#ED1878] text-white rounded-full px-1.5 py-0.5 min-w-[18px] text-center leading-none">
            {item.badge > 99 ? "99+" : item.badge}
          </span>
        )}
      </Link>
    );
  };

  return (
    <HelpCenterProvider>
    <div className="min-h-screen bg-background overflow-x-clip">
      {/* Mobile sidebar toggle - visible only on mobile when sidebar is closed */}
      <button
        onClick={() => setSidebarOpen(true)}
        className={`fixed top-4 left-4 z-40 p-2 rounded-lg bg-primary text-primary-foreground shadow-lg md:hidden ${sidebarOpen ? 'hidden' : 'flex'} items-center justify-center min-w-[44px] min-h-[44px]`}
        aria-label="Open sidebar"
      >
        <Menu className="w-5 h-5" />
      </button>
      
      {/* Sidebar Overlay - mobile only */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}
      
      {/* Sidebar */}
      <aside
        className={cn(
          // Base styles
          "sidebar-motion flex flex-col fixed left-0 top-0 h-screen z-30",
          // Responsive width
          sidebarOpen ? "w-60" : "w-16",
          // Mobile: slide in/out, hidden by default
          "max-md:translate-x-0 max-md:w-[85vw] max-md:max-w-72",
          !sidebarOpen && "max-md:-translate-x-full",
          // White-first for client, gradient for Vivacity team
          showVivacityMenu
            ? "overflow-hidden"
            : "bg-card border-r border-border"
        )}
        style={showVivacityMenu ? { background: SIDEBAR_GRADIENT } : undefined}
      >
        {showVivacityMenu ? (
          <StaffSidebar
            sidebarOpen={sidebarOpen}
            setSidebarOpen={setSidebarOpen}
            sections={staffSections}
            pathname={location.pathname}
            roleName={roleLabel(userRole)}
            isViewingAsClient={isViewingAsClient}
            defaultOpen={defaultOpen}
            setDefaultOpen={setDefaultOpen}
          />
        ) : (
        <>
        {/* Sidebar Header */}
        {sidebarOpen ? (
          <div className={`relative px-3 pt-0 pb-4 border-b ${showVivacityMenu ? "border-white/10" : "border-border"}`}>
            {/* Top bar with version and close button */}
            <div className="flex items-center justify-between pt-3">
              <div className={`flex items-center gap-1.5 text-xs ${showVivacityMenu ? "text-white/60" : "text-secondary/60"}`}>
                <Sparkles className="h-3 w-3" />
                <span>Version 2.0</span>
              </div>
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                aria-label="Collapse sidebar"
                className={`p-1.5 rounded-full transition-all duration-200 ${
                  showVivacityMenu
                    ? "hover:bg-white/10 text-white/50 hover:text-white"
                    : "hover:bg-muted/30 text-secondary/50 hover:text-secondary"
                }`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* View mode indicator - only when viewing as client */}
            {isViewingAsClient && (
              <div className="mt-4 flex justify-center">
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted border border-border">
                  <span className="h-1.5 w-1.5 rounded-full bg-brand-fuchsia animate-pulse" />
                  <span className="text-xs font-medium text-secondary uppercase tracking-wide">
                    Client View
                  </span>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className={`h-16 flex items-center justify-between px-4 border-b ${showVivacityMenu ? "border-white/20" : "border-border"}`}>
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              aria-label="Expand sidebar"
              className={`p-2 rounded-lg transition-colors ${showVivacityMenu ? "hover:bg-white/10 text-white" : "hover:bg-muted/30 text-secondary"}`}
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Menu Items */}
        <nav
          ref={navRef}
          className="flex-1 py-4 overflow-y-auto scrollbar-hide relative"
          onScroll={checkScrollable}
        >
          {/* Scroll Up Indicator */}
          {showScrollUpIndicator && (
            <div className="sticky top-0 left-1/2 w-5 -translate-x-1/2 pointer-events-none animate-bounce z-10">
              <ChevronUp className={`w-5 h-5 ${showVivacityMenu ? "text-white/60" : "text-secondary/40"}`} />
            </div>
          )}
          {(
            <>
              {/* Client Menu - for Admin/User roles or when viewing as client */}
              <Collapsible
                open={sectionsOpen.main}
                onOpenChange={(open) =>
                  setSectionsOpen((prev) => ({ ...prev, main: open }))
                }
              >
                {sidebarOpen && (
                  <CollapsibleTrigger className="flex items-center justify-between w-full px-4 mb-2 hover:bg-muted/20 py-2 rounded transition-colors">
                    <p className="text-xs font-semibold text-secondary uppercase tracking-wider">
                      Main
                    </p>
                    {sectionsOpen.main ? (
                      <ChevronDown className="w-3 h-3 text-secondary/50" />
                    ) : (
                      <ChevronRight className="w-3 h-3 text-secondary/50" />
                    )}
                  </CollapsibleTrigger>
                )}
                <CollapsibleContent>
                  {clientMenuItems.main.map(renderMenuItem)}
                </CollapsibleContent>
              </Collapsible>

              {/* Team Section for Client Admins */}
              {"team" in clientMenuItems &&
                Array.isArray(clientMenuItems.team) &&
                clientMenuItems.team.length > 0 && (
                  <Collapsible
                    open={sectionsOpen.team}
                    onOpenChange={(open) =>
                      setSectionsOpen((prev) => ({ ...prev, team: open }))
                    }
                    className="mt-6"
                  >
                    {sidebarOpen && (
                      <CollapsibleTrigger className="flex items-center justify-between w-full px-4 mb-2 hover:bg-muted/20 py-2 rounded transition-colors">
                        <p className="text-xs font-semibold text-secondary uppercase tracking-wider">
                          Manage Team
                        </p>
                        {sectionsOpen.team ? (
                          <ChevronDown className="w-3 h-3 text-secondary/50" />
                        ) : (
                          <ChevronRight className="w-3 h-3 text-secondary/50" />
                        )}
                      </CollapsibleTrigger>
                    )}
                    <CollapsibleContent>
                      {clientMenuItems.team.map(renderMenuItem)}
                    </CollapsibleContent>
                  </Collapsible>
                )}
            </>
          )}
        </nav>

        {/* Scroll Indicator */}
        {showScrollIndicator && (
          <div className="absolute bottom-20 left-1/2 transform -translate-x-1/2 pointer-events-none animate-bounce">
            <ChevronDown className={`w-5 h-5 ${showVivacityMenu ? "text-white/60" : "text-secondary/40"}`} />
          </div>
        )}

        {/* Bottom spacing */}
        <div className="pb-4" />
        </>
        )}
      </aside>

      {/* Main Content */}
      <div
        className={cn(
          // Critical layout contract: flex-1 w-full min-w-0 for proper content sizing
          "sidebar-content-motion flex flex-col min-h-screen w-full min-w-0 overflow-x-clip",
          // Use padding-left (not margin-left) because sidebar is fixed; prevents content shifting off-canvas
          sidebarOpen ? "md:pl-60" : "md:pl-16",
          // Mobile: no padding, full width
          "pl-0"
        )}
      >
        {/* Top Bar */}
        <TopBar />

        {/* Time Inbox Banner */}
        <TimeInboxBanner />

        {showVivacityMenu && <StaffLiveNotificationBanner />}

        {/* Page Content - w-full min-w-0 prevents content collapse */}
        <main className="flex-1 w-full min-w-0 p-4 md:p-6 pb-32 md:pb-20 overflow-y-auto">{children}</main>

        {/* Footer: pinned to the bottom of the window so it stays in view whatever the scroll position.
            Offset by the sidebar width so it sits beside the sidebar, as the content does. */}
        <div
          className={cn(
            // z-20 keeps the footer below the mobile sidebar (z-30), which opens over it.
            "sidebar-content-motion fixed bottom-0 left-0 right-0 z-20 shadow-[0_-4px_12px_-4px_rgba(0,0,0,0.25)]",
            sidebarOpen ? "md:left-60" : "md:left-16"
          )}
        >
          {showVivacityMenu ? <UtilityFooter /> : <ClientFooter />}
        </div>

        {/* Ask Viv - Knowledge Assistant (SuperAdmin only) */}
        <AskVivPanel />
        {/* The messenger bubble for Vivacity staff (bottom right): Ask Viv, and the conversations that are yours by the routing. */}
        <StaffMessengerDock />
        {showVivacityMenu && <StaffGoToSearch sections={staffSections} />}
        <ScrollToTopButton />

      </div>

      {/* Profile Setup Reminder Modal */}
      <ProfileSetupReminderModal
        open={showProfileSetupModal}
        onOpenChange={setShowProfileSetupModal}
        missingFields={missingFields}
        onSnooze={handleSnooze}
        onDismiss={handleDismiss}
        onGoToSettings={logSettingsOpened}
        bestTab={getBestTab()}
      />

      {showVivacityMenu && <StaffNotificationReview />}
    </div>
    </HelpCenterProvider>
  );
};
