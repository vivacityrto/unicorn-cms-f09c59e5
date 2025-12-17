import { useState, useMemo, useRef, useEffect, useLayoutEffect } from "react";
import {
  LayoutDashboard,
  FileText,
  BarChart3,
  Calendar,
  MessageSquare,
  Settings,
  LogOut,
  Menu,
  X,
  Users,
  Building2,
  Package2,
  Wrench,
  FileCode,
  Blocks,
  ScrollText,
  Flag,
  AlertTriangle,
  Heart,
  ChevronDown,
  ChevronRight,
  Bell,
  Target,
  TrendingUp,
  ListTodo,
  User,
  Mail,
  ClipboardCheck,
  Lightbulb,
  Home,
  Sparkles,
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useViewMode } from "@/contexts/ViewModeContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { NotificationDropdown } from "@/components/NotificationDropdown";
import unicornLogo from "@/assets/unicorn-logo-full.png";
import Footer from "@/components/layout/Footer";
const baseMenuItems = [
  {
    icon: LayoutDashboard,
    label: "Dashboard",
    path: "/dashboard",
  },
  {
    icon: FileText,
    label: "Documents",
    path: "/manage-documents",
  },
  {
    icon: BarChart3,
    label: "Reports",
    path: "/reports",
  },
  {
    icon: Calendar,
    label: "Calendar",
    path: "/calendar",
  },
  {
    icon: MessageSquare,
    label: "Message",
    path: "/messages",
  },
];
const baseMenuItemsWithoutDocs = [
  {
    icon: Package2,
    label: "Dashboard",
    path: "/manage-packages",
  },
  {
    icon: Building2,
    label: "Clients",
    path: "/manage-tenants",
  },
  {
    icon: Calendar,
    label: "Calendar",
    path: "/calendar",
  },
  {
    icon: FileText,
    label: "Documents",
    path: "/manage-documents",
  },
  {
    icon: ListTodo,
    label: "Tasks",
    path: "/tasks",
  },
  {
    icon: Lightbulb,
    label: "RTO Tips",
    path: "/rto-tips",
  },
];
const userMenuItems = {
  main: [...baseMenuItems],
};
const adminMenuItems = {
  main: [...baseMenuItems],
  team: [
    {
      icon: Users,
      label: "Manage Team",
      path: "/team-settings",
    },
  ],
};
const superAdminMenuItems = {
  main: [...baseMenuItemsWithoutDocs],
  admin: [
    {
      icon: Users,
      label: "Manage Users",
      path: "/manage-users",
    },
    {
      icon: Mail,
      label: "Manage Invites",
      path: "/manage-invites",
    },
    {
      icon: ClipboardCheck,
      label: "Manage Audits",
      path: "/audits",
    },
    {
      icon: Package2,
      label: "Manage Packages",
      path: "/admin/manage-packages",
    },
    {
      icon: Mail,
      label: "Manage Emails",
      path: "/admin/manage-emails",
    },
  ],
  eos: [
    {
      icon: Target,
      label: "EOS Overview",
      path: "/eos",
    },
    {
      icon: BarChart3,
      label: "Scorecard",
      path: "/eos/scorecard",
    },
    {
      icon: Flag,
      label: "V/TO",
      path: "/eos/vto",
    },
    {
      icon: TrendingUp,
      label: "Rocks",
      path: "/eos/rocks",
    },
    {
      icon: AlertTriangle,
      label: "Issues",
      path: "/eos/issues",
    },
    {
      icon: ListTodo,
      label: "To-Dos",
      path: "/eos/todos",
    },
    {
      icon: Calendar,
      label: "Meetings",
      path: "/eos/meetings",
    },
    {
      icon: Users,
      label: "Quarterly Conversations",
      path: "/eos/qc",
    },
  ],
  advanced: [
    {
      icon: FileCode,
      label: "Templates",
      path: "/templates",
    },
    {
      icon: Blocks,
      label: "Frameworks",
      path: "/frameworks",
    },
    {
      icon: ScrollText,
      label: "Audit Logs",
      path: "/audit-logs",
    },
    {
      icon: Flag,
      label: "Flags",
      path: "/flags",
    },
    {
      icon: AlertTriangle,
      label: "Risks",
      path: "/risks",
    },
    {
      icon: Heart,
      label: "Health",
      path: "/health",
    },
    {
      icon: Wrench,
      label: "Tools",
      path: "/tools",
    },
  ],
};
export const DashboardLayout = ({ children }: { children: React.ReactNode }) => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showScrollIndicator, setShowScrollIndicator] = useState(false);
  const [sectionsOpen, setSectionsOpen] = useState({
    main: true,
    team: true,
    admin: true,
    eos: true,
    advanced: false,
  });
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const { isViewingAsClient } = useViewMode();
  const navRef = useRef<HTMLElement>(null);
  const scrollPositionRef = useRef<number>(0);

  // Preserve sidebar scroll position on route changes
  useLayoutEffect(() => {
    // Restore scroll position synchronously after render
    if (navRef.current && scrollPositionRef.current > 0) {
      navRef.current.scrollTop = scrollPositionRef.current;
    }
  }, [location.pathname]);

  // Save scroll position before navigation
  const saveScrollPosition = () => {
    if (navRef.current) {
      scrollPositionRef.current = navRef.current.scrollTop;
    }
  };

  // Check if nav content is scrollable
  const checkScrollable = (e: React.UIEvent<HTMLElement>) => {
    const element = e.currentTarget;
    const hasScroll = element.scrollHeight > element.clientHeight;
    const isAtBottom = element.scrollHeight - element.scrollTop <= element.clientHeight + 10;
    setShowScrollIndicator(hasScroll && !isAtBottom);
  };

  // Determine menu items and groups based on user role (or view mode)
  const { menuItems, isGrouped, effectiveRole } = useMemo(() => {
    const role = (profile?.unicorn_role || "User") as any;
    
    // If Super Admin or Team Leader is viewing as client, show Admin menu
    if (isViewingAsClient && (role === "Super Admin" || role === "Team Leader" || role === "Team Member")) {
      return {
        menuItems: adminMenuItems,
        isGrouped: true,
        effectiveRole: "Admin",
      };
    }
    
    switch (role) {
      case "Super Admin":
      case "Team Leader":
      case "Team Member":
        return {
          menuItems: superAdminMenuItems,
          isGrouped: true,
          effectiveRole: role,
        };
      case "Admin":
        return {
          menuItems: adminMenuItems,
          isGrouped: true,
          effectiveRole: role,
        };
      default:
        return {
          menuItems: userMenuItems,
          isGrouped: true,
          effectiveRole: role,
        };
    }
  }, [profile?.unicorn_role, isViewingAsClient]);
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
  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar */}
      <aside
        className={`${sidebarOpen ? "w-64" : "w-20"} border-r border-border/20 transition-all duration-300 flex flex-col fixed left-0 top-0 h-screen z-30`}
        style={{
          backgroundImage: "linear-gradient(135deg, rgb(97 9 161) 0%, rgb(213 28 73) 100%)",
        }}
      >
        {/* Logo/Brand */}
        {/* Logo/Brand or User Profile - Show user profile for Admin/User OR when viewing as client */}
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
                      <AvatarImage src={profile?.avatar_url || ""} alt={profile?.first_name || "User"} className="object-cover" />
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
                    <span className={`h-1.5 w-1.5 rounded-full ${isViewingAsClient ? 'bg-purple-400' : 'bg-emerald-400'} animate-pulse`}></span>
                    <span className="text-xs font-medium text-white/90 uppercase tracking-wide">
                      {isViewingAsClient ? "Client View" : (profile?.unicorn_role || "User")}
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
            {sidebarOpen ? (
              <div className="flex flex-col gap-1">
                <h1 className="text-xl font-bold text-white">Unicorn 2.0</h1>
                <Badge
                  className="px-2 py-0.5 w-fit bg-white border-0"
                  style={{
                    color: getRoleBadgeColor(profile?.unicorn_role || "User"),
                    fontWeight: "bold",
                    fontSize: "11px",
                  }}
                >
                  {profile?.unicorn_role || "User"}
                </Badge>
              </div>
            ) : null}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors text-white"
            >
              {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        )}

        {/* Menu Items */}
        <nav ref={navRef} className="flex-1 py-4 overflow-y-auto scrollbar-hide relative" onScroll={checkScrollable}>
          {isGrouped && typeof menuItems === "object" && "main" in menuItems ? (
            <>
              {/* Main Section */}
              <Collapsible
                open={sectionsOpen.main}
                onOpenChange={(open) => setSectionsOpen((prev) => ({ ...prev, main: open }))}
              >
                {sidebarOpen && (
                  <CollapsibleTrigger className="flex items-center justify-between w-full px-4 mb-2 hover:bg-white/5 py-2 rounded transition-colors">
                    <p className="text-xs font-semibold text-white/70 uppercase tracking-wider">Main</p>
                    {sectionsOpen.main ? (
                      <ChevronDown className="w-3 h-3 text-white/70" />
                    ) : (
                      <ChevronRight className="w-3 h-3 text-white/70" />
                    )}
                  </CollapsibleTrigger>
                )}
                <CollapsibleContent>
                  {menuItems.main.map((item) => {
                    const Icon = item.icon;
                    const isActive = location.pathname === item.path;
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        onClick={saveScrollPosition}
                        className={`flex items-center gap-2 px-4 mx-2 mb-1 transition-colors text-sm rounded-full ${isActive ? "bg-white/10 border border-white/20 text-white" : "text-white/80 hover:bg-white/10 hover:text-white"}`}
                        style={{
                          paddingTop: "10px",
                          paddingBottom: "10px",
                        }}
                      >
                        <Icon className="w-4 h-4 flex-shrink-0" />
                        {sidebarOpen && <span className="font-medium">{item.label}</span>}
                      </Link>
                    );
                  })}
                </CollapsibleContent>
              </Collapsible>

              {/* Manage Team Section (for Admin) */}
              {"team" in menuItems && Array.isArray(menuItems.team) && menuItems.team.length > 0 && (
                <Collapsible
                  open={sectionsOpen.team}
                  onOpenChange={(open) => setSectionsOpen((prev) => ({ ...prev, team: open }))}
                  className="mt-6"
                >
                  {sidebarOpen && (
                    <CollapsibleTrigger className="flex items-center justify-between w-full px-4 mb-2 hover:bg-white/5 py-2 rounded transition-colors">
                      <p className="text-xs font-semibold text-white/70 uppercase tracking-wider">Manage Team</p>
                      {sectionsOpen.team ? (
                        <ChevronDown className="w-3 h-3 text-white/70" />
                      ) : (
                        <ChevronRight className="w-3 h-3 text-white/70" />
                      )}
                    </CollapsibleTrigger>
                  )}
                  <CollapsibleContent>
                    {menuItems.team.map((item: any) => {
                      const Icon = item.icon;
                      const isActive = location.pathname === item.path;
                      return (
                        <Link
                          key={item.path}
                          to={item.path}
                          onClick={saveScrollPosition}
                          className={`flex items-center gap-2 px-4 mx-2 mb-1 transition-colors text-sm rounded-full ${isActive ? "bg-white/10 border border-white/20 text-white" : "text-white/80 hover:bg-white/10 hover:text-white"}`}
                          style={{
                            paddingTop: "10px",
                            paddingBottom: "10px",
                          }}
                        >
                          <Icon className="w-4 h-4 flex-shrink-0" />
                          {sidebarOpen && <span className="font-medium">{item.label}</span>}
                        </Link>
                      );
                    })}
                  </CollapsibleContent>
                </Collapsible>
              )}

              {/* Admin Section (for Super Admin only) */}
              {"admin" in menuItems &&
                Array.isArray(menuItems.admin) &&
                menuItems.admin.length > 0 &&
                profile?.unicorn_role === "Super Admin" && (
                  <Collapsible
                    open={sectionsOpen.admin}
                    onOpenChange={(open) => setSectionsOpen((prev) => ({ ...prev, admin: open }))}
                    className="mt-6"
                  >
                    {sidebarOpen && (
                      <CollapsibleTrigger className="flex items-center justify-between w-full px-4 mb-2 hover:bg-white/5 py-2 rounded transition-colors">
                        <p className="text-xs font-semibold text-white/70 uppercase tracking-wider">Administration</p>
                        {sectionsOpen.admin ? (
                          <ChevronDown className="w-3 h-3 text-white/70" />
                        ) : (
                          <ChevronRight className="w-3 h-3 text-white/70" />
                        )}
                      </CollapsibleTrigger>
                    )}
                    <CollapsibleContent>
                      {menuItems.admin.map((item: any) => {
                        const Icon = item.icon;
                        const isActive = location.pathname === item.path;
                        return (
                          <Link
                            key={item.path}
                            to={item.path}
                            onClick={saveScrollPosition}
                            className={`flex items-center gap-2 px-4 mx-2 mb-1 transition-colors text-sm rounded-full ${isActive ? "bg-white/10 border border-white/20 text-white" : "text-white/80 hover:bg-white/10 hover:text-white"}`}
                            style={{
                              paddingTop: "10px",
                              paddingBottom: "10px",
                            }}
                          >
                            <Icon className="w-4 h-4 flex-shrink-0" />
                            {sidebarOpen && <span className="font-medium">{item.label}</span>}
                          </Link>
                        );
                      })}
                    </CollapsibleContent>
                  </Collapsible>
                )}

              {/* EOS Section (for Super Admin) */}
              {"eos" in menuItems && Array.isArray(menuItems.eos) && menuItems.eos.length > 0 && (
                <Collapsible
                  open={sectionsOpen.eos}
                  onOpenChange={(open) => setSectionsOpen((prev) => ({ ...prev, eos: open }))}
                  className="mt-6"
                >
                  {sidebarOpen && (
                    <CollapsibleTrigger className="flex items-center justify-between w-full px-4 mb-2 hover:bg-white/5 py-2 rounded transition-colors">
                      <p className="text-xs font-semibold text-white/70 uppercase tracking-wider">EOS</p>
                      {sectionsOpen.eos ? (
                        <ChevronDown className="w-3 h-3 text-white/70" />
                      ) : (
                        <ChevronRight className="w-3 h-3 text-white/70" />
                      )}
                    </CollapsibleTrigger>
                  )}
                  <CollapsibleContent>
                    {menuItems.eos.map((item: any) => {
                      const Icon = item.icon;
                      const isActive = location.pathname === item.path;
                      return (
                        <Link
                          key={item.path}
                          to={item.path}
                          onClick={saveScrollPosition}
                          className={`flex items-center gap-2 px-4 mx-2 mb-1 transition-colors text-sm rounded-full ${isActive ? "bg-white/10 border border-white/20 text-white" : "text-white/80 hover:bg-white/10 hover:text-white"}`}
                          style={{
                            paddingTop: "10px",
                            paddingBottom: "10px",
                          }}
                        >
                          <Icon className="w-4 h-4 flex-shrink-0" />
                          {sidebarOpen && <span className="font-medium">{item.label}</span>}
                        </Link>
                      );
                    })}
                  </CollapsibleContent>
                </Collapsible>
              )}

              {/* Advanced Features Section (for Super Admin) */}
              {"advanced" in menuItems && Array.isArray(menuItems.advanced) && menuItems.advanced.length > 0 && (
                <Collapsible
                  open={sectionsOpen.advanced}
                  onOpenChange={(open) => setSectionsOpen((prev) => ({ ...prev, advanced: open }))}
                  className="mt-6"
                >
                  {sidebarOpen && (
                    <CollapsibleTrigger className="flex items-center justify-between w-full px-4 mb-2 hover:bg-white/5 py-2 rounded transition-colors">
                      <p className="text-xs font-semibold text-white/70 uppercase tracking-wider">Advanced Features</p>
                      {sectionsOpen.advanced ? (
                        <ChevronDown className="w-3 h-3 text-white/70" />
                      ) : (
                        <ChevronRight className="w-3 h-3 text-white/70" />
                      )}
                    </CollapsibleTrigger>
                  )}
                  <CollapsibleContent>
                    {menuItems.advanced.map((item: any) => {
                      const Icon = item.icon;
                      const isActive = location.pathname === item.path;
                      return (
                        <Link
                          key={item.path}
                          to={item.path}
                          onClick={saveScrollPosition}
                          className={`flex items-center gap-2 px-4 mx-2 mb-1 transition-colors text-sm rounded-full ${isActive ? "bg-white/10 border border-white/20 text-white" : "text-white/80 hover:bg-white/10 hover:text-white"}`}
                          style={{
                            paddingTop: "10px",
                            paddingBottom: "10px",
                          }}
                        >
                          <Icon className="w-4 h-4 flex-shrink-0" />
                          {sidebarOpen && <span className="font-medium">{item.label}</span>}
                        </Link>
                      );
                    })}
                  </CollapsibleContent>
                </Collapsible>
              )}
            </>
          ) : null}
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
      <div className={`${sidebarOpen ? "ml-64" : "ml-20"} flex flex-col min-h-screen transition-all duration-300`}>
        {/* Top Bar */}
        <header className="h-16 bg-card border-b border-border flex items-center justify-between px-6 sticky top-0 z-20">
          <div className="flex items-center gap-4">
            <img src={unicornLogo} alt="Unicorn 2.0" className="h-16" />
          </div>

          <div className="flex items-center gap-4">
            {/* Notification Bell */}
            <NotificationDropdown />

            {/* User Menu with Dropdown */}
            {(profile?.unicorn_role === "Admin" || profile?.unicorn_role === "User") ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="group bg-white transition-all duration-200 hover:bg-white hover:scale-105 hover:shadow-md"
                    style={{ boxShadow: 'rgba(0, 0, 0, 0.02) 0px 1px 3px 0px, rgba(27, 31, 35, 0.15) 0px 0px 0px 1px' }}
                  >
                    <Settings className="h-4 w-4 text-foreground animate-[spin_3s_linear_infinite]" />
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
                    className="cursor-pointer text-red-500 focus:text-red-500 focus:bg-transparent" 
                    onClick={signOut}
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Logout</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="group bg-white transition-all duration-200 hover:bg-white hover:scale-105 hover:shadow-md"
                    style={{ boxShadow: 'rgba(0, 0, 0, 0.02) 0px 1px 3px 0px, rgba(27, 31, 35, 0.15) 0px 0px 0px 1px' }}
                  >
                    <Settings className="h-4 w-4 text-foreground animate-[spin_3s_linear_infinite]" />
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
                  <DropdownMenuItem className="cursor-pointer text-destructive focus:text-destructive" onClick={signOut}>
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Logout</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-6 overflow-y-auto">{children}</main>

        {/* Footer */}
        <Footer />
      </div>
    </div>
  );
};
