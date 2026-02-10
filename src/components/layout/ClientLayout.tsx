import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  FileText,
  Library,
  Calendar,
  Bell,
  BarChart3,
  Users,
  HelpCircle,
  Menu,
  X,
  MessageCircle,
  Headphones,
  Search,
  Settings,
  LogOut,
  Bot,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { useNotifications } from "@/hooks/useNotifications";
import { ClientTenantProvider, useClientTenant } from "@/contexts/ClientTenantContext";
import { HelpCenterProvider, HelpCenterDrawer, useHelpCenter } from "@/components/help-center";
import { ClientFooter } from "@/components/client/ClientFooter";
import { ImpersonationBanner } from "@/components/client/ImpersonationBanner";
import { FloatingChatbot } from "@/components/help-center/FloatingChatbot";
import { cn } from "@/lib/utils";
import vivacityLogo from "@/assets/vivacity-logo.svg";

const clientMenuItems = [
  { icon: LayoutDashboard, label: "Home", path: "/client/home" },
  { icon: FileText, label: "Documents", path: "/client/documents" },
  { icon: Library, label: "Resource Hub", path: "/client/resource-hub" },
  { icon: Calendar, label: "Calendar", path: "/client/calendar" },
  { icon: Bell, label: "Notifications", path: "/client/notifications" },
  { icon: BarChart3, label: "Reports", path: "/client/reports" },
  { icon: Users, label: "Team", path: "/client/users" },
];

const sidebarFooterItems = [
  { icon: Bot, label: "Help", tab: "chatbot" as const },
  { icon: MessageCircle, label: "Message CSC", tab: "csc" as const },
  { icon: Headphones, label: "Support", tab: "support" as const },
];

