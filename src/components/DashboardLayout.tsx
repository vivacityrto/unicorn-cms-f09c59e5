import { useState, useMemo, useRef, useEffect, useLayoutEffect } from "react";
import { LayoutDashboard, FileText, BarChart3, Calendar, LogOut, Menu, X, Users, Building2, Package2, Wrench, FileCode, Blocks, ScrollText, Flag, AlertTriangle, Heart, ChevronDown, ChevronRight, Bell, Target, TrendingUp, ListTodo, User, Mail, ClipboardCheck, Lightbulb, Home, Sparkles, Library, CheckSquare, ClipboardList, Search, Video, BookOpen, Clock, ShieldCheck, Shield, Briefcase, Inbox, Rocket, Bot, Cog, Settings } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useRBAC } from "@/hooks/useRBAC";
import { useViewMode } from "@/contexts/ViewModeContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { NotificationDropdown } from "@/components/NotificationDropdown";
import unicornLogo from "@/assets/unicorn-logo-login.svg";
import Footer from "@/components/layout/Footer";
import { TimeInboxBanner } from "@/components/dashboard/TimeInboxWidget";
import { FacilitatorModeToggle } from "@/components/eos/FacilitatorModeToggle";
import { FacilitatorModeBanner } from "@/components/eos/FacilitatorModeBanner";
import { AIChatbot } from "@/components/admin/AIChatbot";

// ============================================================
// VIVACITY TEAM SIDEBAR - FINAL AUTHORITY MODEL
// ============================================================

// 1. WORK Section - All Vivacity Team Roles
const workMenuItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
  { icon: Briefcase, label: "My Work", path: "/my-work" },
  { icon: ListTodo, label: "Tasks", path: "/tasks" },
  { icon: Inbox, label: "Time Inbox", path: "/time-inbox" },
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
];

