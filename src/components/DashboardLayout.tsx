import { useState, useMemo, useRef, useLayoutEffect } from "react";
import { LayoutDashboard, FileText, BarChart3, Calendar, Menu, X, Users, Building2, Package2, Blocks, ScrollText, Flag, ChevronDown, ChevronRight, Target, TrendingUp, ListTodo, Lightbulb, Sparkles, Library, CheckSquare, ClipboardList, Search, Video, BookOpen, ShieldCheck, Shield, Briefcase, Inbox, Rocket, Bot, Cog, Mail, Puzzle, Bell, MapPin } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useRBAC } from "@/hooks/useRBAC";
import { useViewMode } from "@/contexts/ViewModeContext";
import { TopBar } from "@/components/layout/TopBar";
import { UtilityFooter } from "@/components/layout/UtilityFooter";
import { ClientFooter } from "@/components/client/ClientFooter";
import { TimeInboxBanner } from "@/components/dashboard/TimeInboxWidget";
import { FacilitatorModeBanner } from "@/components/eos/FacilitatorModeBanner";
import { AskVivPanel, AskVivFloatingLauncher } from "@/components/ask-viv";
import { HelpCenterProvider, HelpCenterDrawer } from "@/components/help-center";
import { useProfileSetupReminder } from "@/hooks/useProfileSetupReminder";
import { ProfileSetupReminderModal } from "@/components/profile/ProfileSetupReminderModal";
import { cn } from "@/lib/utils";

// ============================================================
// VIVACITY TEAM SIDEBAR - FINAL AUTHORITY MODEL
// ============================================================

// 1. WORK Section - All Vivacity Team Roles
const workMenuItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
  { icon: BarChart3, label: "Executive Dashboard", path: "/executive", leadershipOnly: true },
  { icon: Briefcase, label: "My Work", path: "/my-work" },
  { icon: ListTodo, label: "Tasks", path: "/tasks" },
  { icon: Inbox, label: "Time Inbox", path: "/time-inbox" },
  { icon: Calendar, label: "My Calendar", path: "/work/calendar" },
  { icon: Video, label: "Meetings", path: "/work/meetings" },
  { icon: Calendar, label: "Event Calendar", path: "/calendar" },
];

// 2. CLIENTS Section - All Vivacity Team Roles
const clientsMenuItems = [
  { icon: Building2, label: "Clients", path: "/manage-tenants" },
  { icon: Package2, label: "Packages", path: "/manage-packages" },
  { icon: FileText, label: "Documents", path: "/manage-documents" },
  { icon: Lightbulb, label: "RTO Tips", path: "/rto-tips" },
];

// 3. EOS Section - Role-Aware Visibility
// Super Admin & Team Leader: full access
// Team Member: hide Leadership Dashboard, Accountability Chart
const eosMenuItems = [
  { icon: Target, label: "EOS Overview", path: "/eos" },
  { icon: ShieldCheck, label: "Leadership Dashboard", path: "/eos/leadership", leadershipOnly: true },
  { icon: BarChart3, label: "Scorecard", path: "/eos/scorecard" },
  { icon: Flag, label: "Mission Control", path: "/eos/vto" },
  { icon: TrendingUp, label: "Rocks", path: "/eos/rocks" },
  { icon: Rocket, label: "Flight Plan", path: "/eos/flight-plan" },
  { icon: Shield, label: "Risks & Opportunities", path: "/eos/risks-opportunities" },
  { icon: ListTodo, label: "To-Dos", path: "/eos/todos" },
  { icon: Calendar, label: "Meetings", path: "/eos/meetings" },
  { icon: Users, label: "Quarterly Conversations", path: "/eos/qc" },
  { icon: Briefcase, label: "Accountability Chart", path: "/eos/accountability", leadershipOnly: true },
  { icon: TrendingUp, label: "GWC Trends", path: "/eos/gwc-trends" },
  { icon: Target, label: "Rock Analysis", path: "/eos/rock-analysis" },
  { icon: BarChart3, label: "Client Impact", path: "/eos/client-impact" },
  { icon: FileText, label: "Processes", path: "/processes" },
];

// 4. RESOURCE MANAGEMENT Section - Super Admin & Team Leader only
// Admin-style management views, not browsing
const resourceManagementMenuItems = [
  { icon: Library, label: "Content Dashboard", path: "/resource-hub" },
  { icon: FileText, label: "Templates Manager", path: "/resource-hub/templates" },
  { icon: CheckSquare, label: "Checklists Manager", path: "/resource-hub/checklists" },
  { icon: ClipboardList, label: "Registers & Forms Manager", path: "/resource-hub/registers-forms" },
  { icon: Search, label: "Audit & Evidence Library", path: "/resource-hub/audit-evidence" },
  { icon: Video, label: "Training & Webinar Library", path: "/resource-hub/training-webinars" },
  { icon: BookOpen, label: "Guides & How-To Library", path: "/resource-hub/guides-howto" },
  { icon: TrendingUp, label: "CI Tools Library", path: "/resource-hub/ci-tools" },
  { icon: ScrollText, label: "Updates Log Manager", path: "/resource-hub/updates" },
];