function ClientLayoutInner({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const location = useLocation();
  const { profile, signOut } = useAuth();
  const { tenantName, isPreview } = useClientTenant();
  const { openHelpCenter } = useHelpCenter();
  const { unreadCount, notifications } = useNotifications();

  const getInitials = () => {
    if (profile?.first_name && profile?.last_name) {
      return `${profile.first_name[0]}${profile.last_name[0]}`.toUpperCase();
    }
    return (profile?.email?.split("@")[0] || "U").substring(0, 2).toUpperCase();
  };

  const getUserDisplayName = () => {
    if (profile?.first_name && profile?.last_name) {
      return `${profile.first_name} ${profile.last_name}`;
    }
    return profile?.email?.split("@")[0] || "User";
  };

  const sidebarWidth = sidebarOpen ? "w-60" : "w-16";

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      {/* Impersonation Banner */}
      {isPreview && <ImpersonationBanner />}

      {/* Mobile sidebar toggle */}
      <button
        onClick={() => setSidebarOpen(true)}
        className={`fixed top-4 left-4 z-40 p-2 rounded-lg bg-white/20 text-white shadow-lg md:hidden ${sidebarOpen ? "hidden" : "flex"} items-center justify-center min-w-[44px] min-h-[44px]`}
        aria-label="Open sidebar"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Left Sidebar — gradient background */}
      <aside
        className={cn(
          "transition-all duration-300 flex flex-col fixed left-0 h-screen z-30",
          isPreview ? "top-12" : "top-0",
          sidebarOpen ? "w-60" : "w-16",
          "max-md:w-[85vw] max-md:max-w-72",
          !sidebarOpen && "max-md:-translate-x-full"
        )}
        style={{
          background: "linear-gradient(180deg, hsl(270 55% 41%) 0%, hsl(330 86% 51%) 100%)",
        }}
      >
        {/* Sidebar Header */}
        <div className="px-3 pt-4 pb-3 border-b border-white/15 flex items-center justify-between">
          {sidebarOpen ? (
            <>
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-medium text-white/60 uppercase tracking-wider">
                  Client Portal
                </span>
                {tenantName && (
                  <span className="text-sm font-semibold text-white truncate max-w-[160px]">
                    {tenantName}
                  </span>
                )}
              </div>
              <button
                onClick={() => setSidebarOpen(false)}
                className="p-1.5 rounded-full hover:bg-white/10 text-white/70 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </>
          ) : (
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-lg hover:bg-white/10 text-white/70 transition-colors mx-auto"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Nav Items */}
        <nav className="flex-1 py-4 overflow-y-auto scrollbar-hide">
          {clientMenuItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "flex items-center gap-3 mx-2 mb-1 transition-all text-sm rounded-lg min-h-[44px] relative",
                  sidebarOpen ? "px-4" : "px-0 justify-center",
                  isActive
                    ? "bg-white/15 text-white font-semibold"
                    : "text-white/80 hover:bg-white/10 hover:text-white"
                )}
                style={{ paddingTop: "10px", paddingBottom: "10px" }}
              >
                {/* Active indicator bar */}
                {isActive && (
                  <div
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-r-full"
                    style={{ backgroundColor: "hsl(189 74% 50%)" }}
                  />
                )}
                <Icon
                  className="w-[18px] h-[18px] flex-shrink-0"
                  style={{
                    color: isActive
                      ? "hsl(189 74% 50%)"  /* brand-cyan */
                      : "currentColor",
                  }}
                />
                {sidebarOpen && (
                  <span className="leading-snug break-words hyphens-auto">
                    {item.label}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Sidebar Footer Actions */}
        <div className="border-t border-white/15 py-3 px-2 space-y-1">
          {sidebarFooterItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.tab}
                onClick={() => openHelpCenter(item.tab)}
                className={cn(
                  "flex items-center gap-3 w-full transition-colors text-sm rounded-lg min-h-[40px] text-white/70 hover:bg-white/10 hover:text-white",
                  sidebarOpen ? "px-4" : "px-0 justify-center"
                )}
              >
                <Icon className="w-[18px] h-[18px] flex-shrink-0" />
                {sidebarOpen && <span>{item.label}</span>}
              </button>
            );
          })}
        </div>
      </aside>

      {/* Main Content */}
      <div
        className={cn(
          "flex flex-col min-h-screen w-full min-w-0 transition-all duration-300 overflow-x-hidden",
          sidebarOpen ? "md:pl-60" : "md:pl-16",
          "pl-0"
        )}
      >
        {/* Top Bar */}
        <header
          className="h-14 bg-card border-b flex items-center justify-between px-4 md:px-6 sticky z-20"
          style={{
            top: isPreview ? "48px" : "0",
            borderColor: "hsl(270 20% 88%)",
          }}
        >
          {/* Left: Tenant name + plan pill */}
          <div className="flex items-center gap-3 min-w-0 flex-shrink-0">
            <img src={vivacityLogo} alt="Vivacity" className="h-7 w-auto" />
          </div>

          {/* Center: Search */}
          <div className="flex-1 max-w-md mx-4 hidden md:block">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search documents, resources, and notifications…"
                className="pl-9 h-9 text-sm border bg-background"
                style={{
                  borderColor: "hsl(270 20% 88%)",
                }}
              />
            </div>
          </div>

          {/* Right: Notifications + Help + Profile */}
          <div className="flex items-center gap-1 flex-shrink-0 ml-2">
            {/* Help */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => openHelpCenter("chatbot")}
              className="h-9 w-9 text-muted-foreground hover:text-foreground"
            >
              <HelpCircle className="h-4 w-4" />
            </Button>

            {/* Notifications */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9 relative text-muted-foreground hover:text-foreground">
                  <Bell className="h-4 w-4" />
                  {unreadCount > 0 && (
                    <span
                      className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full text-[10px] font-bold flex items-center justify-center text-white"
                      style={{ backgroundColor: "hsl(330 86% 51%)" }}
                    >
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 p-0">
                <div className="p-3 border-b" style={{ borderColor: "hsl(270 20% 88%)" }}>
                  <h3 className="text-sm font-semibold" style={{ color: "hsl(270 55% 41%)" }}>
                    Notifications
                  </h3>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <p className="text-sm text-muted-foreground p-4 text-center">
                      No unread notifications
                    </p>
                  ) : (
                    notifications.slice(0, 5).map((n: any) => (
                      <div key={n.id} className="px-3 py-2 border-b last:border-0 hover:bg-muted/50 transition-colors" style={{ borderColor: "hsl(270 20% 88%)" }}>
                        <p className="text-sm" style={{ color: "hsl(270 47% 26%)" }}>{n.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{n.message?.slice(0, 60)}</p>
                      </div>
                    ))
                  )}
                </div>
                <div className="p-2 border-t" style={{ borderColor: "hsl(270 20% 88%)" }}>
                  <Button variant="ghost" size="sm" className="w-full text-xs" asChild>
                    <Link to="/client/notifications">View all notifications</Link>
                  </Button>
                </div>
              </PopoverContent>
            </Popover>

            {/* Profile dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-9 w-9 rounded-full p-0 ml-1">
                  <Avatar className="h-8 w-8 border-2" style={{ borderColor: "hsl(270 20% 88%)" }}>
                    <AvatarImage src={profile?.avatar_url || ""} alt={getUserDisplayName()} />
                    <AvatarFallback
                      className="text-xs font-semibold"
                      style={{
                        backgroundColor: "hsl(270 20% 88%)",
                        color: "hsl(270 55% 41%)",
                      }}
                    >
                      {getInitials()}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium">{getUserDisplayName()}</p>
                    <p className="text-xs text-muted-foreground truncate">{profile?.email}</p>
                    <Badge variant="outline" className="w-fit text-xs">
                      {profile?.unicorn_role || "User"}
                    </Badge>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/settings?tab=profile" className="flex items-center">
                    <Settings className="mr-2 h-4 w-4" />
                    Profile Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={signOut}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 w-full min-w-0 p-4 md:p-6 overflow-y-auto">
          {children}
        </main>

        {/* Footer */}
        <ClientFooter />

        {/* Floating Chatbot */}
        <FloatingChatbot />
      </div>

      {/* Help Center Drawer */}
      <HelpCenterDrawer />
    </div>
  );
}

export function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClientTenantProvider>
      <HelpCenterProvider>
        <ClientLayoutInner>{children}</ClientLayoutInner>
      </HelpCenterProvider>
    </ClientTenantProvider>
  );
}