// Client-facing menu items (for Admin/User roles and "View as Client" mode)
const baseMenuItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
  { icon: FileText, label: "Documents", path: "/manage-documents" },
  { icon: BarChart3, label: "Reports", path: "/reports" },
  { icon: Calendar, label: "Event Calendar", path: "/calendar" },
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
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const { canAccessAdmin, canAccessAdvanced, isSuperAdmin } = useRBAC();
  const { isViewingAsClient } = useViewMode();
  const navRef = useRef<HTMLElement>(null);
  const [currentTime, setCurrentTime] = useState<string>('');

  // Determine user role
  const userRole = profile?.unicorn_role || "User";
  const isVivacityTeam = ["Super Admin", "Team Leader", "Team Member"].includes(userRole);
  const isTeamLeader = userRole === "Team Leader";
  const isTeamMember = userRole === "Team Member";

  // Real-time Australian clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const australianTime = now.toLocaleString('en-AU', {
        timeZone: 'Australia/Sydney',
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      });
      setCurrentTime(australianTime);
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

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

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case "Super Admin":
        return "#7130A0";
      case "Admin":
        return "#00B0F0";
      default:
        return "#6B7280";
    }
  };

  const getInitials = (email: string) => {
    return email.split("@")[0].substring(0, 2).toUpperCase();
  };

  // Render menu link
  const renderMenuItem = (item: { icon: any; label: string; path: string }) => {
    const Icon = item.icon;
    const isActive = location.pathname === item.path;
    return (
      <Link
        key={item.path}
        to={item.path}
        data-active={isActive}
        className={`flex items-center gap-2 px-4 mx-2 mb-1 transition-colors text-sm rounded-full ${
          isActive
            ? "bg-white/10 border border-white/20 text-white"
            : "text-white/80 hover:bg-white/10 hover:text-white"
        }`}
        style={{ paddingTop: "10px", paddingBottom: "10px" }}
      >
        <Icon className="w-4 h-4 flex-shrink-0" />
        {sidebarOpen && <span className="font-medium">{item.label}</span>}
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
          <CollapsibleTrigger className="flex items-center justify-between w-full px-4 mb-2 hover:bg-white/5 py-2 rounded transition-colors">
            <p className="text-xs font-semibold text-white/70 uppercase tracking-wider">
              {title}
            </p>
            {sectionsOpen[sectionKey] ? (
              <ChevronDown className="w-3 h-3 text-white/70" />
            ) : (
              <ChevronRight className="w-3 h-3 text-white/70" />
            )}
          </CollapsibleTrigger>
        )}
        <CollapsibleContent>{items.map(renderMenuItem)}</CollapsibleContent>
      </Collapsible>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar */}
      <aside
        className={`${sidebarOpen ? "w-64" : "w-20"} border-r border-border/20 transition-all duration-300 flex flex-col fixed left-0 top-0 h-screen z-30`}
        style={{
          backgroundImage: "linear-gradient(135deg, rgb(97 9 161) 0%, rgb(213 28 73) 100%)",
        }}
      >
        {/* Logo/Brand or User Profile */}
        {sidebarOpen ? (
          <div className="relative px-3 pt-0 pb-6 border-b border-white/10">
            {/* Top bar with version and close button */}
            <div className="flex items-center justify-between pt-3">
              <div className="flex items-center gap-1.5 text-white/60 text-xs">
                <Sparkles className="h-3 w-3" />
                <span>Version 2.0</span>
              </div>
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="p-1.5 hover:bg-white/10 rounded-full transition-all duration-200 text-white/50 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Glass card container */}
            <div className="mt-6">
              {/* Avatar section */}
              <div className="flex flex-col items-center">
                <div className="relative group">
                  {/* Animated ring */}
                  <div className="absolute -inset-1 rounded-full bg-gradient-to-r from-pink-500 via-purple-500 to-cyan-500 opacity-75 blur-sm group-hover:opacity-100 transition-opacity duration-300"></div>
                  <div className="relative h-20 w-20 rounded-full p-[3px] bg-gradient-to-br from-pink-500 via-purple-400 to-cyan-400">
                    <Avatar className="h-full w-full border-2 border-white/90 shadow-inner">
                      <AvatarImage
                        src={profile?.avatar_url || ""}
                        alt={profile?.first_name || "User"}
                        className="object-cover"
                      />
                      <AvatarFallback className="bg-gradient-to-br from-slate-100 to-slate-200 text-slate-600 font-semibold text-xl">
                        {profile?.first_name && profile?.last_name
                          ? `${profile.first_name[0]}${profile.last_name[0]}`.toUpperCase()
                          : getInitials(profile?.email || "U")}
                      </AvatarFallback>
                    </Avatar>
                  </div>
                  {/* Online indicator */}
                  <span className="absolute bottom-0.5 right-0.5 h-4 w-4 bg-emerald-400 rounded-full border-[3px] border-white shadow-md"></span>
                </div>

                {/* User info */}
                <div className="mt-4 text-center space-y-2">
                  <h3 className="text-lg font-semibold text-white tracking-tight">
                    {profile?.first_name && profile?.last_name
                      ? `${profile.first_name} ${profile.last_name}`
                      : profile?.email?.split("@")[0] || "User"}
                  </h3>

                  {/* Role badge - modern pill style */}
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 border border-white/20">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        isViewingAsClient ? "bg-purple-400" : "bg-emerald-400"
                      } animate-pulse`}
                    ></span>
                    <span className="text-xs font-medium text-white/90 uppercase tracking-wide">
                      {isViewingAsClient ? "Client View" : profile?.unicorn_role || "User"}
                    </span>
                  </div>

                  {/* View as Client indicator */}
                  {isViewingAsClient && (
                    <div className="mt-2 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-purple-500/20 border border-purple-400/30">
                      <span className="text-[10px] font-medium text-purple-200">
                        Viewing as Admin
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* User email */}
              <div className="mt-4 pt-4 border-t border-white/10 flex justify-center">
                <div className="flex items-center gap-2 text-white/60 text-xs">
                  <Mail className="h-3.5 w-3.5" />
                  <span className="truncate max-w-[180px]">{profile?.email || ""}</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="h-16 flex items-center justify-between px-4 border-b border-white/20">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors text-white"
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
                  <CollapsibleTrigger className="flex items-center justify-between w-full px-4 mb-2 hover:bg-white/5 py-2 rounded transition-colors">
                    <p className="text-xs font-semibold text-white/70 uppercase tracking-wider">
                      Work
                    </p>
                    {sectionsOpen.work ? (
                      <ChevronDown className="w-3 h-3 text-white/70" />
                    ) : (
                      <ChevronRight className="w-3 h-3 text-white/70" />
                    )}
                  </CollapsibleTrigger>
                )}
                <CollapsibleContent>
                  {workMenuItems.map(renderMenuItem)}
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
                  <CollapsibleTrigger className="flex items-center justify-between w-full px-4 mb-2 hover:bg-white/5 py-2 rounded transition-colors">
                    <p className="text-xs font-semibold text-white/70 uppercase tracking-wider">
                      Main
                    </p>
                    {sectionsOpen.main ? (
                      <ChevronDown className="w-3 h-3 text-white/70" />
                    ) : (
                      <ChevronRight className="w-3 h-3 text-white/70" />
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
                      <CollapsibleTrigger className="flex items-center justify-between w-full px-4 mb-2 hover:bg-white/5 py-2 rounded transition-colors">
                        <p className="text-xs font-semibold text-white/70 uppercase tracking-wider">
                          Manage Team
                        </p>
                        {sectionsOpen.team ? (
                          <ChevronDown className="w-3 h-3 text-white/70" />
                        ) : (
                          <ChevronRight className="w-3 h-3 text-white/70" />
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
            <ChevronDown className="w-5 h-5 text-white/60" />
          </div>
        )}

        {/* Bottom spacing */}
        <div className="pb-4" />
      </aside>

      {/* Main Content */}
      <div
        className={`${sidebarOpen ? "ml-64" : "ml-20"} flex flex-col min-h-screen transition-all duration-300`}
      >
        {/* Top Bar */}
        <header className="h-16 bg-card border-b border-border flex items-center justify-between px-6 sticky top-0 z-20">
          <div className="flex items-center gap-4">
            <img
              src={unicornLogo}
              alt="Unicorn 2.0"
              className="h-16"
              width="117"
              height="64"
              fetchPriority="high"
            />
          </div>

          <div className="flex items-center gap-4">
            {/* Facilitator Mode Toggle */}
            <FacilitatorModeToggle />

            {/* Notification Bell */}
            <NotificationDropdown />

            {/* User Menu with Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="group bg-white transition-all duration-200 hover:bg-white hover:scale-105 hover:shadow-md"
                  style={{
                    boxShadow:
                      "rgba(0, 0, 0, 0.02) 0px 1px 3px 0px, rgba(27, 31, 35, 0.15) 0px 0px 0px 1px",
                  }}
                >
                  <Settings className="h-5 w-5 text-foreground animate-[spin_3s_linear_infinite]" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <Link to="/settings?tab=security">
                  <DropdownMenuItem className="cursor-pointer">
                    <User className="mr-2 h-4 w-4" />
                    <span>My Profile</span>
                  </DropdownMenuItem>
                </Link>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="cursor-pointer text-destructive focus:text-destructive"
                  onClick={signOut}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Logout</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Facilitator Mode Banner */}
        <FacilitatorModeBanner />

        {/* Time Inbox Banner */}
        <TimeInboxBanner />

        {/* Page Content */}
        <main className="flex-1 p-6 overflow-y-auto">{children}</main>

        {/* Footer */}
        <Footer />

        {/* AI Chatbot - SuperAdmin only */}
        <AIChatbot />
      </div>
    </div>
  );
};