// 5. ADMINISTRATION Section
// Super Admin: full access
// Team Leader: read-only access to Team Users and Tenant Users
// Team Member: hidden
const administrationMenuItems = [
  { icon: Shield, label: "Team Users", path: "/admin/team-users" },
  { icon: Building2, label: "Tenant Users", path: "/admin/tenant-users" },
  { icon: Mail, label: "Manage Invites", path: "/manage-invites", superAdminOnly: true },
  { icon: ShieldCheck, label: "User Audit", path: "/admin/user-audit", superAdminOnly: true },
  { icon: ScrollText, label: "Audit Logs", path: "/audit-logs", superAdminOnly: true },
  { icon: Mail, label: "Email Templates", path: "/admin/email-templates", superAdminOnly: true },
];

// 6. SYSTEM CONFIG Section - Super Admin Only
const systemConfigMenuItems = [
  { icon: Package2, label: "Manage Packages", path: "/admin/manage-packages" },
  { icon: Blocks, label: "Manage Phases", path: "/admin/stages" },
  { icon: Sparkles, label: "Phase Builder", path: "/admin/stage-builder" },
  { icon: BarChart3, label: "Phase Analytics", path: "/admin/stage-analytics" },
  { icon: Cog, label: "EOS Processes", path: "/admin/eos-processes" },
  { icon: Library, label: "Knowledge Library", path: "/admin/knowledge" },
  { icon: Bot, label: "AI Assistant", path: "/admin/assistant" },
  { icon: Puzzle, label: "Add-in Settings", path: "/admin/addin-settings" },
  { icon: MapPin, label: "ClickUp Mapping", path: "/admin/clickup-mapping" },
];

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
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showScrollIndicator, setShowScrollIndicator] = useState(false);
  const [sectionsOpen, setSectionsOpen] = useState({
    work: false,
    clients: false,
    eos: false,
    resourceManagement: false,
    administration: false,
    systemConfig: false,
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

  // Determine user role
  const userRole = profile?.unicorn_role || "User";
  const isVivacityTeam = ["Super Admin", "Team Leader", "Team Member"].includes(userRole);
  const isTeamLeader = userRole === "Team Leader";
  const isTeamMember = userRole === "Team Member";

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
    setShowScrollIndicator(hasScroll && !isAtBottom);
  };

  // Determine if we should show Vivacity Team menu or Client menu
  const showVivacityMenu = isVivacityTeam && !isViewingAsClient;

  // Filter EOS items based on role
  const filteredEosItems = useMemo(() => {
    return eosMenuItems.filter(item => {
      if (item.leadershipOnly) {
        // Only Super Admin and Team Leader can see leadership-only items
        return isSuperAdmin || isTeamLeader;
      }
      return true;
    });
  }, [isSuperAdmin, isTeamLeader]);

  // Filter Work items based on role
  const filteredWorkItems = useMemo(() => {
    return workMenuItems.filter(item => {
      if ((item as any).leadershipOnly) {
        return isSuperAdmin || isTeamLeader;
      }
      return true;
    });
  }, [isSuperAdmin, isTeamLeader]);

  // Filter Administration items based on role
  const filteredAdminItems = useMemo(() => {
    return administrationMenuItems.filter(item => {
      if (item.superAdminOnly) {
        return isSuperAdmin;
      }
      return true;
    });
  }, [isSuperAdmin]);

  // Legacy menu items for client view
  const clientMenuItems = useMemo(() => {
    if (userRole === "Admin") return adminMenuItems;
    return userMenuItems;
  }, [userRole]);

  // Render menu link
  const renderMenuItem = (item: { icon: any; label: string; path: string }) => {
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
      </Link>
    );
  };

  // Render section with collapsible header
  const renderSection = (
    key: string,
    title: string,
    items: { icon: any; label: string; path: string }[],
    sectionKey: keyof typeof sectionsOpen
  ) => {
    if (items.length === 0) return null;

    return (
      <Collapsible
        open={sectionsOpen[sectionKey]}
        onOpenChange={(open) =>
          setSectionsOpen((prev) => ({ ...prev, [sectionKey]: open }))
        }
        className="mt-6"
      >
        {sidebarOpen && (
          <CollapsibleTrigger className={`flex items-center justify-between w-full px-4 mb-2 py-2 rounded transition-colors ${
            showVivacityMenu ? "hover:bg-white/5" : "hover:bg-muted/20"
          }`}>
            <p className={`text-xs font-semibold uppercase tracking-wider ${
              showVivacityMenu ? "text-white/70" : "text-secondary"
            }`}>
              {title}
            </p>
            {sectionsOpen[sectionKey] ? (
              <ChevronDown className={`w-3 h-3 ${showVivacityMenu ? "text-white/70" : "text-secondary/50"}`} />
            ) : (
              <ChevronRight className={`w-3 h-3 ${showVivacityMenu ? "text-white/70" : "text-secondary/50"}`} />
            )}
          </CollapsibleTrigger>
        )}
        <CollapsibleContent>{items.map(renderMenuItem)}</CollapsibleContent>
      </Collapsible>
    );
  };

  return (
    <HelpCenterProvider>
    <div className="min-h-screen bg-background overflow-x-hidden">
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
          "transition-all duration-300 flex flex-col fixed left-0 top-0 h-screen z-30",
          // Responsive width
          sidebarOpen ? "w-64" : "w-20",
          // Mobile: slide in/out, hidden by default
          "max-md:translate-x-0 max-md:w-[85vw] max-md:max-w-72",
          !sidebarOpen && "max-md:-translate-x-full",
          // White-first for client, gradient for Vivacity team
          showVivacityMenu
            ? "border-r border-border/20"
            : "bg-card border-r border-border"
        )}
        style={showVivacityMenu ? {
          backgroundImage: "linear-gradient(135deg, rgb(97 9 161) 0%, rgb(213 28 73) 100%)",
        } : undefined}
      >
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
          {showVivacityMenu ? (
            <>
              {/* 1. WORK Section - All Vivacity Team */}
              <Collapsible
                open={sectionsOpen.work}
                onOpenChange={(open) =>
                  setSectionsOpen((prev) => ({ ...prev, work: open }))
                }
              >
                {sidebarOpen && (
                  <CollapsibleTrigger className={`flex items-center justify-between w-full px-4 mb-2 py-2 rounded transition-colors ${
                    showVivacityMenu ? "hover:bg-white/5" : "hover:bg-muted/20"
                  }`}>
                    <p className={`text-xs font-semibold uppercase tracking-wider ${
                      showVivacityMenu ? "text-white/70" : "text-secondary"
                    }`}>
                      Work
                    </p>
                    {sectionsOpen.work ? (
                      <ChevronDown className={`w-3 h-3 ${showVivacityMenu ? "text-white/70" : "text-secondary/50"}`} />
                    ) : (
                      <ChevronRight className={`w-3 h-3 ${showVivacityMenu ? "text-white/70" : "text-secondary/50"}`} />
                    )}
                  </CollapsibleTrigger>
                )}
                <CollapsibleContent>
                  {filteredWorkItems.map(renderMenuItem)}
                </CollapsibleContent>
              </Collapsible>

              {/* 2. CLIENTS Section - All Vivacity Team */}
              {renderSection("clients", "Clients", clientsMenuItems, "clients")}

              {/* 3. EOS Section - Role-Aware */}
              {renderSection("eos", "EOS", filteredEosItems, "eos")}

              {/* 4. RESOURCE MANAGEMENT Section - Super Admin & Team Leader only */}
              {(isSuperAdmin || isTeamLeader) &&
                renderSection(
                  "resourceManagement",
                  "Resource Management",
                  resourceManagementMenuItems,
                  "resourceManagement"
                )}

              {/* 5. ADMINISTRATION Section - Super Admin full, Team Leader partial */}
              {(isSuperAdmin || isTeamLeader) &&
                renderSection(
                  "administration",
                  "Administration",
                  filteredAdminItems,
                  "administration"
                )}

              {/* 6. SYSTEM CONFIG Section - Super Admin Only */}
              {isSuperAdmin &&
                renderSection(
                  "systemConfig",
                  "System Config",
                  systemConfigMenuItems,
                  "systemConfig"
                )}
            </>
          ) : (
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
      </aside>

      {/* Main Content */}
      <div
        className={cn(
          // Critical layout contract: flex-1 w-full min-w-0 for proper content sizing
          "flex flex-col min-h-screen w-full min-w-0 transition-all duration-300 overflow-x-hidden",
          // Use padding-left (not margin-left) because sidebar is fixed; prevents content shifting off-canvas
          sidebarOpen ? "md:pl-64" : "md:pl-20",
          // Mobile: no padding, full width
          "pl-0"
        )}
      >
        {/* Top Bar */}
        <TopBar />

        {/* Facilitator Mode Banner */}
        <FacilitatorModeBanner />

        {/* Time Inbox Banner */}
        <TimeInboxBanner />

        {/* Page Content - w-full min-w-0 prevents content collapse */}
        <main className="flex-1 w-full min-w-0 p-4 md:p-6 overflow-y-auto">{children}</main>

        {/* Footer: Client footer for client view, Utility footer for Vivacity team */}
        {showVivacityMenu ? <UtilityFooter /> : <ClientFooter />}

        {/* Ask Viv - Knowledge Assistant (SuperAdmin only) */}
        <AskVivPanel />
        <AskVivFloatingLauncher />

        {/* Help Center Drawer (available for client roles) */}
        <HelpCenterDrawer />
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
    </div>
    </HelpCenterProvider>
  );
};
